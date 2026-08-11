(function () {
    const pages = ["devices", "logs", "settings"];

    function pageElement(name) {
        return document.getElementById(name + "-page");
    }

    async function loadPageContent(name) {
        const element = pageElement(name);
        if (!element || element.dataset.loaded === "true" || !element.dataset.pageSrc) {
            return;
        }
        const response = await fetch(element.dataset.pageSrc + "?v=20260731a", { cache: "no-store" });
        if (!response.ok) {
            throw new Error("Page load failed: " + name);
        }
        element.innerHTML = await response.text();
        element.dataset.loaded = "true";
        if (window.MiOpenApp && typeof window.MiOpenApp.initDynamicPage === "function") {
            window.MiOpenApp.initDynamicPage(name);
        }
    }

    function setPageDisplay(name, activePage) {
        const element = pageElement(name);
        if (!element) {
            return;
        }
        element.style.display = activePage === name ? "grid" : "none";
    }

    function closeMobileMenu() {
        const nav = document.querySelector("header nav");
        if (nav) {
            nav.classList.remove("open");
        }
        document.body.classList.remove("menu-open");
    }

    function parseHash() {
        const hash = window.location.hash.replace(/^#\/?/, "");
        const parts = hash.split("/").filter(Boolean);
        return {
            page: parts[0] === "help" ? "logs" : (pages.indexOf(parts[0]) !== -1 ? parts[0] : "devices"),
            settingsTab: parts[0] === "settings" ? parts[1] : ""
        };
    }

    async function applyRoute(route, updateHash) {
        try {
            await loadPageContent(route.page);
        } catch (error) {
            console.error(error);
        }

        pages.forEach(function (page) {
            setPageDisplay(page, route.page);
        });

        if (route.page === "settings" && route.settingsTab && typeof window.activateSettingsTab === "function") {
            window.activateSettingsTab(route.settingsTab);
        }

        if (updateHash) {
            const nextHash = route.page === "settings" && route.settingsTab
                ? "#/settings/" + route.settingsTab
                : "#/" + route.page;
            if (window.location.hash !== nextHash) {
                history.pushState(null, "", nextHash);
            }
        }

        closeMobileMenu();
    }

    window.showPage = function (page) {
        applyRoute({ page: pages.indexOf(page) !== -1 ? page : "devices", settingsTab: "" }, true);
    };

    document.addEventListener("DOMContentLoaded", function () {
        const nav = document.querySelector("header nav");
        const toggle = document.getElementById("menu-toggle");
        const close = document.getElementById("menu-close");
        const backdrop = document.getElementById("menu-backdrop");

        function openMenu() {
            if (nav) {
                nav.classList.add("open");
            }
            document.body.classList.add("menu-open");
        }

        if (toggle) {
            toggle.addEventListener("click", openMenu);
        }
        if (close) {
            close.addEventListener("click", closeMobileMenu);
        }
        if (backdrop) {
            backdrop.addEventListener("click", closeMobileMenu);
        }

        applyRoute(parseHash(), false);
        window.addEventListener("hashchange", function () {
            applyRoute(parseHash(), false);
        });
    });
}());