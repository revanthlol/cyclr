// Only run the overlay in the top-level frame to prevent duplicate widgets in iframes
if (window === window.top) {
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

    // FIX 2: Centralized scroll suppression — always set isScrolling BEFORE
    // calling scrollIntoView so mousemove can't slip in between
    function suppressScrollHover(duration = 180) {
        isScrolling = true;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isScrolling = false;
        }, duration);
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
                width: 772px !important;
                gap: 12px !important;
                align-items: center !important;
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

        const listPanel = shadow.querySelector(".list-panel");
        if (!listPanel) return;

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

            if (selectedTab.screenshot) {
                const screenshotImg = document.createElement("img");
                screenshotImg.className = "preview-screenshot";
                screenshotImg.src = selectedTab.screenshot;
                previewPanel.appendChild(screenshotImg);
            } else {
                const favUrl = selectedTab.url
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

    // Dynamic rendering function to populate list
    function renderOverlay(tabs, selectedIndex, theme, layoutMode, zoomFactor, uiScale) {
        initOverlay();

        if (isActive) {
            updateSelection(tabs, selectedIndex);

            const container = shadow.querySelector(".overlay-container");
            if (container) {
                const factor = zoomFactor || 1.0;
                const scaleValue = (uiScale || 1.0) / factor;
                container.style.transform = `scale(${scaleValue})`;
            }
            return;
        }

        isActive = true;
        // FIX 1: Sync on fresh open
        currentSelectedIndex = selectedIndex;

        const backdrop = shadow.querySelector(".overlay-backdrop");
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
                if (!listPanel) {
                    e.preventDefault();
                }
            }, { passive: false });
            backdrop.hasWheelListener = true;
        }

        const container = shadow.querySelector(".overlay-container");
        container.innerHTML = "";

        const selectedTab = tabs[selectedIndex];

        if (layoutMode === "preview") {
            container.classList.add("preview-layout");

            const previewPanel = document.createElement("div");
            previewPanel.className = "preview-panel";

            if (selectedTab) {
                if (selectedTab.screenshot) {
                    const screenshotImg = document.createElement("img");
                    screenshotImg.className = "preview-screenshot";
                    screenshotImg.src = selectedTab.screenshot;
                    previewPanel.appendChild(screenshotImg);
                } else {
                    const favUrl = selectedTab.url
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
        } else {
            container.classList.remove("preview-layout");
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

        const factor = zoomFactor || 1.0;
        const scaleValue = (uiScale || 1.0) / factor;
        container.style.transform = `scale(${scaleValue})`;
        container.style.transformOrigin = "center center";

        overlayRoot.style.display = "block";

        // Steal keyboard focus to the backdrop so keyup events (e.g. Alt release)
        // are guaranteed to reach this frame's window listener. Without this, on
        // PDF pages the Chrome PDF viewer OOPIF retains focus and swallows keyup.
        previousFocus = document.activeElement;
        backdrop.setAttribute("tabindex", "-1");
        backdrop.style.outline = "none";
        backdrop.focus({ preventScroll: true });
    }

    // Dynamic row rendering helper
    function renderTabRows(targetContainer, tabs, selectedIndex) {
        tabs.forEach((tab, index) => {
            const row = document.createElement("div");
            row.className = `tab-row${index === selectedIndex ? " selected" : ""}`;

            if (tab.active) {
                row.classList.add("active-tab");
            }

            const faviconUrl = tab.url
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

        if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: 1 });
        } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: -1 });
        } else if (e.key === "Escape") {
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
            renderOverlay(msg.tabs, msg.selectedIndex, msg.theme, msg.layoutMode, msg.zoomFactor, msg.uiScale);
        } else if (msg.type === "cyclr-close") {
            isActive = false;
            isScrolling = false;
            lastActiveDevice = "keyboard";
            lastMouseX = null;
            lastMouseY = null;
            currentSelectedIndex = 0;
            if (overlayRoot) {
                overlayRoot.style.display = "none";
            }
            // Restore focus to wherever it was before overlay opened
            if (previousFocus && typeof previousFocus.focus === "function") {
                previousFocus.focus({ preventScroll: true });
            }
            previousFocus = null;
        }
    });
}