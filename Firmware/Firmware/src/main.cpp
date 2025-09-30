#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiManager.h>
#include <ESPAsyncWebServer.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <Servo.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>

// Configuración de pines y dispositivos
#define DHT_PIN 4
#define DHT_TYPE DHT22 // Actualizado a DHT22
#define RAIN_PIN 35
#define GAS_PIN 34
#define MOTION_PIN 27
#define LED_PIN 2
#define DOOR_SERVO_PIN 13
#define TENDER_SERVO_PIN 14

// Pines para el teclado matricial
const byte ROWS = 4; // cuatro filas
const byte COLS = 4; // cuatro columnas
char hexaKeys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte rowPins[ROWS] = {19, 18, 5, 17}; // Conectar a los pines del ESP32
byte colPins[COLS] = {16, 23, 22, 21}; // Conectar a los pines del ESP32

// Objetos globales
AsyncWebServer server(80);
DHT dht(DHT_PIN, DHT_TYPE);
WiFiManager wifiManager;
Servo doorServo;
Servo tenderServo;
LiquidCrystal_I2C lcd(0x27, 16, 2); // Dirección del LCD, 16 columnas y 2 filas
Keypad customKeypad = Keypad(makeKeymap(hexaKeys), rowPins, colPins, ROWS, COLS);

const char* hostname = "domotica-esp32";
const char* password = "1234";
String enteredPassword = "";

// Estructura para almacenar las lecturas actuales y estados
struct SensorData {
    float temp;
    float hum;
    bool rain;
    int gas;
    bool motion;
    bool led_state;
    bool door_state;
    bool tender_state;
};
SensorData currentData = {0.0, 0.0, false, 0, false, false, false, false};

// Funciones para servomotores
void setDoorState(bool open) {
    int angle = open ? 90 : 0; // 90 grados para abrir, 0 para cerrar
    doorServo.write(angle);
    currentData.door_state = open;
}
void setTenderState(bool retracted) {
    int angle = retracted ? 0 : 90; // 0 para retraer, 90 para extender
    tenderServo.write(angle);
    currentData.tender_state = !retracted;
}

// Handler para la ruta /data que devuelve el JSON de los sensores y actuadores
void handleSensorData(AsyncWebServerRequest *request) {
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (!isnan(h) && !isnan(t)) {
        currentData.hum = h;
        currentData.temp = t;
    }
    currentData.rain = digitalRead(RAIN_PIN) == LOW; // El sensor de lluvia es activo bajo
    currentData.gas = map(analogRead(GAS_PIN), 0, 4095, 0, 1000);
    currentData.motion = digitalRead(MOTION_PIN) == HIGH;
    currentData.led_state = digitalRead(LED_PIN) == HIGH;
    
    StaticJsonDocument<512> doc;
    doc["temp"] = currentData.temp;
    doc["hum"] = currentData.hum;
    doc["rain"] = currentData.rain;
    doc["gas"] = currentData.gas;
    doc["motion"] = currentData.motion;
    doc["led_state"] = currentData.led_state;
    doc["door_state"] = currentData.door_state;
    doc["tender_state"] = currentData.tender_state;
    String jsonResponse;
    serializeJson(doc, jsonResponse);
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", jsonResponse);
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
}

// Handlers para actuadores
void handleLedControl(AsyncWebServerRequest *request) {
    if (request->hasParam("state", true)) {
        String state = request->getParam("state", true)->value();
        bool newState = (state == "on" || state == "1");
        digitalWrite(LED_PIN, newState ? HIGH : LOW);
        currentData.led_state = newState;
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("LED: ");
        lcd.print(newState ? "ENCENDIDO" : "APAGADO");
        request->send(200, "application/json", "{\"success\": true, \"led_state\": " + String(newState ? "true" : "false") + "}");
    } else {
        request->send(400, "text/plain", "Falta el parametro 'state'");
    }
}

void handleDoorControl(AsyncWebServerRequest *request) {
    if (request->hasParam("state", true)) {
        String state = request->getParam("state", true)->value();
        bool newState = (state == "open");
        setDoorState(newState);
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Puerta: ");
        lcd.print(newState ? "ABIERTA" : "CERRADA");
        request->send(200, "application/json", "{\"success\": true, \"door_state\": " + String(newState ? "true" : "false") + "}");
    } else {
        request->send(400, "text/plain", "Falta el parametro 'state'");
    }
}

void handleTenderControl(AsyncWebServerRequest *request) {
    if (request->hasParam("state", true)) {
        String state = request->getParam("state", true)->value();
        bool newState = (state == "extend");
        setTenderState(newState);
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Tendedero: ");
        lcd.print(newState ? "EXTENDIDO" : "RETRAIDO");
        request->send(200, "application/json", "{\"success\": true, \"tender_state\": " + String(newState ? "true" : "false") + "}");
    } else {
        request->send(400, "text/plain", "Falta el parametro 'state'");
    }
}

// Configuración inicial del ESP32
void setup() {
    Serial.begin(115200);
    pinMode(MOTION_PIN, INPUT);
    pinMode(LED_PIN, OUTPUT);
    pinMode(RAIN_PIN, INPUT);
    digitalWrite(LED_PIN, LOW);
    
    // Configurar servomotores
    doorServo.attach(DOOR_SERVO_PIN);
    setDoorState(false); // Puerta cerrada al iniciar
    tenderServo.attach(TENDER_SERVO_PIN);
    setTenderState(false); // Tendedero retraído al iniciar

    // Configurar LCD
    lcd.init();
    lcd.backlight();
    lcd.setCursor(0, 0);
    lcd.print("Iniciando...");

    // Configurar DHT
    dht.begin();

    // Configuración de WiFiManager
    wifiManager.autoConnect("ESP32 Domotica", "password");
    Serial.println("");
    Serial.print("Conectado a WiFi. IP: ");
    Serial.println(WiFi.localIP());

    // Configuración de mDNS
    if (MDNS.begin(hostname)) {
        Serial.printf("Servidor mDNS iniciado. Accede en: http://%s.local\n", hostname);
    }

    // Configuración de las rutas de la API
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(SPIFFS, "/index.HTML", "text/html");
    });
    server.on("/Style.css", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/Style.css", "text/css");
    });
    server.on("/Script.JS", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/Script.JS", "application/javascript");
    });
    server.on("/data", HTTP_GET, handleSensorData);
    server.on("/led", HTTP_POST, handleLedControl);
    server.on("/door", HTTP_POST, handleDoorControl);
    server.on("/tender", HTTP_POST, handleTenderControl);
    
    server.begin();
    Serial.println("Servidor HTTP iniciado.");

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Conectado a:");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
}

// Bucle principal
void loop() {
    MDNS.update();

    char key = customKeypad.getKey();
    if (key) {
        if (key == 'D') { // Tecla D para borrar
            enteredPassword = "";
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print("Contrasena:");
            lcd.setCursor(0, 1);
            lcd.print(enteredPassword);
        } else if (key == 'A') { // Tecla A para enviar
            if (enteredPassword == password) {
                lcd.clear();
                lcd.setCursor(0, 0);
                lcd.print("Acceso Correcto!");
                delay(2000);
            } else {
                lcd.clear();
                lcd.setCursor(0, 0);
                lcd.print("Acceso Denegado!");
                delay(2000);
            }
            enteredPassword = "";
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print("Contrasena:");
            lcd.setCursor(0, 1);
            lcd.print(enteredPassword);
        } else {
            enteredPassword += key;
            lcd.setCursor(0, 1);
            lcd.print(enteredPassword);
        }
    }
    delay(500);
}