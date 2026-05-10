/*
   Copyright (c) 2024. CRIDP https://github.com/cridp

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

           http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

#include <wifi_helper.h>
#include <oled_display.h>
#include <user_config.h>
#if defined(MQTT)
#include <mqtt_handler.h>
#endif
#include <WiFiManager.h>
#include <ESPmDNS.h>

TimerHandle_t wifiReconnectTimer;

WiFiStatus wifiStatus = { ConnState::Disconnected, 0 };

namespace {
    constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 8000;
    constexpr uint32_t WIFI_RECONNECT_INTERVAL_MS = 15000;
    constexpr uint16_t WIFI_CONFIG_PORTAL_TIMEOUT_SEC = 180;
    constexpr uint8_t WIFI_RESTART_AFTER_FAILURES = 3;

    TaskHandle_t wifiReconnectTaskHandle = nullptr;
    bool mdnsStarted = false;
    uint8_t reconnectFailures = 0;

    int rssiToQuality(int32_t rssi) {
        if (rssi <= -100) return 0;
        if (rssi >= -50) return 100;
        return 2 * (rssi + 100);
    }

    void startWifiReconnectTimer() {
        if (wifiReconnectTimer) {
            xTimerStart(wifiReconnectTimer, 0);
        }
    }

    void connectToWifiInternal(bool allowConfigPortal);

    void wifiReconnectTask(void * /*arg*/) {
        connectToWifiInternal(false);
        wifiReconnectTaskHandle = nullptr;
        vTaskDelete(nullptr);
    }

    void scheduleWifiReconnect(TimerHandle_t /*timer*/) {
        if (wifiReconnectTaskHandle) {
            return;
        }
        xTaskCreatePinnedToCore(
            wifiReconnectTask,
            "wifiReconnect",
            4096,
            nullptr,
            1,
            &wifiReconnectTaskHandle,
            tskNO_AFFINITY
        );
    }
}

void initWifi() {
    wifiReconnectTimer = xTimerCreate(
        "wifiTimer",
        pdMS_TO_TICKS(WIFI_RECONNECT_INTERVAL_MS),
        pdFALSE,
        nullptr,
        scheduleWifiReconnect
    );
    if (!wifiReconnectTimer) {
        Serial.println("Failed to create WiFi reconnect timer");
    }
    connectToWifiInternal(true);
}

void connectToWifi(TimerHandle_t /*timer*/) {
    connectToWifiInternal(false);
}

namespace {
void connectToWifiInternal(bool allowConfigPortal) {
    if (WiFi.status() == WL_CONNECTED) {
        wifiStatus = { ConnState::Connected, rssiToQuality(WiFi.RSSI()) };
        return;
    }

    Serial.println("Connecting to Wi-Fi...");
    wifiStatus = { ConnState::Connecting, 0 };

    updateDisplayStatus();

    if (!allowConfigPortal && reconnectFailures >= WIFI_RESTART_AFTER_FAILURES) {
        Serial.println("Restarting WiFi radio after repeated reconnect failures");
        WiFi.disconnect(false, false);
        delay(100);
        reconnectFailures = 0;
    }

    WiFi.mode(WIFI_STA);
    WiFi.setHostname("MIOPENIO");
    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);

    unsigned long startTime = millis();
    WiFi.begin();
    wl_status_t result = static_cast<wl_status_t>(WiFi.waitForConnectResult(WIFI_CONNECT_TIMEOUT_MS));

    bool res = false;
    if (result == WL_CONNECTED) {
        res = true;
    } else if (allowConfigPortal) {
        WiFiManager wm;
        wm.setConnectTimeout(WIFI_CONNECT_TIMEOUT_MS / 1000);
        wm.setConfigPortalTimeout(WIFI_CONFIG_PORTAL_TIMEOUT_SEC);
        Serial.println("Stored WiFi credentials failed, launching WiFiManager portal");
        res = wm.autoConnect("iohc-setup");
    } else {
        Serial.println("Stored WiFi credentials failed, retrying later");
    }

    unsigned long duration = millis() - startTime;

    if (!res) {
        Serial.printf("WiFi connection failed after %lu ms\n", duration);
        wifiStatus = { ConnState::Disconnected, 0 };
        reconnectFailures++;

        // Retry later
        startWifiReconnectTimer();
    } else {
        reconnectFailures = 0;
        Serial.printf("Connected to WiFi in %lu ms. IP address: %s\n", duration,
                      WiFi.localIP().toString().c_str());
        wifiStatus = { ConnState::Connected, rssiToQuality(WiFi.RSSI()) };

        if (mdnsStarted) {
            MDNS.end();
            mdnsStarted = false;
        }
        if (!MDNS.begin("miopenio")) {
            Serial.println("Error setting up MDNS responder!");
        } else {
            mdnsStarted = true;
            Serial.println("MDNS responder started at http://miopenio.local");
        }
#if defined(MQTT)
        // Establish MQTT connection if needed and MQTT client is initialized
        if (mqttReconnectTimer && !mqttClient.connected() &&
            mqttStatus != ConnState::Connecting) {
            connectToMqtt();
        }
#endif
    }
}
}

void checkWifiConnection() {
    if (WiFi.status() != WL_CONNECTED) {
        if (wifiStatus.connectionStatus == ConnState::Connected) {
            Serial.println("WiFi connection lost");
            wifiStatus = { ConnState::Disconnected, 0 };
            updateDisplayStatus();

            startWifiReconnectTimer();
        }     
    }
}
