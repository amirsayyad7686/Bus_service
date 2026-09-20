#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClient.h>

// ==================== WiFi ====================
const char* WIFI_SSID = "Amir34";
const char* WIFI_PASS = "24683579";

// ==================== Node server (raw TCP, NOT HTTP) ====================
const char* SERVER_HOST = "181.41.194.124";
const uint16_t SERVER_PORT = 5203;              // <- new TCP port for frames

// ==================== Camera tuning ====================
// Trade-off: lower resolution / higher quality number = faster frames
#define FRAME_SIZE_       FRAMESIZE_VGA          // VGA(640x480) | QVGA(320x240) | CIF(400x296)
#define JPEG_QUALITY_     12                     // 10=high, 30=low (higher = smaller/faster)

// ==================== AI-Thinker ESP32-CAM pins ====================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// ==================== State ====================
WiFiClient camSocket;
unsigned long frameCount = 0;
unsigned long failCount  = 0;
unsigned long lastStat   = 0;
unsigned long bytesSent  = 0;
unsigned long startTime  = 0;

// ==================== Camera init ====================
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;                // 20 MHz — stable
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size   = FRAME_SIZE_;
    config.jpeg_quality = JPEG_QUALITY_;
    config.fb_count     = 2;                     // double-buffer for smoothness
    config.fb_location  = CAMERA_FB_IN_PSRAM;
    config.grab_mode    = CAMERA_GRAB_LATEST;    // always newest frame
  } else {
    config.frame_size   = FRAMESIZE_QVGA;
    config.jpeg_quality = JPEG_QUALITY_;
    config.fb_count     = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] init failed: 0x%x\n", err);
    return false;
  }
  Serial.println("[CAM] init OK");

  sensor_t *s = esp_camera_sensor_get();
  s->set_brightness(s, 0);
  s->set_contrast(s, 0);
  s->set_saturation(s, 0);
  s->set_whitebal(s, 1);
  s->set_exposure_ctrl(s, 1);
  s->set_gain_ctrl(s, 1);
  s->set_awb_gain(s, 1);
  return true;
}

// ==================== Socket connect (with reconnect) ====================
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

// ==================== Send one JPEG with length prefix ====================
bool sendFrame(camera_fb_t *fb) {
  if (!ensureSocket()) return false;

  // 4-byte little-endian length prefix
  uint32_t len = fb->len;
  uint8_t header[4] = {
    (uint8_t)(len & 0xFF),
    (uint8_t)((len >> 8) & 0xFF),
    (uint8_t)((len >> 16) & 0xFF),
    (uint8_t)((len >> 24) & 0xFF)
  };

  // Write header + payload. TCP will buffer; the OS handles batching.
  size_t w1 = camSocket.write(header, 4);
  size_t w2 = camSocket.write(fb->buf, fb->len);

  if (w1 != 4 || w2 != fb->len) {
    Serial.println("[TCP] short write — reconnecting");
    camSocket.stop();
    return false;
  }

  bytesSent += fb->len;
  return true;
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== ESP32-CAM TCP Streamer ===");

  if (!initCamera()) {
    Serial.println("Camera failed — rebooting in 5 s");
    delay(5000);
    ESP.restart();
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);                            // CRITICAL: disables power save
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.printf("Connecting to %s", WIFI_SSID);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(300);
    Serial.print('.');
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi failed — rebooting");
    delay(3000);
    ESP.restart();
  }

  Serial.printf("\nWiFi OK  IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Streaming to: tcp://%s:%u\n", SERVER_HOST, SERVER_PORT);

  startTime = millis();
}

// ==================== Loop — no artificial delay ====================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] lost — reconnecting");
    WiFi.reconnect();
    delay(1000);
    return;
  }

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    delay(10);
    return;
  }

  if (sendFrame(fb)) {
    frameCount++;
  } else {
    failCount++;
  }

  esp_camera_fb_return(fb);

  // Stats once per second
  unsigned long now = millis();
  if (now - lastStat >= 1000) {
    float sec = (now - startTime) / 1000.0;
    float fps = frameCount / sec;
    float kbps = (bytesSent / 1024.0) / sec;
    Serial.printf("[STAT] fps=%.1f  frames=%lu  fail=%lu  %.0f KB/s  heap=%u\n",
                  fps, frameCount, failCount, kbps, ESP.getFreeHeap());
    lastStat = now;
  }
}