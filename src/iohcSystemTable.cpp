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

#include <iohcSystemTable.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <backup_format.h>
#include <crypto2Wutils.h>

#include <utility>

namespace IOHC {
    iohcSystemTable *iohcSystemTable::_iohcSystemTable = nullptr;

    iohcSystemTable::iohcSystemTable() { this->load(); }

    iohcSystemTable *iohcSystemTable::getInstance() {
        if (!_iohcSystemTable)
            _iohcSystemTable = new iohcSystemTable();
        return _iohcSystemTable;
    }

    bool iohcSystemTable::addObject(address node, address backbone, uint8_t actuator[2], uint8_t manufacturer, uint8_t flags) {
        changed = true;
        std::string s0 = bytesToHexString(node, 3);
        auto *tmp = new iohcObject (node, backbone, actuator, manufacturer, flags);
        auto it = _objects.find(s0);
        if (it != _objects.end()) delete it->second;
        _objects.insert_or_assign(s0, tmp);
        return this->save();
    }

    bool iohcSystemTable::addObject(iohcObject *obj) {
        changed = true;
        std::string s0 = bytesToHexString(reinterpret_cast<uint8_t *>(obj->getNode()), 3);
        bool inserted = _objects.insert_or_assign(s0, obj).second;
        this->save();
        return inserted;
    }

    bool iohcSystemTable::addObject(std::string node_id, std::string serialized)  {
        auto *tmp = new iohcObject (std::move(serialized));
        bool inserted = _objects.insert_or_assign(node_id, tmp).second;
        this->save();
        return inserted;
    }

    bool iohcSystemTable::empty() {
        return(_objects.empty());
    }

    uint8_t iohcSystemTable::size() {
        return(_objects.size());
    }

    void iohcSystemTable::clear() {
        for (auto &kv : _objects) {
            if (kv.second) delete kv.second;
        }
        _objects.clear();
    }

    iohcSystemTable::~iohcSystemTable() {
        clear();
        if (_iohcSystemTable == this) _iohcSystemTable = nullptr;
    }

    inline iohcSystemTable::Objects::iterator iohcSystemTable::begin() {
        return(_objects.begin());
    }

    inline iohcSystemTable::Objects::iterator iohcSystemTable::end() {
        return(_objects.end());
    }

    bool iohcSystemTable::load()  {
        if (LittleFS.exists(IOHC_SYS_TABLE))
            Serial.printf("Loading systable objects from %s\n", IOHC_SYS_TABLE);
        else  {
            Serial.printf("*systable objects not available\n");
            return false;
        }

        fs::File f = LittleFS.open(IOHC_SYS_TABLE, "r", true);
        /*Dynamic*/JsonDocument doc; //(2048);
        DeserializationError error = deserializeJson(doc, f);
        f.close();

        if (error) {
            Serial.print("Failed to parse JSON: ");
            Serial.println(error.c_str());
            return false;
        }

        clear();
        // Loading must not append or rewrite the file being restored.
        for (JsonPair kv : doc.as<JsonObject>())  {
            const char* key = kv.key().c_str();
            auto obj = kv.value().as<JsonObject>();
            if (obj["values"].is<std::string>())
                _objects.emplace(key, new iohcObject(obj["values"].as<std::string>()));
        }
        changed = false;
        return true;
    }

    bool iohcSystemTable::save(bool force)  {
        if (!changed && force == false)
            return false;

        const char *temporaryPath = IOHC_SYS_TABLE ".tmp";
        fs::File f = LittleFS.open(temporaryPath, "w");
        if (!f) return false;
        /*Dynamic*/JsonDocument doc; //(2048);

        for (auto [fst, snd] : _objects) {
            auto jobj = doc[fst].to<JsonObject>();

            jobj["values"] = snd->serialize();
        }
        const size_t expected = measureJson(doc);
        const size_t written = serializeJson(doc, f);
        f.flush();
        f.close();
        if (written != expected || !LittleFS.rename(temporaryPath, IOHC_SYS_TABLE)) return false;
        changed = false;

        return true;
    }

    bool iohcSystemTable::savePairing(const address controller) {
        JsonDocument doc;
        doc["format"] = "miopen-2w-backup";
        doc["version"] = 1;
        auto twoW = doc["twoW"].to<JsonObject>();
        twoW["controller"] = bytesToHexString(controller, 3);
        twoW["systemKey"] = bytesToHexString(system_key, sizeof(system_key));
        auto devices = twoW["devices"].to<JsonObject>();
        for (const auto &entry : _objects) devices[entry.first]["values"] = entry.second->serialize();
        if (doc.overflowed()) return false;
        const char *temporaryPath = IOHC_2W_PAIRING_FILE ".tmp";
        fs::File file = LittleFS.open(temporaryPath, "w");
        if (!file) return false;
        const size_t written = serializeJson(doc, file);
        file.flush();
        file.close();
        if (written == measureJson(doc) && LittleFS.rename(temporaryPath, IOHC_2W_PAIRING_FILE)) return true;
        LittleFS.remove(temporaryPath);
        return false;
    }

    bool iohcSystemTable::loadPairing(const address controller) {
        fs::File file = LittleFS.open(IOHC_2W_PAIRING_FILE, "r");
        if (!file) return false;
        JsonDocument doc;
        const auto error = deserializeJson(doc, file);
        file.close();
        const std::string controllerId = bytesToHexString(controller, 3);
        if (error || !BackupFormat::isTwoWOnly(doc.as<JsonVariantConst>()) ||
            !BackupFormat::valid(doc.as<JsonVariantConst>(), controllerId.c_str())) return false;
        clear();
        for (JsonPair entry : doc["twoW"]["devices"].as<JsonObject>()) {
            _objects.emplace(entry.key().c_str(), new iohcObject(entry.value()["values"].as<std::string>()));
        }
        hexStringToBytes(doc["twoW"]["systemKey"].as<std::string>(), system_key);
        changed = false;
        return true;
    }

    void iohcSystemTable::dump1W()  {
        Serial.printf("********************** 1W sysTable objects ***********************\n");
        for (auto entry : _objects)
            entry.second->dump1W();
        Serial.printf("\n");
    }
    void iohcSystemTable::dump2W()  {
        Serial.printf("********************** 2W sysTable objects ***********************\n");
        for (auto entry : _objects)
            entry.second->dump2W();
        Serial.printf("\n");
    }
}
