#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClient.h>

// ==================== WiFi ====================
const char* WIFI_SSID = "Amir";
const char* WIFI_PASS = "shirazamir35963";

// ==================== Node server ====================
const char* SERVER_HOST = "181.41.194.124";
const uint16_t SERVER_PORT = 5203;

// ==================== Camera tuning ====================
// RGB565 buffer = width*height*2 bytes. QVGA=150KB, VGA=600KB.
// Higher res = sharper but slower (frame2jpg is CPU-bound).
#define FRAME_SIZE_    FRAMESIZE_QVGA     // QVGA 320x240 ~12 fps, VGA 640x480 ~3 fps
#define JPEG_QUALITY_  12                 // 10=best, 30=smallest
#define XCLK_HZ_       20000000

// ==================== Pins ====================
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
// ==============================================

WiFiClient camSocket;
unsigned long frameCount = 0, failCount = 0;
unsigned long bytesSent  = 0;
unsigned long lastStat   = 0;
unsigned long lastFrames = 0;
unsigned long lastBytes  = 0;

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
  c.pixel_format = PIXFORMAT_RGB565;      // REQUIRED for this sensor
  c.frame_size   = FRAME_SIZE_;
  c.jpeg_quality = 0;                     // ignored for RGB565
  c.fb_count     = 2;                     // double buffering
  c.fb_location  = CAMERA_FB_IN_PSRAM;
  c.grab_mode    = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("[CAM] init failed: 0x%x\n", err);
    return false;
  }
  Serial.println("[CAM] init OK");

  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_brightness(s, 0);
    s->set_contrast(s, 0);
    s->set_saturation(s, 0);
  }
  return true;
}

// ==================== Socket ====================
bool ensureSocket() {
  if (camSocket.connected()) return true;
  camSocket.stop();
  Serial.printf("[TCP] connecting to %s:%u ... ", SERVER_HOST, SERVER_PORT);
  if (camSocket.connect(SERVER_HOST, SERVER_PORT, 3000)) {
    camSocket.setNoDelay(true);
    Serial.println("OK");
    return true;
  }
  Serial.println("FAILED");
  return false;
}

// ==================== Send JPEG with magic + length ====================
bool sendJpeg(uint8_t *jpg, size_t len) {
  if (!ensureSocket()) return false;
  uint8_t pkt[4] = {
    (uint8_t)(len & 0xFF),
    (uint8_t)((len >> 8) & 0xFF),
    (uint8_t)((len >> 16) & 0xFF),
    (uint8_t)((len >> 24) & 0xFF)
  };
  camSocket.write(pkt, 4);
  camSocket.write(jpg, len);
  camSocket.flush();
  bytesSent += len;
  return true;
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ESP32-S3 CAM streamer (RGB565 -> JPEG) ===");
  Serial.printf("PSRAM: %u free\n", ESP.getFreePsram());

  if (!initCamera()) {
    Serial.println("rebooting in 5 s");
    delay(5000);
    ESP.restart();
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
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi failed — rebooting");
    delay(3000); ESP.restart();
  }
  Serial.printf("\nWiFi OK  IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Streaming to tcp://%s:%u\n", SERVER_HOST, SERVER_PORT);
}

// ==================== Loop ====================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  // 1. Grab RGB565 frame
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) { delay(5); return; }

  // 2. Compress to JPEG (allocates with malloc; must free())
  uint8_t *jpg = nullptr;
  size_t   jpgLen = 0;
  bool ok = frame2jpg(fb, JPEG_QUALITY_, &jpg, &jpgLen);

  // 3. Return the sensor buffer ASAP
  esp_camera_fb_return(fb);

  // 4. Send
  if (ok && jpg && jpgLen > 0) {
    if (sendJpeg(jpg, jpgLen)) frameCount++;
    else                        failCount++;
    free(jpg);
  } else {
    failCount++;
  }

  // 5. Stats
  unsigned long now = millis();
  if (now - lastStat >= 1000) {
    float dt   = (now - lastStat) / 1000.0f;
    float fps  = (frameCount - lastFrames) / dt;
    float kbps = ((bytesSent - lastBytes) / 1024.0f) / dt;
    Serial.printf("[STAT] fps=%.1f frames=%lu fail=%lu %.1f KB/s heap=%u psram=%u\n",
                  fps, frameCount, failCount, kbps,
                  ESP.getFreeHeap(), ESP.getFreePsram());
    lastStat = now; lastFrames = frameCount; lastBytes = bytesSent;
  }

  yield();   // feed task watchdog
}