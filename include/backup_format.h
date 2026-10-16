#pragma once

#include <ArduinoJson.h>
#include <cctype>
#include <cstring>

namespace BackupFormat {
inline bool isHex(const char *text, size_t length) {
    if (!text || std::strlen(text) != length) return false;
    for (size_t i = 0; i < length; ++i) {
        if (!std::isxdigit(static_cast<unsigned char>(text[i]))) return false;
    }
    return true;
}

inline bool sameHex(const char *a, const char *b, size_t length) {
    if (!isHex(a, length) || !isHex(b, length)) return false;
    for (size_t i = 0; i < length; ++i) {
        if (std::tolower(static_cast<unsigned char>(a[i])) !=
            std::tolower(static_cast<unsigned char>(b[i]))) return false;
    }
    return true;
}

inline bool isLegacyCollection(JsonVariantConst value) {
    // Version 1 exported null or an empty array when a file was absent.
    return value.is<JsonObjectConst>() || value.isNull() ||
           (value.is<JsonArrayConst>() && value.size() == 0);
}

inline bool validTwoW(JsonVariantConst twoW, const char *controller) {
    if (!twoW["devices"].is<JsonObjectConst>() || !isHex(twoW["systemKey"], 32) ||
        !sameHex(twoW["controller"], controller, 6)) return false;
    for (JsonPairConst section : twoW.as<JsonObjectConst>()) {
        if (section.key() != "cozy" && section.key() != "other") continue;
        if (!section.value().is<JsonObjectConst>()) return false;
        for (JsonPairConst item : section.value().as<JsonObjectConst>()) {
            // Preserve the historical gateway placeholder in bundled Cozy/Other profiles.
            const bool legacyGateway = item.value()["dst"] == "ballad";
            if (!isHex(item.key().c_str(), 6) || (!legacyGateway && !isHex(item.value()["dst"], 6))) return false;
        }
    }
    for (JsonPairConst item : twoW["devices"].as<JsonObjectConst>()) {
        const char *node = item.key().c_str();
        const char *values = item.value()["values"];
        if (!isHex(node, 6) || !isHex(values, 20)) return false;
        char storedNode[7] = {};
        std::memcpy(storedNode, values, 6);
        if (!sameHex(node, storedNode, 6)) return false;
    }
    return true;
}

inline bool isTwoWOnly(JsonVariantConst backup) {
    return backup["format"] == "miopen-2w-backup";
}

inline bool valid(JsonVariantConst backup, const char *controller) {
    if (isTwoWOnly(backup)) {
        return backup["version"].is<int>() && backup["version"].as<int>() == 1 &&
               validTwoW(backup["twoW"], controller);
    }
    if (backup["format"] != "miopen-backup" || !backup["version"].is<int>()) return false;
    const int version = backup["version"].as<int>();
    if (version != 1 && version != 2) return false;
    const auto root = backup.as<JsonObjectConst>();
    bool hasDevices = false, hasRemotes = false, hasTwoW = false;
    for (JsonPairConst item : root) {
        if (item.key() == "devices") hasDevices = true;
        if (item.key() == "remotes") hasRemotes = true;
        if (item.key() == "twoW") hasTwoW = true;
    }
    if (!hasDevices || !hasRemotes || !isLegacyCollection(backup["devices"]) ||
        !isLegacyCollection(backup["remotes"])) return false;
    for (JsonPairConst item : backup["devices"].as<JsonObjectConst>()) {
        const auto entry = item.value();
        if (!isHex(item.key().c_str(), 6) || !isHex(entry["key"], 32) ||
            !isHex(entry["sequence"], 4) || !entry["type"].is<JsonArrayConst>()) return false;
        for (JsonVariantConst type : entry["type"].as<JsonArrayConst>()) {
            if (!type.is<uint8_t>()) return false;
        }
    }
    for (JsonPairConst item : backup["remotes"].as<JsonObjectConst>()) {
        const auto entry = item.value();
        if (!isHex(item.key().c_str(), 6) || !entry["name"].is<const char *>() ||
            !entry["devices"].is<JsonArrayConst>()) return false;
        for (JsonVariantConst device : entry["devices"].as<JsonArrayConst>()) {
            if (!device.is<const char *>()) return false;
        }
    }
    if (version == 1) return !hasTwoW;
    return validTwoW(backup["twoW"], controller);
}
}
