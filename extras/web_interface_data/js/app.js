(function () {
    function createElements() {
        return {
            addPopupButton: document.getElementById("add-popup"),
            commandDeviceSelect: document.querySelector("#logs-page #device-select"),
            commandInput: document.getElementById("command-input"),
            deviceList: document.getElementById("device-list"),
            backupFileInput: document.getElementById("backup-file"),
            backupUploadButton: document.getElementById("upload-backup"),
            downloadBackupButton: document.getElementById("download-backup"),
            devicesFileInput: document.getElementById("devices-file"),
            devicesUploadButton: document.getElementById("upload-devices"),
            downloadDevicesButton: document.getElementById("download-devices"),
            downloadRemotesButton: document.getElementById("download-remotes"),
            filesystemFileInput: document.getElementById("filesystem-file"),
            filesystemUploadButton: document.getElementById("upload-filesystem"),
            firmwareFileInput: document.getElementById("firmware-file"),
            firmwareUploadButton: document.getElementById("upload-firmware"),
            helpDeviceButton: document.getElementById("help-device"),
            helpRemoteButton: document.getElementById("help-remote"),
            lastAddrInput: document.getElementById("last-address"),
            mqttDiscoveryInput: document.getElementById("mqtt-discovery"),
            mqttPasswordInput: document.getElementById("mqtt-password"),
            mqttPortInput: document.getElementById("mqtt-port"),
            mqttServerInput: document.getElementById("mqtt-server"),
            mqttUpdateButton: document.getElementById("mqtt-update"),
            mqttUserInput: document.getElementById("mqtt-user"),
            mqttAllowAnonymousInput: document.getElementById("mqtt-allow-anonymous"),
            wifiSsidInput: document.getElementById("wifi-ssid"),
            wifiPasswordInput: document.getElementById("wifi-password"),
            wifiScanButton: document.getElementById("wifi-scan-btn"),
            wifiScanResults: document.getElementById("wifi-scan-results"),
            wifiConfigSaveButton: document.getElementById("wifi-config-save"),
            wifiConfigStatus: document.getElementById("wifi-config-status"),
            networkHostnameInput: document.getElementById("net-hostname"),
            networkDhcpInput: document.getElementById("net-dhcp"),
            networkIpInput: document.getElementById("net-ip"),
            networkMaskInput: document.getElementById("net-mask"),
            networkGatewayInput: document.getElementById("net-gateway"),
            networkDns1Input: document.getElementById("net-dns1"),
            networkDns2Input: document.getElementById("net-dns2"),
            networkSntpInput: document.getElementById("net-sntp"),
            networkTzInput: document.getElementById("net-tz"),
            networkStatus: document.getElementById("network-status"),
            networkSaveButton: document.getElementById("network-save"),
            fallbackEnabledInput: document.getElementById("fallback-enabled"),
            fallbackRetriesBootInput: document.getElementById("fallback-retries-boot"),
            fallbackRetriesRunningInput: document.getElementById("fallback-retries-running"),
            fallbackTimeoutInput: document.getElementById("fallback-timeout"),
            fallbackStatus: document.getElementById("fallback-status"),
            fallbackSaveButton: document.getElementById("fallback-save"),
            displayEnabledInput: document.getElementById("display-enabled"),
            displayUpdateButton: document.getElementById("display-update"),
            displayStatus: document.getElementById("display-status"),
            syslogEnabledInput: document.getElementById("syslog-enabled"),
            syslogServerInput: document.getElementById("syslog-server"),
            syslogPortInput: document.getElementById("syslog-port"),
            syslogTagInput: document.getElementById("syslog-tag"),
            syslogUpdateButton: document.getElementById("syslog-update"),
            syslogTestButton: document.getElementById("syslog-test"),
            remotePopupButton: document.getElementById("remote-popup"),
            remotesFileInput: document.getElementById("remotes-file"),
            remotesUploadButton: document.getElementById("upload-remotes"),
            sendCommandButton: document.getElementById("send-command-button"),
            statusMessages: document.getElementById("status-messages"),
            suggestions: document.getElementById("suggestions"),
            themeToggle: document.getElementById("toggle-theme"),
            twowStatus: document.getElementById("twow-status"),
            twowLastTx: document.getElementById("twow-last-tx"),
            twowLastResult: document.getElementById("twow-last-result"),
            twowLastRx: document.getElementById("twow-last-rx"),
            twowLastData: document.getElementById("twow-last-data"),
            twowLog: document.getElementById("twow-log"),
            twowPowerOnButton: document.getElementById("twow-poweron"),
            twowMidnightButton: document.getElementById("twow-midnight"),
            twowAssociateButton: document.getElementById("twow-associate"),
            twowAckButton: document.getElementById("twow-ack"),
            twowTempInput: document.getElementById("twow-temp"),
            twowSetTempButton: document.getElementById("twow-settemp"),
            twowModeInput: document.getElementById("twow-mode"),
            twowSetModeButton: document.getElementById("twow-setmode"),
            twowPresenceInput: document.getElementById("twow-presence"),
            twowSetPresenceButton: document.getElementById("twow-setpresence"),
            twowWindowInput: document.getElementById("twow-window"),
            twowSetWindowButton: document.getElementById("twow-setwindow"),
            twowPairButton: document.getElementById("twow-pair"),
            twowPairAltButton: document.getElementById("twow-pair-alt"),
            twowPairKeyButton: document.getElementById("twow-pair-key"),
            twowListenButton: document.getElementById("twow-listen"),
            twowListenSlowButton: document.getElementById("twow-listen-slow"),
            twowSurveyButton: document.getElementById("twow-survey"),
            twowDiscover28Button: document.getElementById("twow-discover28"),
            twowDiscover2AButton: document.getElementById("twow-discover2a"),
            twowFake0Button: document.getElementById("twow-fake0"),
            twowCustomInput: document.getElementById("twow-custom"),
            twowSendCustomButton: document.getElementById("twow-sendcustom"),
            twowCustom60Input: document.getElementById("twow-custom60"),
            twowSendCustom60Button: document.getElementById("twow-sendcustom60"),
            twowSurveyTableBody: document.querySelector("#twow-survey-table tbody")
        };
    }

    function i18nText(key, fallback) {
        if (typeof window.t === "function") {
            const value = window.t(key);
            if (value && value !== key) {
                return value;
            }
        }
        return fallback || key;
    }

    function logStatus(app, message, isError) {
        if (!app.elements.statusMessages || !message) {
            return;
        }



        const logEntry = document.createElement("p");
        logEntry.textContent = message;
        if (isError) {
            logEntry.style.color = "red";
        }

        app.elements.statusMessages.appendChild(logEntry);
        app.elements.statusMessages.scrollTop = app.elements.statusMessages.scrollHeight;
        while (app.elements.statusMessages.children.length > 300) {
            app.elements.statusMessages.removeChild(app.elements.statusMessages.firstChild);
        }
    }

    async function loadLogBuffer(app) {
        if (!app.elements.statusMessages || !window.MiOpenApi) {
            return;
        }
        try {
            const logs = await window.MiOpenApi.requestJson("/api/logs");
            app.elements.statusMessages.textContent = "";
            if (Array.isArray(logs)) {
                logs.forEach(function (message) {
                    logStatus(app, message);
                });
            }
        } catch (error) {
            logStatus(app, "Could not load log buffer", true);
        }
    }

    function initSuggestions(app) {
        const suggestions = ["add", "remove", "close", "open", "ls", "cat"];
        if (!app.elements.suggestions) {
            return;
        }
        app.elements.suggestions.textContent = "";

        suggestions.forEach(function (item) {
            const option = document.createElement("option");
            option.value = item;
            option.textContent = item;
            app.elements.suggestions.appendChild(option);
        });

        app.elements.suggestions.addEventListener("change", function () {
            if (!app.elements.suggestions.value) {
                return;
            }

            if (app.elements.commandInput.value !== "" &&
                !app.elements.commandInput.value.endsWith(" ")) {
                app.elements.commandInput.value += " ";
            }

            app.elements.commandInput.value += app.elements.suggestions.value + " ";
            app.elements.commandInput.focus();
            app.elements.suggestions.selectedIndex = 0;
        });
    }

    function initTheme(app) {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") {
            document.body.classList.add("dark-mode");
        }

        if (app.elements.themeToggle) {
            app.elements.themeToggle.addEventListener("click", function () {
                document.body.classList.toggle("dark-mode");
                localStorage.setItem(
                    "theme",
                    document.body.classList.contains("dark-mode") ? "dark" : "light"
                );
            });
        }
    }

    function initHelpButtons(app) {
        if (app.elements.helpDeviceButton) {
            app.elements.helpDeviceButton.addEventListener("click", function () {
                app.openPopup(
                    app.i18nText("popup.help_title", "Help"),
                    app.i18nText("popup.help_device", "help device"),
                    [],
                    app.i18nText("help.device", "No help text").split("\n"),
                    { showSave: false }
                );
            });
        }

        if (app.elements.helpRemoteButton) {
            app.elements.helpRemoteButton.addEventListener("click", function () {
                app.openPopup(
                    app.i18nText("popup.help_title", "Help"),
                    app.i18nText("popup.help_remote", "help remote"),
                    [],
                    app.i18nText("help.remote", "No help text").split("\n"),
                    { showSave: false }
                );
            });
        }
    }

    function currentHashPage() {
        const hash = window.location.hash.replace(/^#\/?/, "");
        const page = hash.split("/").filter(Boolean)[0] || "devices";
        return page === "help" ? "logs" : page;
    }
    function initWebSocket(app) {
        const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(wsScheme + "://" + window.location.host + "/ws");
        app.state.ws = ws;

        ws.onmessage = function (event) {
            const data = JSON.parse(event.data);
            if (data.type === "log") {
                app.logStatus(data.message);
            } else if (data.type === "position") {
                app.updateDeviceFill(data.id, data.position);
            } else if (data.type === "deviceaction") {
                app.applyDeviceAction(data);
            } else if (data.type === "init") {
                if (Array.isArray(data.devices)) {
                    app.state.devicesCache = data.devices;
                }
            } else if (data.type === "lastaddr") {
                app.elements = createElements();
                if (app.elements.lastAddrInput) {
                    app.elements.lastAddrInput.value = data.address || "";
                }
            } else if (data.type === "twowstatus" && app.applyTwoWStatus) {
                app.applyTwoWStatus(data.status || {});
            }
        };

        ws.onopen = function () {
            app.state.wsConnected = true;
        };

        ws.onclose = function () {
            app.state.wsConnected = false;
            if (!app.state.wsReconnectTimer) {
                app.state.wsReconnectTimer = setTimeout(function () {
                    app.state.wsReconnectTimer = null;
                    initWebSocket(app);
                }, 2000);
            }
        };
    }

    function bindEvents(app) {
        if (app.elements.sendCommandButton) {
            app.elements.sendCommandButton.addEventListener("click", app.sendCommand);
        }
        if (app.elements.mqttUpdateButton) {
            app.elements.mqttUpdateButton.addEventListener("click", app.updateMqttConfig);
        }
        if (app.elements.wifiScanButton) {
            app.elements.wifiScanButton.addEventListener("click", app.scanWifiNetworks);
        }
        if (app.elements.wifiConfigSaveButton) {
            app.elements.wifiConfigSaveButton.addEventListener("click", app.saveWifiConfig);
        }
        if (app.elements.networkSaveButton) {
            app.elements.networkSaveButton.addEventListener("click", app.saveNetworkConfig);
        }
        if (app.elements.displayUpdateButton) {
            app.elements.displayUpdateButton.addEventListener("click", app.updateDisplayConfig);
        }
        if (app.elements.syslogUpdateButton) {
            app.elements.syslogUpdateButton.addEventListener("click", app.updateSyslogConfig);
        }
        if (app.elements.syslogTestButton) {
            app.elements.syslogTestButton.addEventListener("click", app.sendSyslogTest);
        }
        if (app.elements.ioKeySaveButton) {
            app.elements.ioKeySaveButton.addEventListener("click", app.saveIoSystemKey);
        }
        if (app.elements.ioKeyClearButton) {
            app.elements.ioKeyClearButton.addEventListener("click", app.clearIoSystemKey);
        }
        if (app.elements.firmwareUploadButton) {
            app.elements.firmwareUploadButton.addEventListener("click", app.uploadFirmware);
        }
        if (app.elements.filesystemUploadButton) {
            app.elements.filesystemUploadButton.addEventListener("click", app.uploadFilesystem);
        }
        if (app.elements.backupUploadButton) {
            app.elements.backupUploadButton.addEventListener("click", app.uploadBackup);
        }
        if (app.elements.devicesUploadButton) {
            app.elements.devicesUploadButton.addEventListener("click", app.uploadDevices);
        }
        if (app.elements.remotesUploadButton) {
            app.elements.remotesUploadButton.addEventListener("click", app.uploadRemotes);
        }
        if (app.elements.downloadBackupButton) {
            app.elements.downloadBackupButton.addEventListener("click", function () {
                window.MiOpenApi.downloadFile("/api/download/backup", "miopen-backup.json").catch(function (error) {
                });
            });
        }
        if (app.elements.downloadDevicesButton) {
            app.elements.downloadDevicesButton.addEventListener("click", function () {
                window.MiOpenApi.downloadFile("/api/download/devices", "1W.json").catch(function (error) {
                });
            });
        }
        if (app.elements.downloadRemotesButton) {
            app.elements.downloadRemotesButton.addEventListener("click", function () {
                window.MiOpenApi.downloadFile("/api/download/remotes", "RemoteMap.json").catch(function (error) {
                });
            });
        }
        if (app.elements.addPopupButton) {
            app.elements.addPopupButton.addEventListener("click", app.openAddDevicePopup);
        }
        if (app.elements.remotePopupButton) {
            app.elements.remotePopupButton.addEventListener("click", app.openAddRemotePopup);
        }
    }


    function initDynamicPage(app, page) {
        app.elements = createElements();
        if (page === "twow" && !app.state.twowPageReady) {
            app.elements = createElements();
            if (window.MiOpenTwoW && typeof window.MiOpenTwoW.init === "function") {
                window.MiOpenTwoW.init(app);
            }
            app.state.twowPageReady = true;
        }
        if (page === "logs" && !app.state.logsPageReady) {
            app.state.logsPageReady = true;
            app.elements = createElements();
            initSuggestions(app);
            initHelpButtons(app);
            bindEvents(app);
            app.loadLogBuffer();
            app.fetchAndDisplayDevices();
            window.MiOpenApi.requestJson("/api/lastaddr").then(function (data) {
                app.elements = createElements();
                if (app.elements.lastAddrInput) {
                    app.elements.lastAddrInput.value = data.address || "";
                }
            }).catch(function () {});
        }
        if (page === "settings" && !app.state.settingsPageReady) {
            window.MiOpenSettings.init(app);
            app.state.settingsPageReady = true;
            bindEvents(app);
            [
                app.loadMqttConfig,
                app.loadWifiConfig,
                app.loadNetworkConfig,
                app.loadFallbackConfig,
                app.loadDisplayConfig,
                app.loadSyslogConfig
            ].forEach(function (loader, index) {
                if (typeof loader === "function") {
                    setTimeout(function () {
                        loader.call(app);
                    }, index * 150);
                }
            });
        }
        if (typeof window.applyI18n === "function") {
            window.applyI18n();
        }
    }
    document.addEventListener("DOMContentLoaded", function () {

        const app = {
            elements: createElements(),
            i18nText: i18nText,
            logStatus: function (message, isError) {
                logStatus(app, message, isError);
            },
            loadLogBuffer: function () {
                return loadLogBuffer(app);
            },
            initDynamicPage: function (page) {
                initDynamicPage(app, page);
            },
            state: {
                devicesCache: [],
                devicesLoadingPromise: null,
                ws: null,
                settingsPageReady: false,
                logsPageReady: false,
                twowPageReady: false
            }
        };

        window.MiOpenPopup.init(app);
        window.MiOpenDevices.init(app);
        window.MiOpenRemotes.init(app);
        window.MiOpenApp = app;

        initSuggestions(app);
        initTheme(app);
        initHelpButtons(app);
        setTimeout(function () {
            initWebSocket(app);
        }, 800);
        bindEvents(app);

        window.addEventListener("i18n:changed", function () {
            app.fetchAndDisplayDevices();
        });

        setTimeout(function () {
            window.MiOpenApi.requestJson("/api/info").then(function (info) {
            const el = document.getElementById("firmware-version");
            if (el && info.version) {
                const branch = info.branch ? " (" + info.branch + ")" : "";
                el.textContent = "Firmware: " + info.version + branch;
            }
            }).catch(function () {});
        }, 250);

        if (currentHashPage() === "devices") {
            app.fetchAndDisplayDevices().then(function () {
                if (typeof app.fetchAndDisplayRemotes === "function") {
                    app.fetchAndDisplayRemotes();
                }
            });
        }

    });
})();
