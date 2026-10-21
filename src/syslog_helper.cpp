#include "syslog_helper.h"
#include <user_config.h>   // provides SYSLOG, syslog_server, syslog_port

#if defined(SYSLOG)

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <esp_log.h>
#include <esp_random.h>
#include <log_buffer.h>
#include <nvs_helpers.h>
#include <time.h>
#include "apps/sntp/sntp.h"

// Arduino Core 2.0.17 exposes the base SNTP header but omits this extended
// ESP-IDF declaration from the application include path.
extern "C" {
    typedef void (*sntp_sync_time_cb_t)(struct timeval *);
    void sntp_set_time_sync_notification_cb(sntp_sync_time_cb_t callback);
}

// ===== Config (adjust if you like) =====
#ifndef SYSLOG_FACILITY
#define SYSLOG_FACILITY 16           // local0
#endif

#ifndef SYSLOG_APP
#define SYSLOG_APP "MIOPENIO"        // rsyslog will use this as %PROGRAMNAME%
#endif

// Define SYSLOG_RFC5424 to send RFC5424 instead of RFC3164
// #define SYSLOG_RFC5424

namespace {
    WiFiUDP      syslogUdp;
    IPAddress    syslogIP;
    bool         syslogReady  = false;
    bool         configLoaded = false;
    bool         timeSyncAttempted = false;
    bool         timeSyncReported = false;
    volatile bool timeSyncReceived = false;
    uint32_t     lastTimeSyncAttemptMs = 0;
    uint32_t     syslogBackoffUntilMs = 0;
    uint32_t     lastSyslogSendMs = 0;
    static constexpr time_t MIN_VALID_UNIX_TIME = 1704067200; // 2024-01-01, avoids fake boot dates.
    static constexpr uint32_t TIME_SYNC_RETRY_MS = 60000;
    static constexpr uint32_t SYSLOG_MIN_SEND_INTERVAL_MS = 250;
    static constexpr uint32_t SYSLOG_ERROR_BACKOFF_MS = 60000;
    static const char *TAG    = "SYSLOG";
    static constexpr size_t SNTP_SERVER_MAX_LEN = 256;
    static constexpr size_t TIMEZONE_MAX_LEN = 128;
    static char sntpServer[SNTP_SERVER_MAX_LEN] = "pool.ntp.org";
    static char sntpTimezone[TIMEZONE_MAX_LEN] = "CET-1CEST,M3.5.0,M10.5.0/3";

    void onSntpTimeSync(struct timeval *) {
        timeSyncReceived = true;
    }


    String configuredSntpServer(bool *isCustomServer = nullptr) {
        std::string sntp;
        if (nvs_read_string(NVS_KEY_NET_SNTP, sntp) && !sntp.empty()) {
            if (isCustomServer) *isCustomServer = true;
            return String(sntp.c_str());
        }
        if (isCustomServer) *isCustomServer = false;
        return String("pool.ntp.org");
    }

    String configuredTimezone() {
        std::string tz;
        if (nvs_read_string(NVS_KEY_NET_TZ, tz) && !tz.empty()) {
            return String(tz.c_str());
        }
        return String("CET-1CEST,M3.5.0,M10.5.0/3");
    }

    bool hasValidSystemTime() {
        return time(nullptr) >= MIN_VALID_UNIX_TIME;
    }
    inline int pri(int facility, int severity) {
        if (severity < 0) severity = 6;     // default info
        if (severity > 7) severity = 7;
        return facility * 8 + severity;
    }

    void ensureConfigLoaded() {
        if (configLoaded) {
            return;
        }

        bool enabled = syslog_enabled;
        if (nvs_read_bool(NVS_KEY_SYSLOG_ENABLED, enabled)) {
            syslog_enabled = enabled;
        } else {
            nvs_write_bool(NVS_KEY_SYSLOG_ENABLED, syslog_enabled);
        }

        if (!nvs_read_string(NVS_KEY_SYSLOG_SERVER, syslog_server)) {
            // No server stored yet — pre-fill community server as default
            syslog_server = "syslog.speijkers.nl";
            nvs_write_string(NVS_KEY_SYSLOG_SERVER, syslog_server);
        }

        if (!nvs_read_u16(NVS_KEY_SYSLOG_PORT, syslog_port)) {
            syslog_port = 5144;
            nvs_write_u16(NVS_KEY_SYSLOG_PORT, syslog_port);
        }

        if (!nvs_read_string(NVS_KEY_SYSLOG_TAG, syslog_tag) || syslog_tag.empty()) {
            // Auto-generate a random 8-char hex ID on first boot
            char generated[9];
            snprintf(generated, sizeof(generated), "%08x", esp_random());
            syslog_tag = generated;
            nvs_write_string(NVS_KEY_SYSLOG_TAG, syslog_tag);
        }

        configLoaded = true;
    }

#ifndef SYSLOG_RFC5424
    // RFC3164 timestamp: "Jan  2 15:04:05" (local time)
    String rfc3164Timestamp() {
        time_t now = time(nullptr);
        struct tm tmnow;
        localtime_r(&now, &tmnow);
        char buf[32];
        strftime(buf, sizeof(buf), "%b %e %T", &tmnow);
        return String(buf);
    }
#else
    // RFC5424 timestamp: "YYYY-MM-DDTHH:MM:SSZ" (UTC)
    String iso8601UTC() {
        time_t now = time(nullptr);
        struct tm tmnow;
        gmtime_r(&now, &tmnow);
        char buf[32];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmnow);
        return String(buf);
    }
#endif

    String currentHostIdent() {
        const char *h = WiFi.getHostname();
        if (h && *h) return String(h);
        return WiFi.localIP().toString();
    }
}

// Start SNTP once WiFi is connected. This is intentionally non-blocking.
void startSyslogTimeSync() {
    ensureConfigLoaded();
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    const uint32_t nowMs = millis();
    if (timeSyncReceived ||
        (timeSyncAttempted && nowMs - lastTimeSyncAttemptMs < TIME_SYNC_RETRY_MS)) {
        return;
    }

    const String timezone = configuredTimezone();
    bool customServer = false;
    const String server = configuredSntpServer(&customServer);
    snprintf(sntpServer, sizeof(sntpServer), "%s", server.c_str());
    snprintf(sntpTimezone, sizeof(sntpTimezone), "%s", timezone.c_str());
    if (customServer) {
        configTzTime(sntpTimezone, sntpServer);
    } else {
        configTzTime(sntpTimezone, sntpServer, "time.google.com", "time.cloudflare.com");
    }
    sntp_set_time_sync_notification_cb(onSntpTimeSync);
    lastTimeSyncAttemptMs = nowMs;
    const bool retry = timeSyncAttempted;
    timeSyncAttempted = true;

    addLogMessage(String("Time synchronization ") + (retry ? "retry" : "started") +
                  " using " + server + (customServer ? " (configured only)" : ""));
}

void maintainSyslogTimeSync() {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (!timeSyncReceived) {
        startSyslogTimeSync();
        return;
    }

    if (!timeSyncReported) {
        timeSyncReported = true;
        const time_t now = time(nullptr);
        struct tm localTime;
        localtime_r(&now, &localTime);
        char timestamp[24];
        strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", &localTime);
        addLogMessage("Time synchronized: " + String(timestamp));
    }
}

bool isSyslogTimeSynced() {
    return timeSyncReceived && hasValidSystemTime();
}

void loadSyslogConfig() {
    ensureConfigLoaded();
}

// Initialize UDP + resolve syslog IP from user_config.h
void initSyslog() {
    loadSyslogConfig();

    if (!syslog_enabled) {
        resetSyslog();
        return;
    }

    if (syslog_server.empty()) {
        resetSyslog();
        return;
    }

    if (syslog_port == 0 || syslog_port > 65535) {
        resetSyslog();
        return;
    }

    if (WiFi.status() != WL_CONNECTED) {
        resetSyslog();
        return;
    }

    if (!syslogIP.fromString(syslog_server.c_str())) {
        if (WiFi.hostByName(syslog_server.c_str(), syslogIP) != 1) {
            resetSyslog();
            return;
        }
    }

    if (!syslogReady) {
        syslogUdp.begin(0);
        syslogReady = true;
    }
}

// Real sender with RFC header
void sendSyslog(const String &msg, int severity) {
    ensureConfigLoaded();
    if (!syslog_enabled) {
        return;
    }
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }
    if (!syslogReady) {
        initSyslog();
    }
    if (!syslog_enabled || !syslogReady) {
        return;
    }

    const int p     = pri(SYSLOG_FACILITY, severity);
    const String base = currentHostIdent();
    const String ho = syslog_tag.empty() ? base : (syslog_tag.c_str() + String("-") + base);

#ifndef SYSLOG_RFC5424
    const String timestamp = hasValidSystemTime() ? (rfc3164Timestamp() + " ") : "";
#else
    const String timestamp = hasValidSystemTime() ? (iso8601UTC() + " ") : "";
#endif
    const String header = "<" + String(p) + ">" + timestamp + ho + " " + SYSLOG_APP + ": ";
    const String timeNote = hasValidSystemTime() ? "" : ("uptime_ms=" + String(millis()) + " ");
    const String wire   = header + "[" SYSLOG_SECRET "] " + timeNote + msg;
    const uint32_t nowMs = millis();
    if (static_cast<int32_t>(nowMs - syslogBackoffUntilMs) < 0) {
        return;
    }
    if (lastSyslogSendMs != 0 && nowMs - lastSyslogSendMs < SYSLOG_MIN_SEND_INTERVAL_MS) {
        return;
    }

    if (!syslogUdp.beginPacket(syslogIP, syslog_port)) {
        resetSyslog();
        syslogBackoffUntilMs = nowMs + SYSLOG_ERROR_BACKOFF_MS;
        return;
    }
    const size_t written = syslogUdp.write(reinterpret_cast<const uint8_t*>(wire.c_str()), wire.length());
    if (written != wire.length() || !syslogUdp.endPacket()) {
        resetSyslog();
        syslogBackoffUntilMs = nowMs + SYSLOG_ERROR_BACKOFF_MS;
        return;
    }
    lastSyslogSendMs = nowMs;
}

// Legacy overload without severity (defaults to info)
void sendSyslog(const String &msg) {
    sendSyslog(msg, 6);
}

void resetSyslog() {
    if (syslogReady) {
        syslogUdp.stop();
        syslogReady = false;
    }
}

#else  // !SYSLOG

// No-op definitions so you can build without SYSLOG
void startSyslogTimeSync() {}
void maintainSyslogTimeSync() {}
bool isSyslogTimeSynced() { return false; }
void loadSyslogConfig() {}
void initSyslog() {}
void resetSyslog() {}
void sendSyslog(const String &) {}
void sendSyslog(const String &, int) {}


#endif // SYSLOG
