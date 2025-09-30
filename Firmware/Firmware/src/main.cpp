#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiManager.h>
#include <ESPAsyncWebServer.h>
#include <DHT.h>
#include <ArduinoJson.h>

// Configuración de pines de sensores y actuadores
#define DHT_PIN 4
#define DHT_TYPE DHT11
#define GAS_PIN 34
#define WATER_PIN 35
#define MOTION_PIN 27
#define LED_PIN 2

// Objetos globales
AsyncWebServer server(80);
DHT dht(DHT_PIN, DHT_TYPE);
WiFiManager wifiManager;

const char* hostname = "esp32-sensor";

// Estructura para almacenar las lecturas actuales
struct SensorData {
    float temp;
    float hum;
    int gas;
    int water;
    bool motion;
    bool led;
};
SensorData currentData = {0.0, 0.0, 0, 0, false, false};

// Función para leer datos de todos los sensores
void readSensors() {
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (!isnan(h) && !isnan(t)) {
        currentData.hum = h;
        currentData.temp = t;
    }
    currentData.gas = map(analogRead(GAS_PIN), 0, 4095, 0, 1000);
    currentData.water = map(analogRead(WATER_PIN), 4095, 0, 0, 100);
    currentData.motion = digitalRead(MOTION_PIN) == HIGH;
    currentData.led = digitalRead(LED_PIN) == HIGH;
    
    Serial.printf("T: %.1f C, H: %.0f %%, Gas: %d ppm, Agua: %d %%, Mov: %s, LED: %s\n",
                  currentData.temp, currentData.hum, currentData.gas, currentData.water,
                  currentData.motion ? "SI" : "NO", currentData.led ? "ON" : "OFF");
}

// Handler para la ruta /data que devuelve el JSON de los sensores
void handleSensorData(AsyncWebServerRequest *request) {
    readSensors();
    StaticJsonDocument<256> doc;
    doc["temp"] = currentData.temp;
    doc["hum"] = currentData.hum;
    doc["gas"] = currentData.gas;
    doc["water"] = currentData.water;
    doc["motion"] = currentData.motion;
    doc["led"] = currentData.led;
    String jsonResponse;
    serializeJson(doc, jsonResponse);
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", jsonResponse);
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
}

// Handler para controlar el LED
void handleLedControl(AsyncWebServerRequest *request) {
    if (request->hasParam("state", true)) {
        String state = request->getParam("state", true)->value();
        bool newState = (state == "on" || state == "1");
        digitalWrite(LED_PIN, newState ? HIGH : LOW);
        currentData.led = newState;
        StaticJsonDocument<64> doc;
        doc["success"] = true;
        doc["led_state"] = newState;
        String jsonResponse;
        serializeJson(doc, jsonResponse);
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", jsonResponse);
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    } else {
        request->send(400, "text/plain", "Falta el parametro 'state'");
    }
}

// Configuración inicial del ESP32
void setup() {
    Serial.begin(115200);
    pinMode(MOTION_PIN, INPUT);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    dht.begin();

    // Configuración de WiFiManager
    wifiManager.autoConnect("ESP32 Config Sensor", "password");
    Serial.println("");
    Serial.print("Conectado a WiFi. IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("MAC Address: ");
    Serial.println(WiFi.macAddress());

    // Configuración de mDNS
    if (MDNS.begin(hostname)) {
        Serial.printf("Servidor mDNS iniciado. Accede en: http://%s.local\n", hostname);
    }

    // Configuración de las rutas de la API
    server.on("/data", HTTP_GET, handleSensorData);
    server.on("/led", HTTP_POST, handleLedControl);
    server.begin();
    Serial.println("Servidor HTTP iniciado.");

    readSensors();
}

// Bucle principal (mantiene el servidor y mDNS actualizados)
void loop() {
    MDNS.update();
    delay(500);
}