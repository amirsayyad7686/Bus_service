#include <Wire.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "page.h"

// ==================== Pin config ====================
#define I2C_SDA   21
#define I2C_SCL   22
#define MC60_RX   18
#define MC60_TX   19
#define MC60_BAUD 115200

// ==================== Power / status pins ====================
#define PIN_LM66200_ST   4      // LM66200 ST status (open-drain, needs pull-up)
#define PIN_SM5308_LED2  23     // SM5308 LED2 (input from SoC)
// GPIO36 = SENSOR_VP (ADC1_CH0) — hardware fixed on WROOM-D32

// ==================== Remote GPIO control ====================
// NOTE: IO4 removed — used by LM66200 ST
const int REMOTE_PINS[]    = {2, 5, 32, 33};
const int REMOTE_PIN_COUNT = sizeof(REMOTE_PINS) / sizeof(REMOTE_PINS[0]);
int       gpioState[8]     = {0,0,0,0,0,0,0,0};

String    pendingAck;

// ==================== Extended TCP state ====================
enum TcpState { TCP_IDLE, TCP_WAIT_PROMPT, TCP_WAIT_SENDOK, TCP_SENT_WAIT, TCP_WAIT_READ };

// ==================== I2C devices ====================
#define MPU_ADDR         0x69
#define MAG_ADDR         0x2C
#define MPU_ACCEL_XOUT_H 0x3B
#define MPU_GYRO_XOUT_H  0x43
#define MPU_PWR_MGMT_1   0x6B
#define ACCEL_SCALE      16384.0
#define GYRO_SCALE       131.0

#define QMC_DATA_X_LSB   0x00
#define QMC_CTRL_1       0x0A
#define QMC_MODE         0x09
#define MAG_SCALE        0.92

// ==================== Network ====================
const char* AP_SSID     = "ESP32_3D";
const char* AP_PASS     = "12345678";
const char* APN         = "mtnirancell";
const char* SERVER_IP   = "181.41.194.124";
const uint16_t SERVER_PORT = 5202;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// ==================== Sensor calibration ====================
double accelOffsetX = 0, accelOffsetY = 0, accelOffsetZ = 0;
double magMinX = 0, magMaxX = 0, magMinY = 0, magMaxY = 0, magMinZ = 0, magMaxZ = 0;
bool resetRequested = false;

// ==================== Shared state ====================
volatile double g_pitch = 0, g_roll = 0, g_yaw = 0;
volatile double g_gx = 0, g_gy = 0, g_gz = 0;
volatile double g_ax = 0, g_ay = 0, g_az = 0;

// ==================== Power status cache ====================
volatile int   statusSt    = -1;
volatile int   statusLed2  = -1;
volatile int   statusVpRaw = 0;
volatile float statusVpV   = 0.0f;

// ==================== MC60 serial buffers ====================
String serialBuffer;
String lineBuffer;
portMUX_TYPE bufferMux = portMUX_INITIALIZER_UNLOCKED;

// ==================== GPS cache ====================
volatile double gpsLat = 0, gpsLon = 0;
volatile double gpsSpeed = 0;
volatile bool   gpsValid = false;
bool            gnssEnabled = false;
unsigned long   lastGpsQuery = 0;
const unsigned long GPS_QUERY_MS = 3000;

// ==================== TCP state ====================
TcpState tcpState = TCP_IDLE;
String   tcpPayload;
String   peekBuffer;
unsigned long tcpStateSince = 0;

// ==================== Auto-send ====================
bool autoSendEnabled = false;
unsigned long lastAutoSend = 0;
unsigned long sendOkCount = 0, sendFailCount = 0;
const unsigned long AUTO_SEND_MS = 1000;

// ==================== Debug ====================
unsigned long lastSerialPrint = 0;

// ==================== Auto-connect state machine ====================
uint8_t       autoPhase = 0;
unsigned long autoPhaseStart = 0;

// ==================== Command queue ====================
#define QUEUE_MAX 24
String cmdQueue[QUEUE_MAX];
volatile int qHead = 0, qTail = 0;
unsigned long lastCmdTime = 0;
const unsigned long CMD_GAP_MS = 350;

// ==================================================================
//  POWER STATUS FUNCTIONS
// ==================================================================
void initStatusPins() {
  pinMode(PIN_LM66200_ST, INPUT_PULLUP);   // open-drain ST needs a pull-up
  pinMode(PIN_SM5308_LED2, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(36, ADC_11db);   // 0–3.3 V range on VP
  Serial.println("[STATUS] pins initialized (LM66200 ST=IO4, LED2=IO23, VP=IO36)");
}

void readStatusPins() {
  statusSt    = digitalRead(PIN_LM66200_ST);
  statusLed2  = digitalRead(PIN_SM5308_LED2);
  statusVpRaw = analogRead(36);
  statusVpV   = statusVpRaw * 3.3f / 4095.0f;
}

// ==================================================================
//  REMOTE GPIO CONTROL
// ==================================================================
void initRemoteGpio() {
  for (int i = 0; i < REMOTE_PIN_COUNT; i++) {
    pinMode(REMOTE_PINS[i], OUTPUT);
    digitalWrite(REMOTE_PINS[i], LOW);
    gpioState[i] = 0;
  }
  Serial.printf("[GPIO] initialized %d remote pins\n", REMOTE_PIN_COUNT);
}

void handleIncomingCommand(const String& line) {
  Serial.printf("[CMD] received: %s\n", line.c_str());
  if (!line.startsWith("CMD:GPIO:")) return;

  int c1 = line.indexOf(':', 7);
  if (c1 < 0) return;
  int c2 = line.indexOf(':', c1 + 1);
  if (c2 < 0) return;

  int pin   = line.substring(c1 + 1, c2).toInt();
  int state = line.substring(c2 + 1).toInt();

  int idx = -1;
  for (int i = 0; i < REMOTE_PIN_COUNT; i++) {
    if (REMOTE_PINS[i] == pin) { idx = i; break; }
  }
  if (idx < 0) {
    Serial.printf("[CMD] unknown pin %d\n", pin);
    pendingAck = "client23832:ACK:GPIO:" + String(pin) + ":ERR";
    return;
  }

  digitalWrite(REMOTE_PINS[idx], state ? HIGH : LOW);
  gpioState[idx] = state ? 1 : 0;
  Serial.printf("[GPIO] pin %d -> %d\n", pin, state);

  pendingAck = "client23832:ACK:GPIO:" + String(pin) + ":" + String(state);
}

// ==================================================================
//  SENSOR FUNCTIONS
// ==================================================================
bool readBytes(uint8_t addr, uint8_t reg, uint8_t *buffer, uint8_t len) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom(addr, len);
  uint8_t i = 0;
  while (Wire.available() && i < len) buffer[i++] = Wire.read();
  return (i == len);
}

void readMPU(double &ax, double &ay, double &az) {
  uint8_t buf[6];
  if (readBytes(MPU_ADDR, MPU_ACCEL_XOUT_H, buf, 6)) {
    int16_t rawAX = (buf[0] << 8) | buf[1];
    int16_t rawAY = (buf[2] << 8) | buf[3];
    int16_t rawAZ = (buf[4] << 8) | buf[5];
    ax = rawAX / ACCEL_SCALE - accelOffsetX;
    ay = rawAY / ACCEL_SCALE - accelOffsetY;
    az = rawAZ / ACCEL_SCALE - accelOffsetZ;
  } else ax = ay = az = 0;
}

void readGYRO(double &gx, double &gy, double &gz) {
  uint8_t buf[6];
  if (readBytes(MPU_ADDR, MPU_GYRO_XOUT_H, buf, 6)) {
    int16_t rawGX = (buf[0] << 8) | buf[1];
    int16_t rawGY = (buf[2] << 8) | buf[3];
    int16_t rawGZ = (buf[4] << 8) | buf[5];
    gx = rawGX / GYRO_SCALE;
    gy = rawGY / GYRO_SCALE;
    gz = rawGZ / GYRO_SCALE;
  } else gx = gy = gz = 0;
}

void readMAG(double &mx, double &my, double &mz) {
  uint8_t buf[6];
  if (readBytes(MAG_ADDR, QMC_DATA_X_LSB, buf, 6)) {
    int16_t x = (int16_t)(buf[0] | (buf[1] << 8));
    int16_t y = (int16_t)(buf[2] | (buf[3] << 8));
    int16_t z = (int16_t)(buf[4] | (buf[5] << 8));
    mx = (x - (magMinX + magMaxX) / 2.0) * MAG_SCALE;
    my = (y - (magMinY + magMaxY) / 2.0) * MAG_SCALE;
    mz = (z - (magMinZ + magMaxZ) / 2.0) * MAG_SCALE;
  } else mx = my = mz = 0;
}

void calibrateMPU() {
  Serial.println("Calibrating MPU...");
  double ax, ay, az, sX = 0, sY = 0, sZ = 0;
  const int N = 100;
  for (int i = 0; i < N; i++) {
    readMPU(ax, ay, az);
    sX += ax; sY += ay; sZ += az;
    delay(10);
  }
  accelOffsetX = sX / N;
  accelOffsetY = sY / N;
  accelOffsetZ = sZ / N - 1.0;
}

void calibrateMAG() {
  Serial.println("Calibrating MAG - rotate device...");
  double mx, my, mz;
  magMinX = magMinY = magMinZ =  1e6;
  magMaxX = magMaxY = magMaxZ = -1e6;
  unsigned long start = millis();
  while (millis() - start < 10000) {
    readMAG(mx, my, mz);
    if (mx < magMinX) magMinX = mx;  if (mx > magMaxX) magMaxX = mx;
    if (my < magMinY) magMinY = my;  if (my > magMaxY) magMaxY = my;
    if (mz < magMinZ) magMinZ = mz;  if (mz > magMaxZ) magMaxZ = mz;
    delay(50);
  }
  Serial.println("MAG calibration done.");
}

void setupMPU() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_PWR_MGMT_1); Wire.write(0x00);
  Wire.endTransmission();
  delay(100);
}

void setupMAG() {
  Wire.beginTransmission(MAG_ADDR);
  Wire.write(QMC_CTRL_1); Wire.write(0x70);
  Wire.endTransmission();
  Wire.beginTransmission(MAG_ADDR);
  Wire.write(QMC_MODE); Wire.write(0x00);
  Wire.endTransmission();
  delay(100);
}

// ==================================================================
//  MC60 COMMAND QUEUE
// ==================================================================
void enqueue(const String& cmd) {
  int next = (qTail + 1) % QUEUE_MAX;
  if (next == qHead) return;
  cmdQueue[qTail] = cmd;
  qTail = next;
}

void pumpQueue() {
  if (qHead == qTail) return;
  if (millis() - lastCmdTime < CMD_GAP_MS) return;
  Serial2.print(cmdQueue[qHead]);
  Serial2.print("\r\n");
  qHead = (qHead + 1) % QUEUE_MAX;
  lastCmdTime = millis();
}

// ==================================================================
//  NMEA RMC PARSER
// ==================================================================
void parseRMC(const String& raw) {
  String line = raw;
  int star = line.indexOf('*');
  if (star > 0) line = line.substring(0, star);

  String p[12];
  int idx = 0, start = 0;
  for (int i = 0; i < (int)line.length() && idx < 12; i++) {
    if (line.charAt(i) == ',') { p[idx++] = line.substring(start, i); start = i + 1; }
  }
  if (idx < 12) p[idx] = line.substring(start);

  if (idx < 8) {
    Serial.println("[GPS] RMC parse: too few fields");
    return;
  }

  gpsSpeed = (p[7].length() > 0) ? p[7].toDouble() * 1.852 : 0.0;

  if (p[2] != "A") { gpsValid = false; return; }

  double lat = p[3].toDouble();
  double lon = p[5].toDouble();
  if (lat == 0 || lon == 0) { gpsValid = false; return; }

  int latDeg = (int)(lat / 100);
  double latMin = lat - latDeg * 100;
  double dLat = latDeg + latMin / 60.0;
  if (p[4] == "S") dLat = -dLat;

  int lonDeg = (int)(lon / 100);
  double lonMin = lon - lonDeg * 100;
  double dLon = lonDeg + lonMin / 60.0;
  if (p[6] == "W") dLon = -dLon;

  gpsLat = dLat;
  gpsLon = dLon;
  gpsValid = true;

  Serial.printf("[GPS] fix: %.6f, %.6f  speed=%.2f km/h\n",
                dLat, dLon, (double)gpsSpeed);
}

// ==================================================================
//  TCP STATE MACHINE
// ==================================================================
void startSend(const String& payload) {
  if (tcpState != TCP_IDLE) return;
  tcpPayload = payload;
  peekBuffer = "";
  Serial2.print("AT+QISEND\r\n");
  tcpState = TCP_WAIT_PROMPT;
  tcpStateSince = millis();
  Serial.printf("[TCP] QISEND start (%d bytes)\n", payload.length());
}

void tcpStateMachine() {
  switch (tcpState) {

    case TCP_WAIT_PROMPT:
      if (peekBuffer.indexOf(">") >= 0) {
        Serial2.print(tcpPayload);
        Serial2.print("\n");
        Serial2.write(0x1A);
        peekBuffer = "";
        tcpState = TCP_WAIT_SENDOK;
        tcpStateSince = millis();
      } else if (millis() - tcpStateSince > 3000) {
        peekBuffer = "";
        tcpState = TCP_IDLE;
        sendFailCount++;
        Serial.println("[TCP] no prompt, aborted");
      }
      break;

    case TCP_WAIT_SENDOK:
      if (peekBuffer.indexOf("SEND OK") >= 0 || peekBuffer.indexOf("+QISEND:") >= 0) {
        peekBuffer = "";
        tcpState = TCP_SENT_WAIT;
        tcpStateSince = millis();
        sendOkCount++;
      } else if (millis() - tcpStateSince > 8000) {
        peekBuffer = "";
        tcpState = TCP_IDLE;
        sendFailCount++;
        Serial.println("[TCP] SEND OK timeout");
      }
      break;

    case TCP_SENT_WAIT:
      if (millis() - tcpStateSince > 150) {
        Serial2.print("AT+QIRD=0,1500\r\n");
        peekBuffer = "";
        tcpState = TCP_WAIT_READ;
        tcpStateSince = millis();
      }
      break;

    case TCP_WAIT_READ:
      if (peekBuffer.indexOf("CMD:GPIO:") >= 0 && peekBuffer.indexOf("\n") >= 0) {
        int start = peekBuffer.indexOf("CMD:GPIO:");
        int end   = peekBuffer.indexOf("\n", start);
        if (end < 0) end = peekBuffer.length();
        String cmd = peekBuffer.substring(start, end);
        cmd.trim();
        handleIncomingCommand(cmd);
        peekBuffer = "";
        tcpState = TCP_IDLE;
      } else if (millis() - tcpStateSince > 3000) {
        peekBuffer = "";
        tcpState = TCP_IDLE;
      }
      break;

    default: break;
  }
}

// ==================================================================
//  AUTO-CONNECT STATE MACHINE
// ==================================================================
void autoConnectTick() {
  unsigned long now = millis();
  unsigned long elapsed = now - autoPhaseStart;

  switch (autoPhase) {

    // 0. Wait for MC60 to finish booting
    case 0:
      if (elapsed > 3000) {
        Serial.println("[AUTO] phase 0: MC60 warm-up done");
        autoPhase = 1;
        autoPhaseStart = now;
      }
      break;

    // 1. Kick off SIM + network checks
    case 1:
      Serial.println("[AUTO] phase 1: checking SIM + network");
      enqueue("AT");
      enqueue("AT+CPIN?");
      enqueue("AT+CFUN=1");
      autoPhase = 2;
      autoPhaseStart = now;
      break;

    // 2. Wait for registration to settle, then start PDP
    case 2:
      if (elapsed > 25000) {
        Serial.println("[AUTO] phase 2: starting PDP setup");
        enqueue("AT+QIFGCNT=0");
        enqueue("AT+QICSGP=1,\"" + String(APN) + "\"");
        enqueue("AT+QIREGAPP");
        enqueue("AT+QIACT");
        enqueue("AT+QILOCIP");
        autoPhase = 3;
        autoPhaseStart = now;
      }
      break;

    // 3. Wait for PDP, then open the TCP socket
    case 3:
      if (elapsed > 8000) {
        Serial.println("[AUTO] phase 3: opening TCP socket");
        String openCmd = "AT+QIOPEN=\"TCP\",\"";
        openCmd += SERVER_IP;
        openCmd += "\",";
        openCmd += String(SERVER_PORT);
        enqueue(openCmd);
        autoPhase = 4;
        autoPhaseStart = now;
      }
      break;

    // 4. Wait for CONNECT OK, then enable auto-send
    case 4:
      if (elapsed > 5000) {
        Serial.println("[AUTO] phase 4: enabling auto-send @ 1 Hz");
        autoSendEnabled = true;
        lastAutoSend = millis();
        autoPhase = 5;
      }
      break;

    // 5. Steady state
    case 5:
    default:
      break;
  }
}

// ==================================================================
//  WEB HANDLERS
// ==================================================================
void handleRoot(AsyncWebServerRequest *req) {
  Serial.printf("[HTTP] serving index, heap=%u, html_len=%u\n",
                ESP.getFreeHeap(), strlen_P(INDEX_HTML));
  AsyncWebServerResponse *response = req->beginChunkedResponse(
    "text/html",
    [](uint8_t *buffer, size_t maxLen, size_t index) -> size_t {
      size_t total = strlen_P(INDEX_HTML);
      if (index >= total) return 0;
      size_t n = total - index;
      if (n > maxLen) n = maxLen;
      memcpy_P(buffer, INDEX_HTML + index, n);
      return n;
    });
  response->addHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response->addHeader("Pragma", "no-cache");
  req->send(response);
}

void handleData(AsyncWebServerRequest *req) {
  String out;
  portENTER_CRITICAL(&bufferMux);
  out = serialBuffer;
  serialBuffer = "";
  portEXIT_CRITICAL(&bufferMux);
  req->send(200, "text/plain", out);
}

void handleCmd(AsyncWebServerRequest *req) {
  if (!req->hasParam("c")) { req->send(400, "text/plain", "missing c"); return; }
  enqueue(req->getParam("c")->value());
  req->send(200, "text/plain", "queued");
}

void handleTcpSetup(AsyncWebServerRequest *req) {
  enqueue("AT+QIFGCNT=0");
  enqueue("AT+QICSGP=1,\"" + String(APN) + "\"");
  enqueue("AT+QIREGAPP");
  enqueue("AT+QIACT");
  enqueue("AT+QILOCIP");
  enqueue("AT+QISTATE?");
  req->send(200, "text/plain", "PDP setup queued");
}

void handleTcpOpen(AsyncWebServerRequest *req) {
  if (!req->hasParam("h") || !req->hasParam("p")) {
    req->send(400, "text/plain", "missing h/p"); return;
  }
  String h = req->getParam("h")->value();
  String p = req->getParam("p")->value();
  enqueue("AT+QIOPEN=\"TCP\",\"" + h + "\"," + p);
  req->send(200, "text/plain", "QIOPEN queued");
}

void handleTcpClose(AsyncWebServerRequest *req) {
  enqueue("AT+QICLOSE");
  req->send(200, "text/plain", "QICLOSE queued");
}

void handleTcpSend(AsyncWebServerRequest *req) {
  if (!req->hasParam("d")) { req->send(400, "text/plain", "missing d"); return; }
  startSend(req->getParam("d")->value());
  req->send(200, "text/plain", "sending");
}

void handleAuto(AsyncWebServerRequest *req) {
  autoSendEnabled = !autoSendEnabled;
  lastAutoSend = millis();
  req->send(200, "text/plain", autoSendEnabled ? "ON" : "OFF");
}

void handleStatus(AsyncWebServerRequest *req) {
  char buf[512];
  snprintf(buf, sizeof(buf),
    "{\"auto\":%d,\"ok\":%lu,\"fail\":%lu,\"busy\":%d,"
    "\"lat\":%.6f,\"lon\":%.6f,\"gps\":%d,\"speed\":%.2f,"
    "\"pitch\":%.2f,\"roll\":%.2f,\"yaw\":%.2f,"
    "\"gx\":%.2f,\"gy\":%.2f,\"gz\":%.2f,"
    "\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,"
    "\"st\":%d,\"led2\":%d,\"vp\":%d,\"phase\":%d}",
    autoSendEnabled ? 1 : 0,
    sendOkCount, sendFailCount,
    (tcpState != TCP_IDLE) ? 1 : 0,
    (double)gpsLat, (double)gpsLon, gpsValid ? 1 : 0, (double)gpsSpeed,
    g_pitch, g_roll, g_yaw,
    g_gx, g_gy, g_gz,
    g_ax, g_ay, g_az,
    statusSt, statusLed2, statusVpRaw, autoPhase);
  req->send(200, "application/json", buf);
}

// ==================================================================
//  WEBSOCKET
// ==================================================================
void onWsEvent(AsyncWebSocket *srv, AsyncWebSocketClient *cli,
               AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("WS client #%u connected\n", cli->id());
  } else if (type == WS_EVT_DATA) {
    String msg = String((char*)data);
    if (msg.startsWith("reset")) resetRequested = true;
  }
}

// ==================================================================
//  GNSS boot
// ==================================================================
void gnssBoot() {
  delay(2000);
  Serial.println("GNSS: checking state...");
  Serial2.print("AT+QGNSSC?\r\n");
  delay(500);
  Serial2.print("AT+QGNSSC=1\r\n");
  delay(500);
  Serial2.print("AT+QGNSSC?\r\n");
  gnssEnabled = true;
}

// ==================================================================
//  SETUP
// ==================================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== ESP32 + MC60 + Sensors ===");
  Serial.printf("Free heap at boot: %u\n", ESP.getFreeHeap());

  // Status pins first so they're readable throughout boot
  initStatusPins();
  readStatusPins();
  Serial.printf("[STATUS] ST=%d  LED2=%d  VP=%d (%.3f V)\n",
                statusSt, statusLed2, statusVpRaw, statusVpV);

  // Remote GPIO outputs
  initRemoteGpio();

  // I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);
  delay(50);

  Serial.println("Init MPU...");
  setupMPU();
  Serial.println("Init MAG...");
  setupMAG();

  Serial.println("Calibrating MPU...");
  calibrateMPU();
  Serial.println("Calibrating MAG (rotate)...");
  calibrateMAG();

  // MC60 UART + GNSS
  Serial2.begin(MC60_BAUD, SERIAL_8N1, MC60_RX, MC60_TX);
  gnssBoot();

  // WiFi AP + Web server
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  IPAddress ip = WiFi.softAPIP();
  Serial.print("AP IP: "); Serial.println(ip);

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  server.on("/",          HTTP_GET, handleRoot);
  server.on("/data",      HTTP_GET, handleData);
  server.on("/cmd",       HTTP_GET, handleCmd);
  server.on("/tcpsetup",  HTTP_GET, handleTcpSetup);
  server.on("/tcpopen",   HTTP_GET, handleTcpOpen);
  server.on("/tcpclose",  HTTP_GET, handleTcpClose);
  server.on("/tcpsend",   HTTP_GET, handleTcpSend);
  server.on("/auto",      HTTP_GET, handleAuto);
  server.on("/status",    HTTP_GET, handleStatus);

  Serial.printf("HTML length: %u bytes\n", strlen_P(INDEX_HTML));
  Serial.printf("Free heap before server.begin: %u\n", ESP.getFreeHeap());

  server.begin();
  Serial.println("HTTP server started. Open http://192.168.4.1");

  // Kick off the auto-connect sequence
  autoPhase      = 0;
  autoPhaseStart = millis();
  Serial.println("[AUTO] starting auto-connect sequence");

  Serial.printf("Free heap after setup: %u\n", ESP.getFreeHeap());
}

// ==================================================================
//  LOOP
// ==================================================================
void loop() {
  ws.cleanupClients();

  // 0. Status pins (read at ~5 Hz)
  static unsigned long lastStatusRead = 0;
  if (millis() - lastStatusRead >= 200) {
    lastStatusRead = millis();
    readStatusPins();
  }

  // 1. Read MC60
  while (Serial2.available()) {
    char c = (char)Serial2.read();

    portENTER_CRITICAL(&bufferMux);
    serialBuffer += c;
    if (serialBuffer.length() > 8192) serialBuffer.remove(0, 4096);
    portEXIT_CRITICAL(&bufferMux);

    if (tcpState != TCP_IDLE) {
      peekBuffer += c;
      if (peekBuffer.length() > 512) peekBuffer.remove(0, 256);
    }

    if (c == '\n') {
      String ln = lineBuffer;
      ln.trim();
      int rmc = ln.indexOf("$GNRMC");
      if (rmc < 0) rmc = ln.indexOf("$GPRMC");
      if (rmc >= 0) parseRMC(ln.substring(rmc));
      lineBuffer = "";
    } else {
      lineBuffer += c;
      if (lineBuffer.length() > 200) lineBuffer = "";
    }
  }

  tcpStateMachine();
  pumpQueue();

  // 2. Auto-connect sequence (runs until phase 5)
  if (autoPhase < 5) {
    autoConnectTick();
  }

  // 3. Reset request from web
  if (resetRequested) {
    resetRequested = false;
    calibrateMPU();
    calibrateMAG();
  }

  // 4. Sensor update @ ~20 Hz
  static unsigned long lastSensor = 0;
  if (micros() - lastSensor >= 50000) {
    lastSensor = micros();

    double ax, ay, az;
    readMPU(ax, ay, az);
    double pitchLocal = atan2(-ax, sqrt(ay*ay + az*az)) * 180.0 / PI;
    double rollLocal  = atan2(ay, az) * 180.0 / PI;

    double gx, gy, gz;
    readGYRO(gx, gy, gz);

    double mx, my, mz;
    readMAG(mx, my, mz);
    double yawLocal = atan2(my, mx) * 180.0 / PI;
    const double declinationDeg = -6.93;
    yawLocal += declinationDeg;
    if (yawLocal >  180) yawLocal -= 360;
    if (yawLocal < -180) yawLocal += 360;

    g_pitch = pitchLocal;
    g_roll  = rollLocal;
    g_yaw   = yawLocal;
    g_gx = gx; g_gy = gy; g_gz = gz;
    g_ax = ax; g_ay = ay; g_az = az;

    char buf[200];
    snprintf(buf, sizeof(buf),
      "{\"pitch\":%.2f,\"roll\":%.2f,\"yaw\":%.2f,"
      "\"gx\":%.2f,\"gy\":%.2f,\"gz\":%.2f,"
      "\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,"
      "\"st\":%d,\"led2\":%d,\"vp\":%d}",
      pitchLocal, rollLocal, yawLocal,
      gx, gy, gz,
      ax, ay, az,
      statusSt, statusLed2, statusVpRaw);
    ws.textAll(buf);
  }

  // 5. Periodic GPS query
  if (gnssEnabled && millis() - lastGpsQuery > GPS_QUERY_MS) {
    lastGpsQuery = millis();
    Serial2.print("AT+QGNSSRD=\"NMEA/RMC\"\r\n");
  }

  // 6. Auto-send
  if (autoSendEnabled && tcpState == TCP_IDLE &&
      millis() - lastAutoSend >= AUTO_SEND_MS) {
    lastAutoSend = millis();

    if (pendingAck.length() > 0) {
      Serial.printf("[TCP] sending ACK: %s\n", pendingAck.c_str());
      startSend(pendingAck);
      pendingAck = "";
    } else {
      char payload[260];
      snprintf(payload, sizeof(payload),
        "client23832:%.6f,%.6f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.3f,%.3f,%.3f,%.2f,%d,%d,%d,PULL",
        (double)gpsLat, (double)gpsLon,
        (double)g_pitch, (double)g_roll, (double)g_yaw,
        (double)g_gx, (double)g_gy, (double)g_gz,
        (double)g_ax, (double)g_ay, (double)g_az,
        (double)gpsSpeed,
        statusSt, statusVpRaw, statusLed2);
      startSend(String(payload));
    }
  }

  // 7. Debug print
  if (millis() - lastSerialPrint >= 1000) {
    lastSerialPrint = millis();
    Serial.printf("P=%.1f R=%.1f Y=%.1f | GPS=%s %.6f,%.6f spd=%.2f | ST=%d VP=%d LED2=%d | TCP ok=%lu fail=%lu auto=%d phase=%d | heap=%u\n",
      g_pitch, g_roll, g_yaw,
      gpsValid ? "OK" : "--",
      (double)gpsLat, (double)gpsLon, (double)gpsSpeed,
      statusSt, statusVpRaw, statusLed2,
      sendOkCount, sendFailCount, autoSendEnabled ? 1 : 0,
      autoPhase,
      ESP.getFreeHeap());
  }
}