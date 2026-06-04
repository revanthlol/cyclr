// Only run the overlay in the top-level frame to prevent duplicate widgets in iframes
if (window === window.top) {
    const IS_FIREFOX = navigator.userAgent.includes("Firefox");
    let overlayRoot = null;
    let shadow = null;
    let isActive = false;
    let customShortcut = null;
    let devMode = false;
    let lastMouseX = null;
    let lastMouseY = null;
    let isScrolling = false;
    let scrollTimeout = null;
    let lastActiveDevice = "keyboard";
    // FIX 1: Module-level selected index so mousemove closures always read fresh value
    // instead of the stale captured parameter from renderTabRows()
    let currentSelectedIndex = 0;
    let currentLayoutMode = "list";
    let currentTabs = [];

    // Focus tracking: save what was focused before overlay opens, restore on close.
    // This is the fix for PDF/OOPIF pages — stealing focus to the backdrop ensures
    // keyup events (Alt release to commit) are delivered to this frame's window
    // listener instead of being swallowed by the out-of-process PDF viewer iframe.
    let previousFocus = null;

    // Helper to log only when devMode is active
    function log(...args) {
        if (devMode) console.log(...args);
    }

    // Load custom shortcut and dev mode settings on script initialization
    function loadSettings() {
        chrome.storage.local.get({ customShortcut: null, devMode: false }, (data) => {
            devMode = !!data.devMode;
            customShortcut = data.customShortcut || null;
            log("[CYCLR] Loaded settings:", { devMode, customShortcut });
        });
    }

    loadSettings();

    // Listen to changes in storage to update custom settings dynamically
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local") {
            if (changes.devMode) {
                devMode = !!changes.devMode.newValue;
            }
            if (changes.customShortcut) {
                customShortcut = changes.customShortcut.newValue || null;
                log("[CYCLR] Custom shortcut updated:", customShortcut);
            }
        }
    });

    // Helper to create favicon placeholder if missing/failed
    function createPlaceholder(title) {
        const placeholder = document.createElement("div");
        placeholder.className = "favicon-placeholder";
        const letter = title ? title.trim().charAt(0) : "?";
        placeholder.textContent = letter;
        return placeholder;
    }

    // Helper to get private page SVGs
    function getPrivatePageSvg(url) {
        if (!url) return null;
        const urlStr = url.toLowerCase();
        
        if (urlStr.includes("chrome://bookmarks") || urlStr.includes("about:bookmarks")) {
            return "chrome.bookmarks.svg";
        }
        if (urlStr.includes("chrome://downloads") || urlStr.includes("about:downloads")) {
            return "chrome.downloads.svg";
        }
        if (urlStr.includes("chrome://extensions") || urlStr.includes("about:addons")) {
            return "chrome.extensions.svg";
        }
        if (urlStr.includes("chrome://history") || urlStr.includes("about:history")) {
            return "chrome.history.svg";
        }
        if (urlStr.includes("chrome://newtab") || urlStr.includes("chrome://new-tab-page") || urlStr.includes("about:newtab") || urlStr.includes("about:home")) {
            return "chrome.newtab.svg";
        }
        if (urlStr.includes("chrome://settings") || urlStr.includes("about:preferences")) {
            return "chrome.settings.svg";
        }
        if (urlStr.startsWith("chrome://") || urlStr.startsWith("about:") || urlStr.startsWith("chrome-extension://")) {
            return "unknown.svg";
        }
        return null;
    }

    // FIX 2: Centralized scroll suppression — always set isScrolling BEFORE
    // calling scrollIntoView so mousemove can't slip in between
    function suppressScrollHover(duration = 180) {
        isScrolling = true;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isScrolling = false;
        }, duration);
    }

    function getGridColumns() {
        const grid = shadow?.querySelector(".grid-panel");
        const firstCard = grid?.querySelector(".grid-card");
        if (!grid || !firstCard) return 1;

        const gridRect = grid.getBoundingClientRect();
        const cardRect = firstCard.getBoundingClientRect();
        const gap = 12;
        return Math.max(1, Math.floor((gridRect.width + gap) / (cardRect.width + gap)));
    }

    // Initialize the overlay containers once
    function initOverlay() {
        if (overlayRoot) return;

        overlayRoot = document.createElement("div");
        overlayRoot.id = "cyclr-overlay-root";

        overlayRoot.style.position = "fixed";
        overlayRoot.style.top = "0";
        overlayRoot.style.left = "0";
        overlayRoot.style.width = "100vw";
        overlayRoot.style.height = "100vh";
        overlayRoot.style.zIndex = "2147483647";
        overlayRoot.style.display = "none";
        overlayRoot.style.pointerEvents = "auto";

        document.documentElement.appendChild(overlayRoot);

        shadow = overlayRoot.attachShadow({ mode: "open" });

        const styleEl = document.createElement("style");
        styleEl.textContent = `
            .overlay-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background-color: rgba(0, 0, 0, 0.08);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                opacity: 0;
                transition: opacity 220ms cubic-bezier(0.4, 0, 0.2, 1), backdrop-filter 220ms cubic-bezier(0.4, 0, 0.2, 1), -webkit-backdrop-filter 220ms cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
            }

            .overlay-backdrop.visible {
                opacity: 1;
                pointer-events: auto;
            }

            .overlay-backdrop.no-animations {
                transition: none !important;
            }

            .overlay-backdrop.blur-enabled {
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }

            .overlay-container {
                width: 480px;
                border-radius: 8px;
                padding: 6px;
                display: flex;
                flex-direction: column;
                gap: 2px;
                box-sizing: border-box;
            }

            /* Dark Theme Styles */
            .overlay-backdrop.dark-theme .overlay-container {
                background: #252526;
                border: 1px solid #3c3c3c;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45),
                            0 4px 16px rgba(0, 0, 0, 0.3),
                            0 0 0 1px rgba(255, 255, 255, 0.06);
            }
            .overlay-backdrop.dark-theme .tab-row {
                color: #cccccc;
            }
            .overlay-backdrop.dark-theme .tab-row:hover {
                background: #2a2a2b;
            }
            .overlay-backdrop.dark-theme .tab-row.active-tab {
                background: #333333;
                color: #ffffff;
            }
            .overlay-backdrop.dark-theme .favicon-placeholder {
                background: #444444;
                color: #aaaaaa;
            }

            /* Light Theme Styles */
            .overlay-backdrop.light-theme .overlay-container {
                background: #ffffff;
                border: 1px solid #dadce0;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15),
                            0 4px 16px rgba(0, 0, 0, 0.08),
                            0 0 0 1px rgba(0, 0, 0, 0.06);
            }
            .overlay-backdrop.light-theme .tab-row {
                color: #3c4043;
            }
            .overlay-backdrop.light-theme .tab-row:hover {
                background: #f1f3f4;
            }
            .overlay-backdrop.light-theme .tab-row.active-tab {
                background: #e8eaed;
                color: #202124;
            }
            .overlay-backdrop.light-theme .favicon-placeholder {
                background: #e8eaed;
                color: #5f6368;
            }

            .tab-row {
                height: 36px;
                display: flex;
                align-items: center;
                padding: 0 10px;
                border-radius: 4px;
                cursor: default;
                user-select: none;
                gap: 10px;
                box-sizing: border-box;
                transition: background-color 50ms ease;
                flex-shrink: 0;
            }

            .tab-row.selected {
                background: #5c7cfa !important;
                color: #ffffff !important;
            }

            .tab-row.selected .favicon-placeholder {
                background: rgba(255, 255, 255, 0.2) !important;
                color: #ffffff !important;
            }

            .favicon {
                width: 16px;
                height: 16px;
                object-fit: contain;
                background-color: transparent;
                flex-shrink: 0;
            }

            .favicon-placeholder {
                width: 16px;
                height: 16px;
                border-radius: 3px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                font-weight: 700;
                flex-shrink: 0;
                text-transform: uppercase;
            }

            .tab-title {
                flex-grow: 1;
                font-size: 13px;
                font-weight: 400;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .tab-row.selected .tab-title {
                color: #ffffff !important;
                font-weight: 500;
            }

            /* Split layout style for preview mode */
            .overlay-container.preview-layout {
                flex-direction: row !important;
                width: 975px !important;
                height: 314px !important;
                gap: 12px !important;
                align-items: stretch !important;
            }

            .preview-panel {
                width: 280px !important;
                height: 175px !important;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                flex-shrink: 0;
                overflow: hidden;
            }

            .overlay-container.preview-layout .preview-panel {
                width: 483px !important;
                height: 100% !important;
            }

            .overlay-container.preview-layout .list-panel {
                height: 100% !important;
                max-height: none !important;
            }

            .overlay-backdrop.dark-theme .preview-panel {
                background: #101011;
                border: 1px solid #3c3c3c;
            }

            .overlay-backdrop.light-theme .preview-panel {
                background: #f5f6f8;
                border: 1px solid #dadce0;
            }

            .preview-screenshot {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 5px;
                display: block;
            }

            .preview-private-svg {
                width: 64px;
                height: 64px;
                object-fit: contain;
                filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.3));
                opacity: 0.9;
            }

            .preview-favicon {
                width: 64px;
                height: 64px;
                object-fit: contain;
                filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.35));
            }

            .preview-favicon-placeholder {
                width: 64px;
                height: 64px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
                font-weight: 700;
                text-transform: uppercase;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
            }

            .overlay-backdrop.dark-theme .preview-favicon-placeholder {
                background: linear-gradient(135deg, #4c6ef5, #5c7cfa);
                color: #ffffff;
            }

            .overlay-backdrop.light-theme .preview-favicon-placeholder {
                background: linear-gradient(135deg, #74c0fc, #5c7cfa);
                color: #ffffff;
            }

            .list-panel {
                display: flex;
                flex-direction: column;
                gap: 2px;
                flex-grow: 1;
                max-height: 302px;
                overflow-y: auto;
                overscroll-behavior: contain;
                /* FIX 3: Hairline scrollbar — reserve exactly 4px, no layout shift */
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
                padding-right: 4px; /* breathing room so thumb doesn't clip row text */
            }

            .overlay-backdrop.light-theme .list-panel {
                scrollbar-color: rgba(0, 0, 0, 0.13) transparent;
            }

            /* Webkit hairline scrollbar */
            .list-panel::-webkit-scrollbar {
                width: 3px;
            }
            .list-panel::-webkit-scrollbar-track {
                background: transparent;
            }
            /* Dark theme thumb */
            .list-panel::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.12);
                border-radius: 10px;
            }
            .list-panel::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.28);
            }
            /* Light theme thumb — override via backdrop class */
            .overlay-backdrop.light-theme .list-panel::-webkit-scrollbar-thumb {
                background: rgba(0, 0, 0, 0.13);
            }
            .overlay-backdrop.light-theme .list-panel::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 0, 0, 0.26);
            }

            /* Grid Layout Styles */
            .overlay-container.grid-layout {
                width: max-content;
                max-width: min(1424px, calc(100vw - 48px)); /* Capped at 10 columns */
                padding: 16px 20px;
                box-sizing: border-box;
                border-radius: 20px !important;
                background: rgba(30, 30, 30, 0.65) !important;
                backdrop-filter: blur(20px) !important;
                -webkit-backdrop-filter: blur(20px) !important;
                border: 1px solid rgba(255, 255, 255, 0.08) !important;
            }

            .overlay-backdrop.light-theme .overlay-container.grid-layout {
                background: rgba(255, 255, 255, 0.65) !important;
                border: 1px solid rgba(0, 0, 0, 0.08) !important;
            }

            .grid-panel {
                display: grid;
                grid-auto-flow: column;
                grid-auto-columns: 130px;
                gap: 12px;
                max-height: 75vh;
                overflow-x: auto;
                overflow-y: hidden;
                padding: 4px;
                box-sizing: border-box;
                scroll-snap-type: x mandatory;
                scrollbar-width: none; /* Hide scrollbar for clear and simple look */
                border-radius: 16px;
            }
            .grid-panel::-webkit-scrollbar {
                display: none; /* Hide scrollbar in chrome/safari */
            }

            .grid-card {
                display: flex;
                flex-direction: column;
                cursor: default;
                user-select: none;
                transition: transform 120ms ease;
                position: relative;
                box-sizing: border-box;
                scroll-snap-align: center;
                width: 130px;
            }

            .grid-card:hover {
                transform: translateY(-2px);
            }

            .grid-card.selected {
                background: transparent !important;
                color: inherit !important;
                border: none !important;
                box-shadow: none !important;
            }

            .grid-thumb {
                width: 100%;
                aspect-ratio: 16 / 10;
                border-radius: 12px;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid transparent;
                transition: border-color 150ms ease, box-shadow 150ms ease;
                box-sizing: border-box;
            }

            .overlay-backdrop.dark-theme .grid-thumb {
                background: rgba(255, 255, 255, 0.05);
            }
            .overlay-backdrop.light-theme .grid-thumb {
                background: rgba(0, 0, 0, 0.05);
            }

            .grid-card.selected .grid-thumb {
                border-color: #5c7cfa;
                box-shadow: 0 0 0 2px rgba(92, 124, 250, 0.25), 0 8px 24px rgba(0, 0, 0, 0.35);
            }

            .grid-screenshot {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .grid-private-svg {
                width: 36px;
                height: 36px;
                object-fit: contain;
                opacity: 0.85;
            }

            .grid-favicon {
                width: 48px;
                height: 48px;
                object-fit: contain;
            }

            .grid-title-row {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 8px;
                padding: 0 4px;
                width: 100%;
                box-sizing: border-box;
            }

            .grid-card-icon {
                width: 14px;
                height: 14px;
                object-fit: contain;
                flex-shrink: 0;
            }

            .grid-title {
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                flex-grow: 1;
                color: #aaaaaa;
                transition: color 150ms ease;
            }

            .grid-card.selected .grid-title,
            .grid-card:hover .grid-title {
                color: #ffffff;
            }

            .overlay-backdrop.light-theme .grid-title {
                color: #5f6368;
            }
            .overlay-backdrop.light-theme .grid-card.selected .grid-title,
            .overlay-backdrop.light-theme .grid-card:hover .grid-title {
                color: #202124;
            }

            /* Placeholder styling inside grid thumb */
            .grid-thumb .favicon-placeholder {
                width: 48px;
                height: 48px;
                border-radius: 8px;
                font-size: 24px;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                text-transform: uppercase;
            }
            .overlay-backdrop.dark-theme .grid-thumb .favicon-placeholder {
                background: linear-gradient(135deg, #4c6ef5, #5c7cfa);
                color: #ffffff;
            }
            .overlay-backdrop.light-theme .grid-thumb .favicon-placeholder {
                background: linear-gradient(135deg, #74c0fc, #5c7cfa);
                color: #ffffff;
            }

            /* Close Button Styles */
            .close-tab-btn {
                display: none;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                border: none;
                background: #ff5f56;
                color: #ffffff !important;
                cursor: pointer;
                padding: 0;
                flex-shrink: 0;
                margin-left: auto;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                transition: background-color 150ms, transform 150ms;
            }

            .close-tab-btn:hover {
                background-color: #ff3b30;
                transform: scale(1.1);
            }

            .close-tab-btn svg {
                width: 8px;
                height: 8px;
            }

            .tab-row.selected .close-tab-btn {
                display: flex;
            }

            .tab-row:hover .close-tab-btn {
                display: flex;
            }

            /* Grid Close Button Styles */
            .grid-close-btn-wrapper {
                display: none;
                position: absolute;
                top: -4px;
                right: -4px;
                z-index: 10;
            }

            .grid-close-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                border: none;
                background: #ff5f56;
                color: #ffffff;
                cursor: pointer;
                padding: 0;
                box-shadow: 0 2px 4px rgba(0,0,0,0.25);
                transition: background-color 150ms, transform 150ms;
            }

            .grid-close-btn:hover {
                background-color: #ff3b30;
                transform: scale(1.1);
            }

            .grid-close-btn svg {
                width: 8px;
                height: 8px;
            }

            .grid-card.selected .grid-close-btn-wrapper {
                display: flex;
            }

            .grid-card:hover .grid-close-btn-wrapper {
                display: flex;
            }
        `;
        shadow.appendChild(styleEl);

        const backdrop = document.createElement("div");
        backdrop.className = "overlay-backdrop";

        const container = document.createElement("div");
        container.className = "overlay-container";

        backdrop.appendChild(container);
        shadow.appendChild(backdrop);
    }

    // Fast visual update of selected index without full DOM rebuild
    function updateSelection(tabs, selectedIndex) {
        // FIX 1: Keep module-level index in sync
        currentSelectedIndex = selectedIndex;
        currentTabs = tabs;

        const listPanel = shadow.querySelector(".list-panel");
        if (listPanel) {
            // 1. Update row highlights
            const rows = listPanel.querySelectorAll(".tab-row");
            rows.forEach((row, idx) => {
                if (idx === selectedIndex) {
                    row.classList.add("selected");
                } else {
                    row.classList.remove("selected");
                }
            });

            // 2. Update preview panel if present
            const previewPanel = shadow.querySelector(".preview-panel");
            const selectedTab = tabs[selectedIndex];
            if (previewPanel && selectedTab) {
                previewPanel.innerHTML = "";

                const privateSvg = getPrivatePageSvg(selectedTab.url);
                if (selectedTab.screenshot) {
                    const screenshotImg = document.createElement("img");
                    screenshotImg.className = "preview-screenshot";
                    screenshotImg.src = selectedTab.screenshot;
                    previewPanel.appendChild(screenshotImg);
                } else if (privateSvg) {
                    const svgImg = document.createElement("img");
                    svgImg.className = "preview-private-svg";
                    svgImg.src = chrome.runtime.getURL(`assets/images/${privateSvg}`);
                    previewPanel.appendChild(svgImg);
                } else {
                    const favUrl = (!IS_FIREFOX && selectedTab.url)
                        ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(selectedTab.url)}&size=64`
                        : (selectedTab.favIconUrl || "");
                    if (favUrl) {
                        const bigImg = document.createElement("img");
                        bigImg.className = "preview-favicon";
                        bigImg.src = favUrl;
                        bigImg.onerror = () => {
                            const bigPlaceholder = document.createElement("div");
                            bigPlaceholder.className = "preview-favicon-placeholder";
                            bigPlaceholder.textContent = selectedTab.title ? selectedTab.title.trim().charAt(0) : "?";
                            previewPanel.replaceChild(bigPlaceholder, bigImg);
                        };
                        previewPanel.appendChild(bigImg);
                    } else {
                        const bigPlaceholder = document.createElement("div");
                        bigPlaceholder.className = "preview-favicon-placeholder";
                        bigPlaceholder.textContent = selectedTab.title ? selectedTab.title.trim().charAt(0) : "?";
                        previewPanel.appendChild(bigPlaceholder);
                    }
                }
            }

            // 3. Only auto-scroll when keyboard is driving — mouse hover should never
            //    move the list, let the user scroll manually instead
            const selectedRow = listPanel.querySelector(".tab-row.selected");
            if (selectedRow && lastActiveDevice !== "mouse") {
                suppressScrollHover(180);
                selectedRow.scrollIntoView({ block: "nearest", behavior: "auto" });
            }
        }

        const gridPanel = shadow.querySelector(".grid-panel");
        if (gridPanel) {
            const cards = gridPanel.querySelectorAll(".grid-card");
            cards.forEach((card, idx) => {
                if (idx === selectedIndex) {
                    card.classList.add("selected");
                } else {
                    card.classList.remove("selected");
                }
            });

            const selectedCard = gridPanel.querySelector(".grid-card.selected");
            if (selectedCard && lastActiveDevice !== "mouse") {
                suppressScrollHover(180);
                selectedCard.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
            }
        }
    }

    // Dynamic rendering function to populate list
    function renderOverlay(tabs, selectedIndex, theme, layoutMode, zoomFactor, uiScale, enableAnimations, enableBlur) {
        initOverlay();

        const tabsChanged = tabs.length !== currentTabs.length ||
                            tabs.some((t, i) => !currentTabs[i] || t.id !== currentTabs[i].id);

        if (isActive && !tabsChanged && layoutMode === currentLayoutMode) {
            updateSelection(tabs, selectedIndex);

            const container = shadow.querySelector(".overlay-container");
            if (container) {
                const factor = zoomFactor || 1.0;
                const scaleValue = (uiScale || 1.0) / factor;
                container.style.transform = `scale(${scaleValue})`;
            }
            return;
        }

        const wasActive = isActive;
        isActive = true;
        currentSelectedIndex = selectedIndex;
        currentLayoutMode = layoutMode;
        currentTabs = tabs;

        const backdrop = shadow.querySelector(".overlay-backdrop");
        if (enableAnimations === false) {
            backdrop.classList.add("no-animations");
        } else {
            backdrop.classList.remove("no-animations");
        }

        if (enableBlur) {
            backdrop.classList.add("blur-enabled");
        } else {
            backdrop.classList.remove("blur-enabled");
        }

        if (theme === "light") {
            backdrop.classList.add("light-theme");
            backdrop.classList.remove("dark-theme");
        } else {
            backdrop.classList.add("dark-theme");
            backdrop.classList.remove("light-theme");
        }

        if (!backdrop.hasWheelListener) {
            backdrop.addEventListener("wheel", (e) => {
                const path = e.composedPath();
                const listPanel = path.find(el => el.classList && el.classList.contains("list-panel"));
                const gridPanel = path.find(el => el.classList && el.classList.contains("grid-panel"));
                if (!listPanel && !gridPanel) {
                    e.preventDefault();
                }
            }, { passive: false });
            backdrop.hasWheelListener = true;
        }

        const container = shadow.querySelector(".overlay-container");
        container.innerHTML = "";

        const selectedTab = tabs[selectedIndex];

        currentLayoutMode = layoutMode;

        if (layoutMode === "preview") {
            container.classList.remove("grid-layout");
            container.classList.add("preview-layout");

            const previewPanel = document.createElement("div");
            previewPanel.className = "preview-panel";

            if (selectedTab) {
                const privateSvg = getPrivatePageSvg(selectedTab.url);
                if (selectedTab.screenshot) {
                    const screenshotImg = document.createElement("img");
                    screenshotImg.className = "preview-screenshot";
                    screenshotImg.src = selectedTab.screenshot;
                    previewPanel.appendChild(screenshotImg);
                } else if (privateSvg) {
                    const svgImg = document.createElement("img");
                    svgImg.className = "preview-private-svg";
                    svgImg.src = chrome.runtime.getURL(`assets/images/${privateSvg}`);
                    previewPanel.appendChild(svgImg);
                } else {
                    const favUrl = (!IS_FIREFOX && selectedTab.url)
                        ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(selectedTab.url)}&size=64`
                        : (selectedTab.favIconUrl || "");
                    if (favUrl) {
                        const bigImg = document.createElement("img");
                        bigImg.className = "preview-favicon";
                        bigImg.src = favUrl;
                        bigImg.onerror = () => {
                            const bigPlaceholder = document.createElement("div");
                            bigPlaceholder.className = "preview-favicon-placeholder";
                            bigPlaceholder.textContent = selectedTab.title ? selectedTab.title.trim().charAt(0) : "?";
                            previewPanel.replaceChild(bigPlaceholder, bigImg);
                        };
                        previewPanel.appendChild(bigImg);
                    } else {
                        const bigPlaceholder = document.createElement("div");
                        bigPlaceholder.className = "preview-favicon-placeholder";
                        bigPlaceholder.textContent = selectedTab.title ? selectedTab.title.trim().charAt(0) : "?";
                        previewPanel.appendChild(bigPlaceholder);
                    }
                }
            }
            container.appendChild(previewPanel);

            const listPanel = document.createElement("div");
            listPanel.className = "list-panel";
            renderTabRows(listPanel, tabs, selectedIndex);
            container.appendChild(listPanel);
        } else if (layoutMode === "grid") {
            container.classList.remove("preview-layout");
            renderGridLayout(container, tabs, selectedIndex);
        } else {
            container.classList.remove("preview-layout");
            container.classList.remove("grid-layout");
            const listPanel = document.createElement("div");
            listPanel.className = "list-panel";
            renderTabRows(listPanel, tabs, selectedIndex);
            container.appendChild(listPanel);
        }

        const listPanelEl = container.querySelector(".list-panel");
        if (listPanelEl) {
            // FIX 2: User-initiated scroll (wheel/drag) also uses the suppressor
            listPanelEl.addEventListener("scroll", () => suppressScrollHover(150), { passive: true });
            listPanelEl.addEventListener("wheel", () => suppressScrollHover(150), { passive: true });
        }
        const gridPanelEl = container.querySelector(".grid-panel");
        if (gridPanelEl) {
            gridPanelEl.addEventListener("scroll", () => suppressScrollHover(150), { passive: true });
            gridPanelEl.addEventListener("wheel", () => suppressScrollHover(150), { passive: true });
        }

        const factor = zoomFactor || 1.0;
        const scaleValue = (uiScale || 1.0) / factor;
        container.style.transform = `scale(${scaleValue})`;
        container.style.transformOrigin = "center center";

        if (!wasActive) {
            overlayRoot.style.display = "block";
            // Force reflow and add visible class for fade-in transition
            backdrop.offsetHeight;
            backdrop.classList.add("visible");

            // Steal keyboard focus to the backdrop so keyup events (e.g. Alt release)
            // are guaranteed to reach this frame's window listener. Without this, on
            // PDF pages the Chrome PDF viewer OOPIF retains focus and swallows keyup.
            previousFocus = document.activeElement;
            backdrop.setAttribute("tabindex", "-1");
            backdrop.style.outline = "none";
            backdrop.focus({ preventScroll: true });
        }
    }

    // Grid rendering helper
    function renderGridLayout(container, tabs, selectedIndex) {
        container.classList.remove("preview-layout");
        container.classList.add("grid-layout");
        container.innerHTML = "";

        const grid = document.createElement("div");
        grid.className = "grid-panel";

        tabs.forEach((tab, index) => {
            const card = document.createElement("div");
            card.className = `grid-card${index === selectedIndex ? " selected" : ""}`;
            card.dataset.index = String(index);

            if (tab.active) {
                card.classList.add("active-tab");
            }

            const thumbWrap = document.createElement("div");
            thumbWrap.className = "grid-thumb";

            const privateSvg = getPrivatePageSvg(tab.url);

            if (tab.screenshot) {
                const img = document.createElement("img");
                img.className = "grid-screenshot";
                img.src = tab.screenshot;
                thumbWrap.appendChild(img);
            } else if (privateSvg) {
                const img = document.createElement("img");
                img.className = "grid-private-svg";
                img.src = chrome.runtime.getURL(`assets/images/${privateSvg}`);
                thumbWrap.appendChild(img);
            } else {
                const faviconUrl = (!IS_FIREFOX && tab.url)
                    ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=64`
                    : (tab.favIconUrl || "");

                if (faviconUrl) {
                    const img = document.createElement("img");
                    img.className = "grid-favicon";
                    img.src = faviconUrl;
                    img.onerror = () => {
                        thumbWrap.replaceChildren(createPlaceholder(tab.title));
                    };
                    thumbWrap.appendChild(img);
                } else {
                    thumbWrap.appendChild(createPlaceholder(tab.title));
                }
            }

            const faviconUrl = (!IS_FIREFOX && tab.url)
                ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32`
                : (tab.favIconUrl || "");

            const titleRow = document.createElement("div");
            titleRow.className = "grid-title-row";

            if (faviconUrl) {
                const iconImg = document.createElement("img");
                iconImg.className = "grid-card-icon";
                iconImg.src = faviconUrl;
                iconImg.onerror = () => {
                    iconImg.style.display = "none";
                };
                titleRow.appendChild(iconImg);
            }

            const titleSpan = document.createElement("span");
            titleSpan.className = "grid-title";
            titleSpan.textContent = tab.title || "Untitled Tab";
            titleRow.appendChild(titleSpan);

            card.appendChild(thumbWrap);
            card.appendChild(titleRow);

            // Close button for grid card
            const closeBtnWrapper = document.createElement("div");
            closeBtnWrapper.className = "grid-close-btn-wrapper";

            const gridCloseBtn = document.createElement("button");
            gridCloseBtn.className = "grid-close-btn";
            gridCloseBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            gridCloseBtn.title = "Close tab";
            gridCloseBtn.addEventListener("mousedown", (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
            gridCloseBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                chrome.runtime.sendMessage({ type: "cyclr-close-tab", tabId: tab.id });
            });

            closeBtnWrapper.appendChild(gridCloseBtn);
            card.appendChild(closeBtnWrapper);

            card.addEventListener("mousemove", (e) => {
                if (isScrolling) return;

                if (lastMouseX === null || lastMouseY === null) {
                    lastMouseX = e.clientX;
                    lastMouseY = e.clientY;
                    return;
                }

                const deltaX = Math.abs(e.clientX - lastMouseX);
                const deltaY = Math.abs(e.clientY - lastMouseY);

                if (deltaX === 0 && deltaY === 0) return;

                lastMouseX = e.clientX;
                lastMouseY = e.clientY;

                lastActiveDevice = "mouse";

                if (index !== currentSelectedIndex) {
                    chrome.runtime.sendMessage({
                        type: "cyclr-change-selected",
                        direction: index - currentSelectedIndex
                    });
                }
            });

            card.addEventListener("mousedown", (e) => {
                e.preventDefault();
                chrome.runtime.sendMessage({ type: "cyclr-commit" });
            });

            grid.appendChild(card);
        });

        container.appendChild(grid);

        // Suppress hover and scroll selected card into view centered
        setTimeout(() => {
            const selected = container.querySelector(".grid-card.selected");
            if (selected) {
                suppressScrollHover(180);
                selected.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
            }
        }, 0);
    }

    // Dynamic row rendering helper
    function renderTabRows(targetContainer, tabs, selectedIndex) {
        tabs.forEach((tab, index) => {
            const row = document.createElement("div");
            row.className = `tab-row${index === selectedIndex ? " selected" : ""}`;

            if (tab.active) {
                row.classList.add("active-tab");
            }

            const faviconUrl = (!IS_FIREFOX && tab.url)
                ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32`
                : (tab.favIconUrl || "");

            if (faviconUrl) {
                const img = document.createElement("img");
                img.className = "favicon";
                img.src = faviconUrl;
                img.onerror = () => {
                    row.replaceChild(createPlaceholder(tab.title), img);
                };
                row.appendChild(img);
            } else {
                row.appendChild(createPlaceholder(tab.title));
            }

            const titleSpan = document.createElement("span");
            titleSpan.className = "tab-title";
            titleSpan.textContent = tab.title || "Untitled Tab";
            row.appendChild(titleSpan);

            const closeBtn = document.createElement("button");
            closeBtn.className = "close-tab-btn";
            closeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            closeBtn.title = "Close tab";
            closeBtn.addEventListener("mousedown", (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
            closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                chrome.runtime.sendMessage({ type: "cyclr-close-tab", tabId: tab.id });
            });
            row.appendChild(closeBtn);

            row.addEventListener("mousemove", (e) => {
                if (isScrolling) return;

                // On overlay open we don't know where the cursor is yet.
                // First mousemove just anchors the position so subsequent events
                // have a real delta — prevents the overlay spawning under the cursor
                // from instantly ghost-selecting whatever row is at center.
                if (lastMouseX === null || lastMouseY === null) {
                    lastMouseX = e.clientX;
                    lastMouseY = e.clientY;
                    return;
                }

                const deltaX = Math.abs(e.clientX - lastMouseX);
                const deltaY = Math.abs(e.clientY - lastMouseY);

                // No actual movement — skip (handles duplicate/synthetic events)
                if (deltaX === 0 && deltaY === 0) return;

                lastMouseX = e.clientX;
                lastMouseY = e.clientY;

                // Ignore hover near the scrollbar gutter
                const rect = row.getBoundingClientRect();
                if (e.clientX >= rect.right - 14) return;

                // Mark device as mouse so updateSelection knows not to auto-scroll
                lastActiveDevice = "mouse";

                if (index !== currentSelectedIndex) {
                    chrome.runtime.sendMessage({
                        type: "cyclr-change-selected",
                        direction: index - currentSelectedIndex
                    });
                }
            });

            row.addEventListener("mousedown", (e) => {
                e.preventDefault();
                chrome.runtime.sendMessage({ type: "cyclr-commit" });
            });

            targetContainer.appendChild(row);
        });

        // FIX 2: Suppress hover before the initial scrollIntoView on render
        setTimeout(() => {
            const selectedRow = targetContainer.querySelector(".tab-row.selected");
            if (selectedRow) {
                suppressScrollHover(180);
                selectedRow.scrollIntoView({ block: "nearest", behavior: "auto" });
            }
        }, 0);
    }

    // Map e.code values → the unshifted character they produce.
    // Needed because symbol/punctuation keys don't follow the "Key"+letter pattern.
    const CODE_TO_KEY = {
        "backquote":    "`",  "minus":        "-",  "equal":   "=",
        "backslash":    "\\", "bracketleft":  "[",  "bracketright": "]",
        "semicolon":    ";",  "quote":        "'",  "comma":   ",",
        "period":       ".",  "slash":        "/",
    };

    // Helper to check if a keyboard event matches the configured custom shortcut.
    // Handles letter keys (e.code "KeyQ"), digit keys (e.code "Digit1"),
    // and symbol keys (e.code "Backquote" ↔ e.key "`") regardless of whether
    // the popup stored the shortcut as the character ("`") or the code name ("Backquote").
    // Also does a direct e.code match against customShortcut.code (stored by the
    // updated popup) which is locale/modifier-independent — critical for keys like
    // Ctrl+` where Linux can give e.key = "Dead" or "Unidentified" at trigger time.
    function matchesCustomShortcut(e) {
        if (!customShortcut || (!customShortcut.key && !customShortcut.code)) return false;

        const stored     = (customShortcut.key  || "").toLowerCase();
        const storedCode = (customShortcut.code || "").toLowerCase();
        const keyLower   = e.key.toLowerCase();
        const codeLower  = e.code.toLowerCase();

        const matchesKey =
            // Direct e.code match — most reliable, locale-independent
            (storedCode && codeLower === storedCode)        ||  // "backquote" === "backquote" ✓
            // e.key character match
            (stored && keyLower  === stored)                ||  // "`" === "`"
            // e.code vs stored key name
            (stored && codeLower === stored)                ||  // "backquote" === "backquote"
            (stored && codeLower === "key"   + stored)      ||  // "keyq" === "key"+"q"
            (stored && codeLower === "digit" + stored)      ||  // "digit1" === "digit"+"1"
            // symbol key cross-matching via CODE_TO_KEY table
            (stored && CODE_TO_KEY[codeLower] === stored)   ||  // code→char lookup
            (stored && Object.keys(CODE_TO_KEY).some(           // char→code lookup
                c => CODE_TO_KEY[c] === stored && codeLower === c
            ));

        const matchesModifiers =
            e.altKey   === !!customShortcut.altKey   &&
            e.ctrlKey  === !!customShortcut.ctrlKey  &&
            e.shiftKey === !!customShortcut.shiftKey &&
            e.metaKey  === !!customShortcut.metaKey;

        return matchesKey && matchesModifiers;
    }

    // Capture phase keyboard hooks
    window.addEventListener("keydown", (e) => {
        lastActiveDevice = "keyboard";

        if (!isActive) {
            if (matchesCustomShortcut(e)) {
                e.preventDefault();
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "cyclr-trigger-open" });
            }
            return;
        }

        // Close selected tab shortcut: modifier + W
        if (e.key.toLowerCase() === "w") {
            const modifierHeld = customShortcut
                ? (
                    (customShortcut.altKey && e.altKey) ||
                    (customShortcut.ctrlKey && e.ctrlKey) ||
                    (customShortcut.shiftKey && e.shiftKey) ||
                    (customShortcut.metaKey && e.metaKey)
                  )
                : e.altKey;

            if (modifierHeld) {
                e.preventDefault();
                e.stopPropagation();
                const targetTab = currentTabs[currentSelectedIndex];
                if (targetTab) {
                    chrome.runtime.sendMessage({ type: "cyclr-close-tab", tabId: targetTab.id });
                }
                return;
            }
        }

        if (currentLayoutMode === "grid") {
            if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: 1 });
                return;
            } else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: -1 });
                return;
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                const cols = getGridColumns();
                chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: cols });
                return;
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                const cols = getGridColumns();
                chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: -cols });
                return;
            }
        } else {
            if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: 1 });
                return;
            } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: -1 });
                return;
            }
        }

        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-close" });
        } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-commit" });
        } else if (e.key === "q" && e.altKey) {
            if (!customShortcut) {
                e.preventDefault();
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: 1 });
            }
        } else if (matchesCustomShortcut(e)) {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: 1 });
        }
    }, true);

    window.addEventListener("keyup", (e) => {
        if (!isActive) return;

        let shouldCommit = false;
        if (customShortcut) {
            if (customShortcut.altKey && (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight")) {
                shouldCommit = true;
            } else if (customShortcut.ctrlKey && (e.key === "Control" || e.code === "ControlLeft" || e.code === "ControlRight")) {
                shouldCommit = true;
            } else if (customShortcut.shiftKey && (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight")) {
                shouldCommit = true;
            } else if (customShortcut.metaKey && (e.key === "Meta" || e.code === "MetaLeft" || e.code === "MetaRight")) {
                shouldCommit = true;
            }
        } else {
            if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight" || (e.key !== "q" && !e.altKey)) {
                shouldCommit = true;
            }
        }

        if (shouldCommit) {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-commit" });
        }
    }, true);

    // Listen to coordination commands from Background script
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === "cyclr-ping") {
            sendResponse({ active: true });
            return true;
        } else if (msg.type === "cyclr-render") {
            renderOverlay(msg.tabs, msg.selectedIndex, msg.theme, msg.layoutMode, msg.zoomFactor, msg.uiScale, msg.enableAnimations, msg.enableBlur);
        } else if (msg.type === "cyclr-close") {
            isActive = false;
            isScrolling = false;
            lastActiveDevice = "keyboard";
            lastMouseX = null;
            lastMouseY = null;
            currentSelectedIndex = 0;
            currentTabs = [];
            const backdrop = shadow ? shadow.querySelector(".overlay-backdrop") : null;
            if (backdrop && !backdrop.classList.contains("no-animations")) {
                backdrop.classList.remove("visible");
                setTimeout(() => {
                    if (!isActive && overlayRoot) {
                        overlayRoot.style.display = "none";
                    }
                }, 230);
            } else {
                if (backdrop) {
                    backdrop.classList.remove("visible");
                }
                if (overlayRoot) {
                    overlayRoot.style.display = "none";
                }
            }
            // Restore focus to wherever it was before overlay opened
            if (previousFocus && typeof previousFocus.focus === "function") {
                previousFocus.focus({ preventScroll: true });
            }
            previousFocus = null;
        }
    });
}