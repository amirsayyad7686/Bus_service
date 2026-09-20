#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

// ==================== WiFi ====================
const char* WIFI_SSID = "Amir34";     // 2.4 GHz only
const char* WIFI_PASS = "24683579";

// ==================== Node server ====================
// LAN:    http://192.168.1.100:3000/frame
// Public: http://yourserver.com/frame
const char* SERVER_URL = "http://181.41.194.124:5201/frame";

// ==================== Camera tuning ====================
// Lower number = better quality, bigger file
// Higher number = lower quality, smaller file (better for slower links)
#define JPEG_QUALITY   12      // 10–15 recommended
#define FRAME_INTERVAL 200     // ms between frames (200 = 5 FPS)

// ==================== AI-Thinker ESP32-CAM pin map ====================
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
unsigned long lastFrame = 0;
unsigned long frameCount = 0;
unsigned long failCount  = 0;

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
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size   = FRAMESIZE_VGA;    // 640×480
    config.jpeg_quality = JPEG_QUALITY;
    config.fb_count     = 2;
  } else {
    config.frame_size   = FRAMESIZE_QVGA;   // 320×240 fallback
    config.jpeg_quality = JPEG_QUALITY;
    config.fb_count     = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] init failed: 0x%x\n", err);
    return false;
  }
  Serial.println("[CAM] init OK");

  // Optional tweaks
  sensor_t *s = esp_camera_sensor_get();
  s->set_brightness(s, 0);
  s->set_contrast(s, 0);
  s->set_saturation(s, 0);
  s->set_whitebal(s, 1);
  s->set_exposure_ctrl(s, 1);
  s->set_gain_ctrl(s, 1);
  return true;
}

// ==================== POST one JPEG ====================
bool postFrame(camera_fb_t *fb) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "image/jpeg");

  int code = http.POST(fb->buf, fb->len);
  http.end();

  if (code == 200 || code == 201) return true;

  Serial.printf("[POST] failed, HTTP %d\n", code);
  return false;
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== ESP32-CAM Streamer ===");

  if (!initCamera()) {
    Serial.println("Camera failed — rebooting in 5 s");
    delay(5000);
    ESP.restart();
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);           // important for camera throughput
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
  Serial.printf("Streaming to: %s\n", SERVER_URL);
  Serial.printf("Target: %d ms between frames (~%d FPS)\n",
                FRAME_INTERVAL, 1000 / FRAME_INTERVAL);
}

// ==================== Loop ====================
void loop() {
  // Reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] reconnecting...");
    WiFi.reconnect();
    delay(2000);
    return;
  }

  if (millis() - lastFrame < FRAME_INTERVAL) return;
  lastFrame = millis();

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[CAM] capture failed");
    return;
  }

  bool ok = postFrame(fb);
  if (ok) {
    frameCount++;
  } else {
    failCount++;
  }

  if (frameCount % 20 == 0 && frameCount > 0) {
    Serial.printf("[STAT] sent=%lu fail=%lu size=%u bytes heap=%u\n",
                  frameCount, failCount, fb->len, ESP.getFreeHeap());
  }

  esp_camera_fb_return(fb);
}