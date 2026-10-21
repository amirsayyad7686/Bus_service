#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include "driver/i2s.h"
#include "lwip/sockets.h"

// ==================== WiFi ====================
const char* WIFI_SSID = "Amir";
const char* WIFI_PASS = "shirazamir35963";

// ==================== Node server ====================
const char* SERVER_HOST     = "181.41.194.124";
const uint16_t SERVER_PORT  = 5203;   // camera
const uint16_t AUDIO_PORT   = 5204;   // mic uplink
const uint16_t SPEAKER_PORT = 5205;   // speaker downlink

// ==================== Camera tuning ====================
#define FRAME_SIZE_    FRAMESIZE_QQVGA
#define JPEG_QUALITY_  20
#define XCLK_HZ_       20000000
#define CAMERA_MAX_FPS 10

// ==================== Camera pins ====================
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     15
#define SIOD_GPIO_NUM      4
#define SIOC_GPIO_NUM      5
#define Y9_GPIO_NUM       16
#define Y8_GPIO_NUM       17
#define Y7_GPIO_NUM       18
#define Y6_GPIO_NUM       12
#define Y5_GPIO_NUM       10
#define Y4_GPIO_NUM        8
#define Y3_GPIO_NUM        9
#define Y2_GPIO_NUM       11
#define VSYNC_GPIO_NUM     6
#define HREF_GPIO_NUM      7
#define PCLK_GPIO_NUM     13
// ======================================================

// ==================== I2S pins / params ====================
#define I2S_BCLK_GPIO   14
#define I2S_WS_GPIO     47
#define I2S_DIN_GPIO    38    // INMP441 SD
#define I2S_DOUT_GPIO   39    // MAX98357A DIN
#define SAMPLE_RATE     16000
#define CHUNK_SAMPLES   160
#define BATCH_CHUNKS    6
#define BATCH_SAMPLES   (CHUNK_SAMPLES * BATCH_CHUNKS)
// ==========================================================

WiFiClient camSocket;
WiFiClient audioSocket;
WiFiClient speakerSocket;

unsigned long frameCount = 0, failCount = 0;
unsigned long bytesSent  = 0;
unsigned long lastStat   = 0;
unsigned long lastFrames = 0;
unsigned long lastBytes  = 0;
unsigned long lastFrameMs = 0;

static bool   micReady    = false;
int32_t       s_dcOffset  = 0;
unsigned long audioPackets = 0, audioFails = 0;
unsigned long speakerPackets = 0, speakerFails = 0;

// ==================== Camera init ====================
bool initCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer   = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;  c.pin_d1 = Y3_GPIO_NUM;
  c.pin_d2 = Y4_GPIO_NUM;  c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;  c.pin_d5 = Y7_GPIO_NUM;
  c.pin_d6 = Y8_GPIO_NUM;  c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk  = XCLK_GPIO_NUM;
  c.pin_pclk  = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM;
  c.pin_href  = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM;
  c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn  = PWDN_GPIO_NUM;
  c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = XCLK_HZ_;
  c.pixel_format = PIXFORMAT_RGB565;
  c.frame_size   = FRAME_SIZE_;
  c.jpeg_quality = 0;
  c.fb_count     = 2;
  c.fb_location  = CAMERA_FB_IN_PSRAM;
  c.grab_mode    = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("[CAM] init failed: 0x%x\n", err);
    return false;
  }
  Serial.println("[CAM] init OK");
  sensor_t *s = esp_camera_sensor_get();
  if (s) { s->set_brightness(s, 0); s->set_contrast(s, 0); s->set_saturation(s, 0); }
  return true;
}

// ==================== Full-duplex I2S init ====================
bool initAudio() {
  i2s_config_t cfg = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = (i2s_comm_format_t)(I2S_COMM_FORMAT_I2S | I2S_COMM_FORMAT_I2S_MSB),
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len   = CHUNK_SAMPLES,
    .use_apll = false,
    .tx_desc_auto_clear = true,     // silence when no TX data
    .fixed_mclk = 0
  };

  if (i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL) != ESP_OK) {
    Serial.println("[AUD] i2s_driver_install failed");
    return false;
  }

  i2s_pin_config_t pins = {
    .mck_io_num   = I2S_PIN_NO_CHANGE,
    .bck_io_num   = I2S_BCLK_GPIO,
    .ws_io_num    = I2S_WS_GPIO,
    .data_out_num = I2S_DOUT_GPIO,   // MAX98357A
    .data_in_num  = I2S_DIN_GPIO     // INMP441
  };
  if (i2s_set_pin(I2S_NUM_0, &pins) != ESP_OK) {
    Serial.println("[AUD] i2s_set_pin failed");
    return false;
  }

  i2s_zero_dma_buffer(I2S_NUM_0);
  Serial.println("[AUD] full-duplex I2S ready");
  return true;
}

// ==================== Camera socket ====================
bool ensureSocket() {
  if (camSocket.connected()) return true;
  camSocket.stop();
  if (camSocket.connect(SERVER_HOST, SERVER_PORT, 3000)) {
    camSocket.setNoDelay(true);
    return true;
  }
  return false;
}

// ==================== Mic uplink socket ====================
bool ensureAudioSocket() {
  if (audioSocket.connected()) return true;
  audioSocket.stop();
  if (audioSocket.connect(SERVER_HOST, AUDIO_PORT, 3000)) {
    audioSocket.setNoDelay(true);
    int fd = audioSocket.fd();
    if (fd >= 0) {
      int sz = 16384;
      setsockopt(fd, SOL_SOCKET, SO_SNDBUF, &sz, sizeof(sz));
    }
    return true;
  }
  return false;
}

// ==================== Speaker downlink socket ====================
bool ensureSpeakerSocket() {
  if (speakerSocket.connected()) return true;
  speakerSocket.stop();
  if (speakerSocket.connect(SERVER_HOST, SPEAKER_PORT, 3000)) {
    speakerSocket.setNoDelay(true);
    Serial.println("[SPK] connected");
    return true;
  }
  return false;
}

// ==================== Send JPEG ====================
bool sendJpeg(uint8_t *jpg, size_t len) {
  if (!ensureSocket()) return false;
  uint8_t pkt[4] = {
    (uint8_t)(len & 0xFF), (uint8_t)((len >> 8) & 0xFF),
    (uint8_t)((len >> 16) & 0xFF), (uint8_t)((len >> 24) & 0xFF)
  };
  camSocket.write(pkt, 4);
  camSocket.write(jpg, len);
  camSocket.flush();
  bytesSent += len;
  return true;
}

// ==================== Send audio (mic) ====================
bool sendAudioChunk() {
  if (!micReady) return false;
  if (!ensureAudioSocket()) { audioFails++; return false; }

  static int32_t raw[BATCH_SAMPLES];
  static int16_t pcm[BATCH_SAMPLES];
  static uint8_t txbuf[4 + BATCH_SAMPLES * 2];

  size_t got = 0;
  if (i2s_read(I2S_NUM_0, raw, sizeof(raw), &got, pdMS_TO_TICKS(150)) != ESP_OK) return false;
  if (got < sizeof(int32_t)) return false;

  int n = got / sizeof(int32_t);
  if (n > BATCH_SAMPLES) n = BATCH_SAMPLES;

  int32_t peakRaw = 0;
  for (int i = 0; i < n; i++) {
    int32_t s = raw[i] >> 14;
    s_dcOffset += ((s - s_dcOffset) >> 5);
    s -= s_dcOffset;
    int32_t a = s < 0 ? -s : s;
    if (a > peakRaw) peakRaw = a;
    if (s >  32767) s =  32767;
    if (s < -32768) s = -32768;
    pcm[i] = (int16_t)s;
  }

  uint16_t payload = (uint16_t)(n * 2);
  txbuf[0] = 0x41; txbuf[1] = 0x55;
  txbuf[2] = (uint8_t)(payload & 0xFF);
  txbuf[3] = (uint8_t)((payload >> 8) & 0xFF);
  memcpy(txbuf + 4, pcm, payload);

  size_t w = audioSocket.write(txbuf, 4 + payload);
  if (w == 0) { audioFails++; return false; }
  audioPackets++;

  static unsigned long lastLog = 0;
  static int reads = 0;
  reads++;
  if (millis() - lastLog >= 1000) {
    Serial.printf("[MIC] %d pkt/s peak=%ld\n", reads, (long)peakRaw);
    reads = 0;
    lastLog = millis();
  }
  return true;
}

// ==================== Speaker receive task ====================
void speakerTask(void*) {
  static int32_t txbuf[1024];
  static uint8_t payload[2048];
  uint8_t hdr[4];

  while (true) {
    if (!ensureSpeakerSocket()) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    if (speakerSocket.available() < 4) {
      vTaskDelay(pdMS_TO_TICKS(2));
      continue;
    }

    if (speakerSocket.read(hdr, 4) != 4) continue;

    if (hdr[0] != 0x53 || hdr[1] != 0x50) {
      while (speakerSocket.available()) speakerSocket.read();
      continue;
    }

    uint16_t len = hdr[2] | (hdr[3] << 8);
    if (len == 0 || len > sizeof(payload)) continue;

    unsigned long t0 = millis();
    while (speakerSocket.available() < len && millis() - t0 < 100) vTaskDelay(1);
    if (speakerSocket.available() < len) continue;

    int r = speakerSocket.read(payload, len);
    if (r != len) continue;

    int n = len / 2;
    int16_t *in16 = (int16_t*)payload;
    for (int i = 0; i < n; i++) txbuf[i] = ((int32_t)in16[i]) << 16;

    size_t bw = 0;
    i2s_write(I2S_NUM_0, txbuf, n * sizeof(int32_t), &bw, pdMS_TO_TICKS(50));
    speakerPackets++;
  }
}

// ==================== Mic uplink task ====================
void audioTask(void*) {
  while (true) {
    sendAudioChunk();
    vTaskDelay(1);
  }
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ESP32-S3 full-duplex audio ===");
  Serial.printf("PSRAM: %u free\n", ESP.getFreePsram());

  if (!initCamera()) { delay(5000); ESP.restart(); }

  if (!initAudio()) {
    Serial.println("audio init failed — continuing without audio");
  } else {
    micReady = true;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.printf("Connecting to %s", WIFI_SSID);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(300); Serial.print('.');
  }
  if (WiFi.status() != WL_CONNECTED) { delay(3000); ESP.restart(); }

  Serial.printf("\nWiFi OK  IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Camera  -> %s:%u\n", SERVER_HOST, SERVER_PORT);
  Serial.printf("Mic up  -> %s:%u\n", SERVER_HOST, AUDIO_PORT);
  Serial.printf("Spk dn  -> %s:%u\n", SERVER_HOST, SPEAKER_PORT);

  if (micReady) {
    xTaskCreatePinnedToCore(audioTask,   "mic", 6144, nullptr, 7, nullptr, 0);
    xTaskCreatePinnedToCore(speakerTask, "spk", 6144, nullptr, 6, nullptr, 0);
  }
}

// ==================== Loop (camera) ====================
void loop() {
  if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); delay(1000); return; }

  unsigned long nowMs = millis();
  if (nowMs - lastFrameMs < (1000 / CAMERA_MAX_FPS)) { delay(2); return; }
  lastFrameMs = nowMs;

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) { delay(5); return; }

  uint8_t *jpg = nullptr;
  size_t   jpgLen = 0;
  bool ok = frame2jpg(fb, JPEG_QUALITY_, &jpg, &jpgLen);
  esp_camera_fb_return(fb);

  if (ok && jpg && jpgLen > 0) {
    if (sendJpeg(jpg, jpgLen)) frameCount++; else failCount++;
    free(jpg);
  } else failCount++;

  unsigned long now = millis();
  if (now - lastStat >= 1000) {
    float dt = (now - lastStat) / 1000.0f;
    float fps = (frameCount - lastFrames) / dt;
    float kbps = ((bytesSent - lastBytes) / 1024.0f) / dt;
    Serial.printf("[STAT] fps=%.1f %.1f KB/s heap=%u | mic=%lu fail=%lu | spk=%lu\n",
                  fps, kbps, ESP.getFreeHeap(),
                  audioPackets, audioFails, speakerPackets);
    lastStat = now; lastFrames = frameCount; lastBytes = bytesSent;
  }
  yield();
}