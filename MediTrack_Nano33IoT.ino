#include <WiFiNINA.h>
#include <ArduinoHttpClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <Servo.h>
#include <U8g2lib.h>
#include <ArduinoJson.h>

const char WIFI_SSID[] = "YOUR_WIFI_NAME";
const char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
const char DEVICE_TOKEN[] = "PASTE_DEVICE_TOKEN_FROM_VERCEL";

const char API_HOST[] = "medisy-lime.vercel.app";
const int API_PORT = 443;
const char TIME_PATH[] = "/api/device/time";
const char SCAN_PATH[] = "/api/device/scan";
const char COMPLETE_PATH[] = "/api/device/complete";

const char PATIENT1_UID[] = "D0CFAF5F";
const char PATIENT2_UID[] = "9EF60C06";

#define RFID_SS_PIN 8
#define RFID_RST_PIN 7
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);

U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

Servo servoP1Morning, servoP1Evening, servoP2Morning, servoP2Evening;
const byte PIN_P1_MORNING = 2;
const byte PIN_P1_EVENING = 3;
const byte PIN_P2_MORNING = 4;
const byte PIN_P2_EVENING = 5;

const int P1_MORNING_NEUTRAL = 90;
const int P1_EVENING_NEUTRAL = 90;
const int P2_MORNING_NEUTRAL = 90;
const int P2_EVENING_NEUTRAL = 0;
const int P1_MORNING_ACTIVE = 0;
const int P1_EVENING_ACTIVE = 0;
const int P2_MORNING_ACTIVE = 0;
const int P2_EVENING_ACTIVE = 90;

WiFiSSLClient ssl;
HttpClient http(ssl, API_HOST, API_PORT);
unsigned long lastTimePoll = 0;
const unsigned long TIME_POLL_INTERVAL = 60000UL;
bool serverTimeKnown = false;

void oledMessage(const String &a, const String &b = "", const String &c = "") {
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x12_tf);
  oled.drawStr(0, 12, "MEDiTRACK");
  oled.drawHLine(0, 16, 128);
  oled.drawUTF8(0, 31, a.c_str());
  oled.drawUTF8(0, 45, b.c_str());
  oled.drawUTF8(0, 59, c.c_str());
  oled.sendBuffer();
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  oledMessage("Connecting Wi-Fi...");
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.disconnect();
  delay(500);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000UL) {
    Serial.print("Wi-Fi status: ");
    Serial.println(WiFi.status());
    delay(1000);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection failed. Will retry.");
    oledMessage("Wi-Fi failed", "Check 2.4GHz", "SSID/password");
    return false;
  }

  Serial.println("Wi-Fi connected.");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  oledMessage("Wi-Fi connected", WiFi.localIP().toString());
  return true;
}

int request(const char *method, const char *path, const String &body = "") {
  http.stop();
  http.beginRequest();
  if (strcmp(method, "GET") == 0) {
    http.get(path);
  } else {
    http.post(path);
    http.sendHeader("Content-Type", "application/json");
    http.sendHeader("Content-Length", body.length());
  }
  http.sendHeader("x-device-token", DEVICE_TOKEN);
  if (strcmp(method, "POST") == 0) {
    http.beginBody();
    http.print(body);
  }
  http.endRequest();
  return http.responseStatusCode();
}

void pollServerTime() {
  if (!connectWiFi()) return;
  int status = request("GET", TIME_PATH);
  String payload = http.responseBody();
  Serial.print("Time endpoint HTTP: "); Serial.println(status);
  Serial.println(payload);

  if (status != 200) {
    serverTimeKnown = false;
    oledMessage("Time sync failed", "HTTP " + String(status));
    return;
  }

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err || !(doc["ok"] | false)) {
    serverTimeKnown = false;
    oledMessage("Bad time response");
    return;
  }

  serverTimeKnown = true;
  lastTimePoll = millis();
  String localTime = doc["localTime"] | "";
  String tz = doc["timezone"] | "";
  Serial.print("Server local time: "); Serial.println(localTime);
  oledMessage("Server time synced", localTime, tz);
}

String currentCardUID() {
  String uid;
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += '0';
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

void setNeutral(byte n) {
  switch (n) {
    case 1: servoP1Morning.write(P1_MORNING_NEUTRAL); break;
    case 2: servoP1Evening.write(P1_EVENING_NEUTRAL); break;
    case 3: servoP2Morning.write(P2_MORNING_NEUTRAL); break;
    case 4: servoP2Evening.write(P2_EVENING_NEUTRAL); break;
  }
}

bool runServo(byte n) {
  Servo *s = nullptr;
  int active = 0;
  switch (n) {
    case 1: s = &servoP1Morning; active = P1_MORNING_ACTIVE; break;
    case 2: s = &servoP1Evening; active = P1_EVENING_ACTIVE; break;
    case 3: s = &servoP2Morning; active = P2_MORNING_ACTIVE; break;
    case 4: s = &servoP2Evening; active = P2_EVENING_ACTIVE; break;
    default: return false;
  }
  s->write(active);
  delay(10000);
  setNeutral(n);
  return true;
}

void reportComplete(const String &eventId, bool success, const String &note) {
  StaticJsonDocument<256> doc;
  doc["eventId"] = eventId;
  doc["success"] = success;
  doc["note"] = note;
  String body;
  serializeJson(doc, body);

  int status = request("POST", COMPLETE_PATH, body);
  String response = http.responseBody();
  Serial.print("Completion report HTTP: "); Serial.println(status);
  Serial.println(response);
  if (status != 200) oledMessage("Cycle finished", "Cloud update failed");
}

void handleCard() {
  String uid = currentCardUID();
  Serial.print("Scanned UID: "); Serial.println(uid);

  if (uid != PATIENT1_UID && uid != PATIENT2_UID) {
    Serial.println("Unknown RFID card.");
    oledMessage("Unknown card", "Not registered", "No medicine opened");
    delay(1800);
    return;
  }

  if (!connectWiFi()) {
    oledMessage("Offline", "No dispensing", "Try again later");
    return;
  }

  StaticJsonDocument<128> req;
  req["uid"] = uid;
  String body;
  serializeJson(req, body);

  oledMessage("Card accepted", "Checking schedule...");
  int status = request("POST", SCAN_PATH, body);
  String payload = http.responseBody();
  Serial.print("Scan endpoint HTTP: "); Serial.println(status);
  Serial.println(payload);

  if (status != 200) {
    oledMessage("Server error", "HTTP " + String(status), "No dispensing");
    return;
  }

  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    oledMessage("Invalid response", "No dispensing");
    return;
  }

  if (!(doc["authorized"] | false)) {
    String reason = doc["reason"] | "not_authorized";
    String patient = doc["patientName"] | "Card recognized";
    Serial.print("Not authorized: "); Serial.println(reason);
    oledMessage(patient, reason, "No dispensing");
    delay(2200);
    oledMessage("System ready", "Scan your card");
    return;
  }

  String patientName = doc["patientName"] | "Patient";
  String slot = doc["slot"] | "";
  String eventId = doc["eventId"] | "";
  byte servoNumber = doc["servo"] | 0;

  if (eventId.length() == 0 || servoNumber < 1 || servoNumber > 4) {
    Serial.println("Invalid authorization payload; servo not activated.");
    oledMessage("Invalid approval", "No dispensing");
    return;
  }

  Serial.print("Authorized: "); Serial.print(patientName);
  Serial.print(" / "); Serial.print(slot);
  Serial.print(" / servo "); Serial.println(servoNumber);
  oledMessage("Welcome", patientName, "Dispensing " + slot);

  bool completed = runServo(servoNumber);
  oledMessage("Please collect", "Medicine cycle done");
  reportComplete(eventId, completed, completed ? "Servo cycle completed and returned to neutral" : "Invalid servo selection");
  delay(1800);
  oledMessage("System ready", "Scan your card");
}

void setup() {
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && millis() - serialStart < 5000UL) {}

  oled.setI2CAddress(0x3C * 2);
  oled.begin();
  oledMessage("Starting system...");

  servoP1Morning.attach(PIN_P1_MORNING);
  servoP1Evening.attach(PIN_P1_EVENING);
  servoP2Morning.attach(PIN_P2_MORNING);
  servoP2Evening.attach(PIN_P2_EVENING);
  setNeutral(1); setNeutral(2); setNeutral(3); setNeutral(4);

  SPI.begin();
  rfid.PCD_Init();
  delay(100);
  Serial.println("MFRC522 initialized.");

  if (connectWiFi()) pollServerTime();
  oledMessage("System ready", "Scan your card");
  Serial.println("MediTrack ready. Scan a registered patient card.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  if (!serverTimeKnown || millis() - lastTimePoll >= TIME_POLL_INTERVAL) {
    pollServerTime();
  }

  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    handleCard();
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(800);
  }
}
