(function () {
    function init(app) {
        const popup = document.getElementById("popup");
        const choices = document.getElementById("device-protocol-choice");
        const progress = document.getElementById("device-pair-progress");
        const statusText = document.getElementById("device-pair-status");
        const timeText = document.getElementById("device-pair-time");
        const errorText = document.getElementById("device-pair-error");
        const retry = document.getElementById("device-pair-retry");
        let pollTimer;
        let starting = false;
        let finished = false;
        let baseline = "";
        let lastError = "";
        let generation = 0;
        const text = function (key, fallback) { return app.i18nText(key, fallback); };
        const isOpen = function () { return popup.classList.contains("open") && popup.classList.contains("device-pairing") && !progress.hidden; };

        function failure(message) {
            statusText.textContent = text("device.pair_failed", "Pairing not confirmed");
            errorText.textContent = message;
            errorText.hidden = !message;
            timeText.textContent = "";
            retry.hidden = false;
        }

        function render(status) {
            if (!isOpen() || finished) return;
            if (status.pairingActive) {
                baseline = "";
                retry.hidden = true;
                errorText.hidden = true;
                statusText.textContent = text("device.pair_searching", "Searching for a 2W device...");
                const seconds = Math.ceil(Number(status.pairingRemainingMs || 0) / 1000);
                timeText.textContent = seconds > 0
                    ? text("device.pair_remaining", "{seconds} seconds remaining").replace("{seconds}", seconds)
                    : text("device.pair_waiting", "Waiting for confirmation...");
                return;
            }
            if (status.lastTxCommand !== "pair2W" || !status.lastTxResult || status.lastTxResult === baseline) return;
            if (status.lastTxError) {
                finished = true;
                failure(status.lastTxResult);
            } else if (status.lastTxResult.indexOf("2W pairing completed and saved:") === 0) {
                finished = true;
                statusText.textContent = text("device.pair_saved", "Paired and saved");
                timeText.textContent = status.lastTxResult.slice("2W pairing completed and saved:".length).trim();
                errorText.hidden = true;
                retry.hidden = true;
            } else {
                statusText.textContent = text("device.pair_waiting", "Waiting for confirmation...");
                timeText.textContent = "";
            }
        }

        async function poll(currentGeneration) {
            if (!isOpen() || finished || currentGeneration !== generation) return;
            try {
                const status = await window.MiOpenApi.requestJson("/api/2w/status");
                if (currentGeneration !== generation || !isOpen()) return;
                errorText.hidden = true;
                app.applyTwoWStatus(status);
            } catch (error) {
                if (currentGeneration !== generation || !isOpen() || finished) return;
                // A lost connection is not evidence that the device failed to pair.
                statusText.textContent = text("device.pair_connection", "Connection interrupted; checking status...");
                timeText.textContent = "";
                errorText.textContent = error.message;
                errorText.hidden = false;
            }
            if (isOpen() && !finished && currentGeneration === generation) {
                pollTimer = setTimeout(function () { poll(currentGeneration); }, 1500);
            }
        }

        async function start() {
            if (starting) return;
            starting = true;
            finished = false;
            const currentGeneration = ++generation;
            clearTimeout(pollTimer);
            choices.hidden = true;
            progress.hidden = false;
            retry.hidden = true;
            errorText.hidden = true;
            timeText.textContent = "";
            statusText.textContent = text("device.pair_checking", "Checking pairing status...");
            try {
                const status = await window.MiOpenApi.requestJson("/api/2w/status");
                if (!isOpen() || currentGeneration !== generation) return;
                baseline = status.lastTxResult || "";
                if (status.pairingActive) {
                    app.applyTwoWStatus(status);
                } else {
                    statusText.textContent = text("device.pair_searching", "Searching for a 2W device...");
                    lastError = "";
                    const sent = await app.sendTwoWCommand("pair2W");
                    if (!isOpen() || currentGeneration !== generation) return;
                    if (!sent) {
                        failure(lastError);
                        return;
                    }
                }
                poll(currentGeneration);
            } catch (error) {
                if (isOpen() && currentGeneration === generation) failure(error.message);
            } finally {
                starting = false;
            }
        }

        app.onTwoWStatus = render;
        app.onTwoWMessage = function (message, isError) {
            if (isError) lastError = message;
        };
        app.openAddDevicePopup = function () {
            if (popup.classList.contains("open")) return;
            choices.hidden = false;
            progress.hidden = true;
            app.openPopup(text("popup.add_device_title", "Add Device"), "", [], [], {
                showDevicePairing: true,
                onClose: function () {
                    ++generation;
                    clearTimeout(pollTimer);
                }
            });
            document.getElementById("device-add-1w").focus();
        };
        document.getElementById("device-add-1w").addEventListener("click", function () {
            app.openAddOneWDevicePopup();
        });
        document.getElementById("device-add-2w").addEventListener("click", start);
        retry.addEventListener("click", start);
    }

    window.MiOpenDevicePairing = { init: init };
})();
