(function () {
    function ensureJson(response) {
        return response.json().catch(function () {
            return {};
        });
    }

    function withTimeout(options, timeoutMs) {
        const requestOptions = Object.assign({}, options || {});
        const timeout = timeoutMs || 12000;
        if (typeof AbortController === "undefined") {
            return { options: requestOptions, cancel: function () {} };
        }

        const controller = new AbortController();
        const previousSignal = requestOptions.signal;
        const timer = setTimeout(function () {
            controller.abort();
        }, timeout);

        if (previousSignal) {
            previousSignal.addEventListener("abort", function () {
                controller.abort();
            });
        }

        requestOptions.signal = controller.signal;
        return {
            options: requestOptions,
            cancel: function () {
                clearTimeout(timer);
            }
        };
    }

    async function requestJson(url, options) {
        const timeoutRequest = withTimeout(options);
        const requestOptions = timeoutRequest.options;
        const method = (requestOptions.method || "GET").toUpperCase();
        const requestUrl = method === "GET"
            ? url + (url.indexOf("?") === -1 ? "?" : "&") + "_=" + Date.now()
            : url;

        if (method === "GET") {
            requestOptions.cache = "no-store";
        }

        let response;
        try {
            response = await fetch(requestUrl, requestOptions);
        } catch (error) {
            if (error && error.name === "AbortError") {
                throw new Error("ESP antwoordt niet binnen 12 seconden. Controleer WiFi of herstart het toestel.");
            }
            throw new Error("ESP niet bereikbaar. Controleer of het toestel online is of net herstart.");
        } finally {
            timeoutRequest.cancel();
        }
        const data = await ensureJson(response);
        if (!response.ok) {
            throw new Error(data.message || ("HTTP error " + response.status));
        }
        return data;
    }

    async function postJson(url, payload) {
        return requestJson(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    }

    async function uploadFile(url, file) {
        const formData = new FormData();
        formData.append("file", file);
        return requestJson(url, {
            method: "POST",
            body: formData
        });
    }

    async function downloadFile(url, filename) {
        const timeoutRequest = withTimeout({}, 12000);
        let response;
        try {
            response = await fetch(url, timeoutRequest.options);
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
        } catch (error) {
            if (error && error.name === "AbortError") {
                throw new Error("ESP antwoordt niet binnen 12 seconden. Controleer WiFi of herstart het toestel.");
            }
            throw error;
        } finally {
            timeoutRequest.cancel();
        }

        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(link.href);
    }

    window.MiOpenApi = {
        downloadFile: downloadFile,
        postJson: postJson,
        requestJson: requestJson,
        uploadFile: uploadFile
    };
})();
