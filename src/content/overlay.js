// Only run the overlay in the top-level frame to prevent duplicate widgets in iframes
if (window === window.top) {
    let overlayRoot = null;
    let shadow = null;
    let isActive = false;
    let customShortcut = null;
    let devMode = false;

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

    // Initialize the overlay containers once
    function initOverlay() {
        if (overlayRoot) return;

        overlayRoot = document.createElement("div");
        overlayRoot.id = "cyclr-overlay-root";
        
        // Root viewport styling
        overlayRoot.style.position = "fixed";
        overlayRoot.style.top = "0";
        overlayRoot.style.left = "0";
        overlayRoot.style.width = "100vw";
        overlayRoot.style.height = "100vh";
        overlayRoot.style.zIndex = "2147483647"; // Max index
        overlayRoot.style.display = "none";
        overlayRoot.style.pointerEvents = "auto";
        
        document.documentElement.appendChild(overlayRoot);

        shadow = overlayRoot.attachShadow({ mode: "open" });

        // Dual-theme solid flat Chrome UI styling (Dark/Light)
        const styleEl = document.createElement("style");
        styleEl.textContent = `
            .overlay-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background-color: rgba(0, 0, 0, 0.08); /* Nearly clear backdrop to let the page stay perfectly bright */
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
                /* Rich, layered deep dark shadow for premium elevation */
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
                /* Rich, layered light shadow for premium elevation */
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
            }

            /* Selected Row has unified colors for visual consistency */
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
                width: 772px !important; /* Widescreen width: 280px preview + 480px list + 12px gap */
                gap: 12px !important;
                align-items: center !important; /* Center panels vertically for premium stable card styling */
            }

            .preview-panel {
                width: 280px !important;
                height: 175px !important; /* Locked rectangular 16:10 aspect ratio preview */
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                flex-shrink: 0;
                overflow: hidden; /* Clips screenshots to match rounded card corners */
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

    // Dynamic rendering function to populate list
    function renderOverlay(tabs, selectedIndex, theme, layoutMode, zoomFactor, uiScale) {
        initOverlay();
        
        const backdrop = shadow.querySelector(".overlay-backdrop");
        if (theme === "light") {
            backdrop.classList.add("light-theme");
            backdrop.classList.remove("dark-theme");
        } else {
            backdrop.classList.add("dark-theme");
            backdrop.classList.remove("light-theme");
        }

        const container = shadow.querySelector(".overlay-container");
        container.innerHTML = ""; // Clear existing

        const selectedTab = tabs[selectedIndex];

        if (layoutMode === "preview") {
            container.classList.add("preview-layout");

            // Left Preview Panel
            const previewPanel = document.createElement("div");
            previewPanel.className = "preview-panel";

            if (selectedTab) {
                if (selectedTab.screenshot) {
                    const screenshotImg = document.createElement("img");
                    screenshotImg.className = "preview-screenshot";
                    screenshotImg.src = selectedTab.screenshot;
                    previewPanel.appendChild(screenshotImg);
                } else {
                    // Fall back to showing the large centered favicon/placeholder
                    const favUrl = selectedTab.url ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(selectedTab.url)}&size=64` : (selectedTab.favIconUrl || "");
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

            // Right List Panel
            const listPanel = document.createElement("div");
            listPanel.className = "list-panel";
            renderTabRows(listPanel, tabs, selectedIndex);
            container.appendChild(listPanel);
        } else {
            container.classList.remove("preview-layout");
            renderTabRows(container, tabs, selectedIndex);
        }

        // Apply scale transformation to perfectly counteract page zoom and apply user UI scaling
        const factor = zoomFactor || 1.0;
        const scaleValue = (uiScale || 1.0) / factor;
        container.style.transform = `scale(${scaleValue})`;
        container.style.transformOrigin = "center center";

        overlayRoot.style.display = "block";
    }

    // Dynamic row rendering helper
    function renderTabRows(targetContainer, tabs, selectedIndex) {
        tabs.forEach((tab, index) => {
            const row = document.createElement("div");
            row.className = `tab-row${index === selectedIndex ? " selected" : ""}`;
            
            // Add active-tab class if this is the browser's currently active tab
            if (tab.active) {
                row.classList.add("active-tab");
            }

            // High-reliability Favicon retrieval using Chrome MV3 Favicons API
            const faviconUrl = tab.url ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32` : (tab.favIconUrl || "");
            
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

            // Title
            const titleSpan = document.createElement("span");
            titleSpan.className = "tab-title";
            titleSpan.textContent = tab.title || "Untitled Tab";
            row.appendChild(titleSpan);

            // Mouse fallbacks
            row.addEventListener("mouseenter", () => {
                if (index !== selectedIndex) {
                    chrome.runtime.sendMessage({
                        type: "cyclr-change-selected",
                        direction: index - selectedIndex
                    });
                }
            });

            row.addEventListener("mousedown", (e) => {
                e.preventDefault();
                chrome.runtime.sendMessage({ type: "cyclr-commit" });
            });

            targetContainer.appendChild(row);
        });
    }

    // Helper to check if a keyboard event matches the configured custom shortcut
    function matchesCustomShortcut(e) {
        if (!customShortcut) return false;
        
        // Match key (case-insensitive for reliability)
        const matchesKey = e.key.toLowerCase() === customShortcut.key.toLowerCase() || 
                           e.code.toLowerCase() === ("key" + customShortcut.key).toLowerCase() ||
                           e.code.toLowerCase() === customShortcut.key.toLowerCase();
                           
        // Match modifiers exactly
        const matchesModifiers = e.altKey === !!customShortcut.altKey &&
                                 e.ctrlKey === !!customShortcut.ctrlKey &&
                                 e.shiftKey === !!customShortcut.shiftKey &&
                                 e.metaKey === !!customShortcut.metaKey;
                                 
        return matchesKey && matchesModifiers;
    }

    // Capture phase keyboard hooks
    window.addEventListener("keydown", (e) => {
        // 1. Overlay is INACTIVE: Listen for custom shortcut trigger to open overlay
        if (!isActive) {
            if (matchesCustomShortcut(e)) {
                e.preventDefault();
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "cyclr-trigger-open" });
            }
            return;
        }

        // 2. Overlay is ACTIVE: Block all host page keyboard shortcut interruptions
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
            // Only allow default Alt+Q cycling if no custom shortcut is active to prevent cross-conflicts
            if (!customShortcut) {
                e.preventDefault();
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: 1 });
            }
        } else if (matchesCustomShortcut(e)) {
            // Also support custom shortcut trigger to cycle down the list!
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: 1 });
        }
    }, true);

    window.addEventListener("keyup", (e) => {
        if (!isActive) return;

        // Determine if primary modifier of key trigger is released to commit
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
            // Default Alt+Q commit condition
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
            isActive = true;
            renderOverlay(msg.tabs, msg.selectedIndex, msg.theme, msg.layoutMode, msg.zoomFactor, msg.uiScale);
        } else if (msg.type === "cyclr-close") {
            isActive = false;
            if (overlayRoot) {
                overlayRoot.style.display = "none";
            }
        }
    });
}