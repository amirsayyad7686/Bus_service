#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include "driver/i2s_std.h"            // ===== ADDED =====

// ==================== WiFi ====================
const char* WIFI_SSID = "Amir34";
const char* WIFI_PASS = "24683579";

// ==================== Node server ====================
const char* SERVER_HOST   = "181.41.194.124";
const uint16_t SERVER_PORT = 5203;   // camera (existing)
const uint16_t AUDIO_PORT  = 5204;   // ===== ADDED: audio =====

// ==================== Camera tuning ====================
#define FRAME_SIZE_    FRAMESIZE_QVGA
#define JPEG_QUALITY_  12
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

// ==================== Mic pins / params (ADDED) ====================
#define I2S_BCLK_GPIO   14
#define I2S_WS_GPIO     47
#define I2S_DIN_GPIO    38
#define SAMPLE_RATE     16000
#define CHUNK_SAMPLES   160           // 10 ms
// ==================================================================

WiFiClient camSocket;
WiFiClient audioSocket;                // ===== ADDED =====

unsigned long frameCount = 0, failCount = 0;
unsigned long bytesSent  = 0;
unsigned long lastStat   = 0;
unsigned long lastFrames = 0;
unsigned long lastBytes  = 0;

// ===== ADDED: mic state =====
i2s_chan_handle_t rx_chan = nullptr;
int32_t s_dcOffset = 0;   // high-pass filter state
unsigned long audioPackets = 0, audioFails = 0;
// ============================

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
  if (s) {
    s->set_brightness(s, 0);
    s->set_contrast(s, 0);
    s->set_saturation(s, 0);
  }
  return true;
}

// ==================== Mic init (ADDED) ====================
bool initMic() {
  i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  chan_cfg.auto_clear = true;

  if (i2s_new_channel(&chan_cfg, NULL, &rx_chan) != ESP_OK) {
    Serial.println("[MIC] i2s_new_channel failed");
    return false;
  }

  i2s_std_config_t std_cfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
                    I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED,
      .bclk = (gpio_num_t)I2S_BCLK_GPIO,
      .ws   = (gpio_num_t)I2S_WS_GPIO,
      .dout = I2S_GPIO_UNUSED,
      .din  = (gpio_num_t)I2S_DIN_GPIO,
      .invert_flags = { false, false, false },
    },
  };

  if (i2s_channel_init_std_mode(rx_chan, &std_cfg) != ESP_OK) {
    Serial.println("[MIC] init std mode failed");
    return false;
  }
  if (i2s_channel_enable(rx_chan) != ESP_OK) {
    Serial.println("[MIC] enable failed");
    return false;
  }
  Serial.println("[MIC] init OK");
  return true;
}
// ========================================================

// ==================== Socket (camera) ====================
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

// ===== ADDED: audio socket =====
bool ensureAudioSocket() {
  if (audioSocket.connected()) return true;
  audioSocket.stop();
  Serial.printf("[AUD] connecting to %s:%u ... ", SERVER_HOST, AUDIO_PORT);
  if (audioSocket.connect(SERVER_HOST, AUDIO_PORT, 3000)) {
    audioSocket.setNoDelay(true);
    audioSocket.setTimeout(2);
    Serial.println("OK");
    return true;
  }
  Serial.println("FAILED");
  return false;
}
// ================================

// ==================== Send JPEG (unchanged) ====================
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

// ==================== Send audio chunk (ADDED) ====================
// Packet: [0x41 0x55][u16 LE length in bytes][int16 LE samples...]
bool sendAudioChunk() {
  if (!rx_chan) return false;
  if (!ensureAudioSocket()) { audioFails++; return false; }

  int32_t raw[CHUNK_SAMPLES];
  size_t br = 0;
  esp_err_t err = i2s_channel_read(rx_chan, raw, sizeof(raw), &br,
                                   pdMS_TO_TICKS(50));
  if (err != ESP_OK || br < sizeof(int32_t)) return false;

  int n = br / sizeof(int32_t);
  if (n > CHUNK_SAMPLES) n = CHUNK_SAMPLES;

  static int16_t pcm[CHUNK_SAMPLES];
  for (int i = 0; i < n; i++) {
    // INMP441 sends 24-bit data in the top of a 32-bit slot.
    int32_t s = raw[i] >> 14;

    // High-pass: slowly track DC and subtract it.
    // alpha = 1/256 -> ~ -3 dB at ~10 Hz at 16 kHz.
    s_dcOffset = s_dcOffset + ((s - s_dcOffset) >> 8);
    s -= s_dcOffset;

    if (s >  32767) s =  32767;
    if (s < -32768) s = -32768;
    pcm[i] = (int16_t)s;
  }

  uint16_t payload = (uint16_t)(n * 2);
  uint8_t hdr[4] = {
    0x41, 0x55,
    (uint8_t)(payload & 0xFF),
    (uint8_t)((payload >> 8) & 0xFF)
  };

  audioSocket.write(hdr, 4);
  audioSocket.write((const uint8_t*)pcm, payload);
  audioSocket.flush();
  audioPackets++;
  return true;
}
// =================================================================

// ==================== Audio task (ADDED) ====================
// Runs on core 0 so it doesn't starve the camera loop on core 1.
void audioTask(void* arg) {
  while (true) {
    sendAudioChunk();
    // i2s_channel_read already blocks ~10 ms, so tiny yield is enough
    vTaskDelay(1);
  }
}
// ==========================================================

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ESP32-S3 CAM + MIC streamer ===");
  Serial.printf("PSRAM: %u free\n", ESP.getFreePsram());

  if (!initCamera()) {
    Serial.println("camera failed — rebooting in 5 s");
    delay(5000);
    ESP.restart();
  }

  if (!initMic()) {
    Serial.println("mic failed — continuing without audio");
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
  Serial.printf("Video -> tcp://%s:%u\n", SERVER_HOST, SERVER_PORT);
  Serial.printf("Audio -> tcp://%s:%u\n", SERVER_HOST, AUDIO_PORT);

  // ===== ADDED: start audio task on core 0 =====
  if (rx_chan) {
    xTaskCreatePinnedToCore(
      audioTask, "audio", 4096, nullptr, 5, nullptr, 0);
  }
  // ============================================
}

// ==================== Loop (unchanged) ====================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) { delay(5); return; }

  uint8_t *jpg = nullptr;
  size_t   jpgLen = 0;
  bool ok = frame2jpg(fb, JPEG_QUALITY_, &jpg, &jpgLen);

  esp_camera_fb_return(fb);

  if (ok && jpg && jpgLen > 0) {
    if (sendJpeg(jpg, jpgLen)) frameCount++;
    else                        failCount++;
    free(jpg);
  } else {
    failCount++;
  }

  unsigned long now = millis();
  if (now - lastStat >= 1000) {
    float dt   = (now - lastStat) / 1000.0f;
    float fps  = (frameCount - lastFrames) / dt;
    float kbps = ((bytesSent - lastBytes) / 1024.0f) / dt;
    Serial.printf("[STAT] fps=%.1f frames=%lu fail=%lu %.1f KB/s heap=%u psram=%u | aud=%lu afail=%lu\n",
                  fps, frameCount, failCount, kbps,
                  ESP.getFreeHeap(), ESP.getFreePsram(),
                  audioPackets, audioFails);
    lastStat = now; lastFrames = frameCount; lastBytes = bytesSent;
  }

  yield();
}