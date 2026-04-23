#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ── CONFIG ──────────────────────────────────────────────────────────
const char* WIFI_SSID     = "M13KARA";
const char* WIFI_PASSWORD = "1234567891";
const char* MQTT_HOST     = "10.78.103.171";
const int   MQTT_PORT     = 1883;          // ← filled
const char* ROBOT_ID      = "ROBOT001";    // ← filled

// ── TOPICS ──────────────────────────────────────────────────────────
// Must exactly match backend main.py → TOPIC_CMD = "robot/ROBOT001/cmd/dispense"
String TOPIC_STATUS = "robot/" + String(ROBOT_ID) + "/status";
String TOPIC_RFID   = "robot/" + String(ROBOT_ID) + "/rfid";
String TOPIC_CMD    = "robot/" + String(ROBOT_ID) + "/cmd/dispense"; // ← was /cmd_dispense (BUG FIXED)
String TOPIC_ACK    = "robot/" + String(ROBOT_ID) + "/ack";

// ── UART to STM32 ────────────────────────────────────────────────────
#define STM32_SERIAL Serial1
#define STM32_RX 17
#define STM32_TX 18

WiFiClient   espClient;
PubSubClient mqttClient(espClient);

unsigned long lastHeartbeat  = 0;
unsigned long lastWifiCheck  = 0;
bool          stm32Ready     = false;
String        uartBuffer     = "";

// ── MQTT CALLBACK ────────────────────────────────────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.println("[MQTT IN] [" + String(topic) + "] " + msg);

  if (String(topic) == TOPIC_CMD) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, msg) == DeserializationError::Ok) {
      int    drawer  = doc["drawer"]  | 0;
      String med     = doc["med"]     | "inconnu";
      String patient = doc["patient"] | "inconnu";

      // Forward compact command to STM32 via UART
      String cmd = "{\"cmd\":\"open_drawer\",\"drawer\":"
                   + String(drawer)
                   + ",\"med\":\"" + med + "\""
                   + "}\n";
      STM32_SERIAL.print(cmd);
      Serial.println("[→ STM32] " + cmd);
      stm32Ready = false;  // waiting for ack
    }
  }
}

// ── MQTT RECONNECT ───────────────────────────────────────────────────
void mqttReconnect() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Connecting...");
    String clientId = "ESP32_" + String(ROBOT_ID);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" OK  IP=" + WiFi.localIP().toString());
      mqttClient.subscribe(TOPIC_CMD.c_str());
      // Publish online status immediately after connect
      String onlineMsg = "{\"esp32\":\"online\",\"stm32\":\""
                         + String(stm32Ready ? "ready" : "offline")
                         + "\",\"uptime\":" + String(millis() / 1000) + "}";
      mqttClient.publish(TOPIC_STATUS.c_str(), onlineMsg.c_str(), true); // retained
    } else {
      Serial.println(" FAILED (rc=" + String(mqttClient.state()) + "), retry 3s");
      delay(3000);
    }
  }
}

// ── WIFI WATCHDOG ────────────────────────────────────────────────────
void wifiWatchdog() {
  if (millis() - lastWifiCheck < 10000) return;
  lastWifiCheck = millis();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost — reconnecting...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ── READ UART FROM STM32 ─────────────────────────────────────────────
void readSTM32() {
  while (STM32_SERIAL.available()) {
    char c = STM32_SERIAL.read();
    if (c == '\n') {
      uartBuffer.trim();
      if (uartBuffer.length() > 0) {
        Serial.println("[STM32 IN] " + uartBuffer);
        StaticJsonDocument<128> doc;
        if (deserializeJson(doc, uartBuffer) == DeserializationError::Ok) {
          String cmd = doc["cmd"] | "";

          if (cmd == "rfid") {
            // STM32 scanned a badge → publish to frontend
            String uid = doc["uid"] | "";
            String pub = "{\"uid\":\"" + uid
                         + "\",\"ts\":" + String(millis() / 1000) + "}";
            mqttClient.publish(TOPIC_RFID.c_str(), pub.c_str());
            Serial.println("[MQTT RFID →] " + pub);

          } else if (cmd == "ack") {
            // STM32 confirms drawer opened → publish ACK to frontend
            int drawer = doc["drawer"] | 0;
            String pub = "{\"status\":\"ok\",\"drawer\":"
                         + String(drawer) + "}";
            mqttClient.publish(TOPIC_ACK.c_str(), pub.c_str());
            stm32Ready = true;
            Serial.println("[MQTT ACK →] " + pub);

          } else if (cmd == "err") {
            // STM32 reports a hardware error
            int    drawer = doc["drawer"] | 0;
            String reason = doc["reason"] | "unknown";
            String pub = "{\"status\":\"error\",\"drawer\":"
                         + String(drawer)
                         + ",\"reason\":\"" + reason + "\"}";
            mqttClient.publish(TOPIC_ACK.c_str(), pub.c_str());
            stm32Ready = true;
            Serial.println("[MQTT ERR →] " + pub);
          }
        }
        uartBuffer = "";
      }
    } else {
      if (uartBuffer.length() < 256) uartBuffer += c; // guard overflow
    }
  }
}

// ── HEARTBEAT ────────────────────────────────────────────────────────
void sendHeartbeat() {
  if (millis() - lastHeartbeat < 5000) return;
  lastHeartbeat = millis();
  String pub = "{\"esp32\":\"online\",\"stm32\":\""
               + String(stm32Ready ? "ready" : "offline")
               + "\",\"uptime\":" + String(millis() / 1000)
               + ",\"rssi\":"     + String(WiFi.RSSI()) + "}";
  mqttClient.publish(TOPIC_STATUS.c_str(), pub.c_str());
}

// ── SETUP ────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  STM32_SERIAL.begin(115200, SERIAL_8N1, STM32_RX, STM32_TX);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println(" OK  " + WiFi.localIP().toString());

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512); // needed for JSON with patient name
}

// ── LOOP ─────────────────────────────────────────────────────────────
void loop() {
  wifiWatchdog();
  if (!mqttClient.connected()) mqttReconnect();
  mqttClient.loop();
  readSTM32();
  sendHeartbeat();
}