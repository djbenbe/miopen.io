/*
   Syslog helper for forwarding log messages to a remote server
*/

#ifndef SYSLOG_HELPER_H
#define SYSLOG_HELPER_H

#pragma once
#include <Arduino.h>

// Apply the default local timezone before NVS is available.
void configureDefaultLogTimezone();

// Apply the timezone saved in NVS without starting SNTP.
void configureSavedLogTimezone();

// Start SNTP/NTP time sync after WiFi is connected. Non-blocking.
void startSyslogTimeSync();

// Retry time sync while connected and report when the clock becomes valid.
void maintainSyslogTimeSync();

// Return true when the system clock has been set by NTP/SNTP.
bool isSyslogTimeSynced();

// Initialize UDP + target IP from user_config.h
void initSyslog();

// Load saved syslog settings without resolving the server or opening UDP.
void loadSyslogConfig();

// Reset the UDP sender state so that configuration changes are applied
void resetSyslog();

// Legacy signature (no severity)
void sendSyslog(const String &msg);

// New signature with explicit severity (0..7)
// 0 emerg, 1 alert, 2 crit, 3 err, 4 warn, 5 notice, 6 info, 7 debug
void sendSyslog(const String &msg, int severity);

#endif // SYSLOG_HELPER_H

