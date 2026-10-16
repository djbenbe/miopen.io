#include "backup_format.h"
#include <cassert>

static JsonDocument sample() {
    JsonDocument doc;
    const auto error = deserializeJson(doc, R"({
      "format": "miopen-2w-backup", "version": 1,
      "twoW": {
        "controller": "ba11ad",
        "systemKey": "000102030405060708090a0b0c0d0e0f",
        "devices": {"abc123": {"values": "abc12300800101000000"}}
      }
    })");
    assert(!error);
    return doc;
}

int main() {
    auto doc = sample();
    assert(BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    assert(BackupFormat::valid(doc.as<JsonVariantConst>(), "BA11AD"));
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "123456"));
    doc["twoW"]["cozy"]["123456"]["dst"] = "abcdef";
    doc["twoW"]["other"]["abcdef"]["dst"] = "123456";
    assert(BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc["twoW"]["other"]["abcdef"]["dst"] = "invalid";
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc["twoW"]["other"]["abcdef"]["dst"] = "ballad";
    assert(BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc = sample();
    doc["twoW"]["systemKey"] = "not-a-key";
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc = sample();
    doc["twoW"].remove("systemKey");
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc = sample();
    doc["twoW"]["devices"]["abc123"]["values"] = "def12300800101000000";
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc["twoW"]["devices"]["abc123"]["values"] = "abc123";
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc = sample();
    doc["format"] = "miopen-backup";
    doc["version"] = 2;
    doc["devices"].to<JsonObject>();
    doc["remotes"].to<JsonObject>();
    assert(BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc["version"] = 3;
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc["version"] = 1;
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc.remove("twoW");
    assert(BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc["devices"] = nullptr;
    doc["remotes"].to<JsonArray>();
    assert(BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
    doc.remove("remotes");
    assert(!BackupFormat::valid(doc.as<JsonVariantConst>(), "ba11ad"));
}
