(function () {
    async function runAction(app, deviceId, action) {
        const result = await window.MiOpenApi.postJson("/api/action", {
            deviceId: deviceId,
            action: action
        });
    }

    function updateDeviceFill(deviceId, percent, durationSeconds) {
        const deviceEl = document.querySelector('.device[data-protocol="1W"][data-id="' + deviceId + '"]');
        if (!deviceEl) {
            return;
        }

        if (typeof durationSeconds === "number" && durationSeconds > 0) {
            deviceEl.style.transitionDuration = durationSeconds.toFixed(2) + "s";
        }

        const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
        deviceEl.style.background = "linear-gradient(to top, var(--color-input) " +
            clamped + "%, var(--color-accent3) " + clamped + "%)";
        deviceEl.dataset.position = String(clamped);

        if (!deviceEl.dataset.state || deviceEl.dataset.state === "OPEN" || deviceEl.dataset.state === "CLOSED") {
            setDeviceState(deviceId, stateFromPosition(clamped), deviceEl.dataset.source || "");
        }
    }

    function stateFromPosition(position) {
        const percent = Math.max(0, Math.min(100, Number(position) || 0));
        if (percent <= 0) {
            return "CLOSED";
        }
        if (percent >= 100) {
            return "OPEN";
        }
        return "STOP";
    }

    function stateLabel(state) {
        const normalized = String(state || "STOP").toUpperCase();
        if (normalized === "OPENING") {
            return "OPENING";
        }
        if (normalized === "CLOSING") {
            return "SLUITEN";
        }
        if (normalized === "CLOSE" || normalized === "CLOSED") {
            return "GESLOTEN";
        }
        if (normalized === "OPEN") {
            return "OPEN";
        }
        return "STOP";
    }

    function setDeviceState(deviceId, state, source) {
        const deviceEl = document.querySelector('.device[data-protocol="1W"][data-id="' + deviceId + '"]');
        if (!deviceEl) {
            return;
        }

        const stateEl = deviceEl.querySelector(".device-state");
        if (!stateEl) {
            return;
        }

        const normalizedState = state || "STOP";
        const normalizedSource = source || "gateway";
        stateEl.textContent = stateLabel(normalizedState);
        stateEl.title = normalizedSource;
        deviceEl.dataset.state = normalizedState;
        deviceEl.dataset.source = normalizedSource;
    }

    function applyDeviceAction(app, data) {
        if (!data || !data.id) {
            return;
        }

        const cached = app.state.devicesCache.find(function (device) {
            return device.id === data.id;
        });
        const action = String(data.action || "").toLowerCase();
        let state = data.state || data.action || "STOP";
        if (!data.state && action === "open") {
            state = "OPENING";
        } else if (!data.state && action === "close") {
            state = "CLOSING";
        }
        const source = data.source || "gateway";
        const current = typeof data.position !== "undefined" ? data.position : (cached ? cached.position : data.target);

        updateDeviceFill(data.id, current, action === "stop" ? 0.2 : undefined);
        setDeviceState(data.id, state, source);

        if (cached && typeof current !== "undefined") {
            cached.position = Math.max(0, Math.min(100, Number(current) || 0));
            cached.state = state;
            cached.source = source;
        }
    }

    function createDeviceButton(label, className, onClick) {
        const button = document.createElement("button");
        button.textContent = label;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.classList.add("btn", ...className.split(" "));
        button.addEventListener("click", onClick);
        return button;
    }

    async function fetchAndDisplayDevices(app) {
        if (app.state.devicesLoadingPromise) {
            return app.state.devicesLoadingPromise;
        }

        app.state.devicesLoadingPromise = (async function () {
            const deviceList = app.elements.deviceList;
            const deviceSelect = app.elements.commandDeviceSelect;

            try {
                const devices = await window.MiOpenApi.requestJson("/api/devices");
                app.state.devicesCache = devices.filter(function (device) { return device.protocol !== "2W"; });

                if (deviceList) {
                    deviceList.textContent = "";
                }
                if (deviceSelect) {
                    deviceSelect.textContent = "";
                }

                if (!Array.isArray(devices) || devices.length === 0) {
                    if (deviceList) {
                        const listItem = document.createElement("li");
                        listItem.textContent = "No devices available.";
                        deviceList.appendChild(listItem);
                    }
                    return devices;
                }

                const listFragment = document.createDocumentFragment();
                const selectFragment = document.createDocumentFragment();

                devices.forEach(function (device) {
                    if (deviceList) {
                        const nameSpan = document.createElement("span");
                        nameSpan.textContent = device.name;
                        nameSpan.className = "device-name";

                        const listItem = document.createElement("li");
                        listItem.classList.add("device");
                        listItem.dataset.id = device.id;
                        listItem.dataset.protocol = device.protocol === "2W" ? "2W" : "1W";
                        const protocol = document.createElement("span");
                        protocol.className = "device-protocol";
                        protocol.textContent = listItem.dataset.protocol;
                        listItem.appendChild(protocol);
                        listItem.appendChild(nameSpan);

                        const stateSpan = document.createElement("span");
                        stateSpan.className = "device-state";
                        listItem.appendChild(stateSpan);
                        if (device.protocol === "2W") {
                            stateSpan.textContent = app.i18nText("device.saved", "Saved");
                            listItem.appendChild(createDeviceButton(app.i18nText("device.details", "Device details"), "help device-details", function () {
                                app.openPopup("2W " + device.name, "", ["ID: " + device.id], [], {});
                            }));
                            listFragment.appendChild(listItem);
                            return;
                        }
                        listItem.dataset.state = device.state || stateFromPosition(device.position);
                        listItem.dataset.source = device.source || "";

                        listItem.appendChild(createDeviceButton("up", "open", function () {
                            runAction(app, device.id, "open").catch(function () {});
                        }));

                        listItem.appendChild(createDeviceButton("stop", "stop", function () {
                            runAction(app, device.id, "stop").catch(function () {});
                        }));

                        listItem.appendChild(createDeviceButton("down", "down", function () {
                            runAction(app, device.id, "close").catch(function () {});
                        }));

                        listItem.appendChild(createDeviceButton(app.i18nText("button.edit", "edit"), "edit", async function () {
                            try {
                                const freshDevices = await window.MiOpenApi.requestJson("/api/devices");
                                app.state.devicesCache = freshDevices.filter(function (candidate) { return candidate.protocol !== "2W"; });
                                const freshDevice = freshDevices.find(function (candidate) {
                                    return candidate.protocol !== "2W" && candidate.id === device.id;
                                });
                                if (freshDevice) {
                                    device = freshDevice;
                                }
                            } catch (error) {
                            }

                            app.openPopup(
                                app.i18nText("popup.edit_device_title", "Edit Device"),
                                app.i18nText("popup.adjust_name", "Adjust the name:"),
                                [
                                    app.i18nText("popup.info_id", "ID: {value}").replace("{value}", device.id),
                                    app.i18nText("popup.info_description", "Description: {value}").replace("{value}", device.description || ""),
                                    app.i18nText("popup.info_position", "Position: {value}%").replace("{value}", String(device.position)),
                                    app.i18nText("popup.info_paired", "Paired: {value}").replace(
                                        "{value}",
                                        device.paired ? app.i18nText("value.yes", "Yes") : app.i18nText("value.no", "No")
                                    )
                                ],
                                [""],
                                {
                                    showSave: true,
                                    showInput: true,
                                    showTiming: true,
                                    btnShowDelete: true,
                                    defaultValue: device.name,
                                    defaultTiming: device.travel_time,
                                    showBoolean: true,
                                    booleanLabel: app.i18nText("popup.active", "Active"),
                                    defaultBoolean: typeof device.active === "boolean" ? device.active : !!device.paired,
                                    blockDestructiveWhenBoolean: true,
                                    showRepeatOnNoResponse: true,
                                    repeatOnNoResponseLabel: app.i18nText(
                                        "popup.repeat_on_no_response",
                                        "Repeat command if shutter does not respond"
                                    ),
                                    defaultRepeatOnNoResponse: !!device.repeatOnNoResponse,
                                    protectedMessage: app.i18nText(
                                        "popup.active_blocks_destructive",
                                        "Disable Active before unpairing or deleting."
                                    ),
                                    pairLabel: app.i18nText("popup.pair_label_device", "Add / Remove the device to the physical screen"),
                                    deleteInfo: app.i18nText("popup.delete_device_info", "Only use when the device is not linked to a physical screen."),
                                    onSave: async function (newName, newTiming, _deviceValue, repeatOnNoResponse) {
                                        try {
                                            if (newName.trim() && newName !== device.name) {
                                                await window.MiOpenApi.postJson("/api/command", {
                                                    deviceId: device.id,
                                                    command: "edit1W " + newName
                                                });
                                            }

                                            const parsedTiming = parseInt(newTiming, 10);
                                            if (!isNaN(parsedTiming) && parsedTiming > 0 && parsedTiming !== device.travel_time) {
                                                await window.MiOpenApi.postJson("/api/command", {
                                                    deviceId: device.id,
                                                    command: "time1W " + parsedTiming
                                                });
                                            }

                                            if (typeof repeatOnNoResponse === "boolean" &&
                                                    repeatOnNoResponse !== !!device.repeatOnNoResponse) {
                                                await window.MiOpenApi.postJson("/api/command", {
                                                    deviceId: device.id,
                                                    command: "repeat1W " + (repeatOnNoResponse ? "1" : "0")
                                                });
                                            }

                                            await fetchAndDisplayDevices(app);
                                        } catch (error) {
                                        }
                                    },
                                    onPair: async function () {
                                        try {
                                            await window.MiOpenApi.postJson("/api/command", {
                                                deviceId: device.id,
                                                command: "add"
                                            });
                                            await fetchAndDisplayDevices(app);
                                        } catch (error) {
                                        }
                                    },
                                    onUnpair: async function () {
                                        try {
                                            await window.MiOpenApi.postJson("/api/command", {
                                                deviceId: device.id,
                                                command: "remove"
                                            });
                                            await fetchAndDisplayDevices(app);
                                        } catch (error) {
                                        }
                                    },
                                    onDelete: async function () {
                                        await window.MiOpenApi.postJson("/api/command", {
                                            deviceId: device.id,
                                            command: "del1W"
                                        });
                                        await fetchAndDisplayDevices(app);
                                    }
                                }
                            );
                        }));

                        listFragment.appendChild(listItem);
                    }

                    if (deviceSelect) {
                        const option = document.createElement("option");
                        option.value = device.id;
                        option.textContent = device.name;
                        selectFragment.appendChild(option);
                    }
                });

                if (deviceList) {
                    deviceList.appendChild(listFragment);
                    devices.forEach(function (device) {
                        if (device.protocol === "2W") return;
                        updateDeviceFill(device.id, device.position || 0);
                        setDeviceState(device.id, device.state || stateFromPosition(device.position), device.source || "");
                    });
                }
                if (deviceSelect) {
                    deviceSelect.appendChild(selectFragment);
                }

                return devices;
            } catch (error) {
                console.error("Error fetching devices:", error);
                return [];
            } finally {
                app.state.devicesLoadingPromise = null;
            }
        })();

        return app.state.devicesLoadingPromise;
    }
    async function sendCommand(app) {
        const selectedDeviceId = app.elements.commandDeviceSelect.value;
        const commandStr = app.elements.commandInput.value.trim();

        if (!selectedDeviceId) {
            return;
        }
        if (!commandStr) {
            return;
        }


        try {
            const result = await window.MiOpenApi.postJson("/api/command", {
                deviceId: selectedDeviceId,
                command: commandStr
            });

            if (result.success) {
            } else {
            }
        } catch (error) {
            console.error("Error sending command:", error);
        }
    }

    function openAddDevicePopup(app) {
        app.openPopup(
            app.i18nText("popup.add_device_title", "Add Device"),
            app.i18nText("popup.new_device", "new device"),
            [app.i18nText("popup.here_add_device", "here add your device")],
            [""],
            {
                showSave: true,
                showInput: true,
                btnShowDelete: false,
                btnShowCancel: false,
                onSave: async function (newName) {
                    if (!newName.trim()) {
                        return;
                    }

                    try {
                        const result = await window.MiOpenApi.postJson("/api/command", {
                            command: "new1W " + newName
                        });
                        await fetchAndDisplayDevices(app);
                    } catch (error) {
                    }
                }
            }
        );
    }

    function init(app) {
        app.fetchAndDisplayDevices = function () {
            return fetchAndDisplayDevices(app);
        };
        app.sendCommand = function () {
            return sendCommand(app);
        };
        app.updateDeviceFill = updateDeviceFill;
        app.applyDeviceAction = function (data) {
            applyDeviceAction(app, data);
        };
        app.openAddDevicePopup = function () {
            openAddDevicePopup(app);
        };
        app.openAddOneWDevicePopup = app.openAddDevicePopup;
    }

    window.MiOpenDevices = {
        init: init
    };
})();
