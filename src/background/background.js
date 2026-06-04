const IS_FIREFOX = navigator.userAgent.includes("Firefox");
let devMode = false;

// Custom logging wrappers to respect the Developer Logs setting
function log(...args) {
    if (devMode) console.log(...args);
}
function warn(...args) {
    if (devMode) console.warn(...args);
}
function error(...args) {
    if (devMode) console.error(...args);
}

// Sync Dev Mode preference from local storage
chrome.storage.local.get({ devMode: false }, (items) => {
    devMode = !!items.devMode;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.devMode) {
        devMode = !!changes.devMode.newValue;
    }
});

const state = {
    tabs: [],
    selectedIndex: 0,
    active: false,
    sourceTabId: null
};

const MAX_VISIBLE_TABS = 100;
let tabHistory = []; // Array of tab IDs in MRU order (most recent first)
const tabScreenshots = {}; // Cache of tab screenshots: tabId -> dataURL
const tabFavicons = {}; // Cache of preloaded favicons: tabId -> { originalUrl, dataUrl }

// Helper to fetch a favicon URL and convert it to a data URL (Base64) in service worker context
async function fetchFaviconAsDataUrl(url) {
    if (!url) return null;
    if (url.startsWith("data:")) return url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const contentType = response.headers.get("content-type") || "image/x-icon";
        return `data:${contentType};base64,${base64}`;
    } catch (e) {
        return null;
    }
}

// Preload/cache favicon images when tabs are discovered
async function preloadFavicon(tab) {
    if (!tab || !tab.id || !tab.favIconUrl) return;
    // Only preload if we don't have a screenshot cached yet (initial uncached state)
    if (tabScreenshots[tab.id]) return;

    // Avoid redundant fetches if we already cached this specific URL for this tab
    if (tabFavicons[tab.id] && tabFavicons[tab.id].originalUrl === tab.favIconUrl) {
        return;
    }

    const dataUrl = await fetchFaviconAsDataUrl(tab.favIconUrl);
    if (dataUrl) {
        tabFavicons[tab.id] = {
            originalUrl: tab.favIconUrl,
            dataUrl: dataUrl
        };
        log(`[CYCLR] Preloaded favicon for tab ${tab.id}: ${tab.title}`);
    }
}

// Initialize MRU history on start or installation
async function initializeTabHistory() {
    try {
        const tabs = await chrome.tabs.query({});
        tabHistory = tabs.map(t => t.id);

        // Preload favicons for all discovered tabs
        for (const tab of tabs) {
            preloadFavicon(tab);
        }

        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = activeTabs[0];
        if (activeTab) {
            updateTabHistory(activeTab.id);
        }
        log("[CYCLR] MRU history initialized:", tabHistory);
    } catch (e) {
        error("[CYCLR] Initialization error:", e);
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        try {
            chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
        } catch (e) {
            error("[CYCLR] Failed to open onboarding page on install:", e);
        }
    }
    await initializeTabHistory();
});
chrome.runtime.onStartup.addListener(initializeTabHistory);

// Helper to ensure tabHistory is populated
async function ensureTabHistory() {
    if (tabHistory.length === 0) {
        await initializeTabHistory();
    }
}

function updateTabHistory(tabId) {
    const idx = tabHistory.indexOf(tabId);
    if (idx !== -1) {
        tabHistory.splice(idx, 1);
    }
    tabHistory.unshift(tabId);
}

function removeFromTabHistory(tabId) {
    const idx = tabHistory.indexOf(tabId);
    if (idx !== -1) {
        tabHistory.splice(idx, 1);
    }
}

// Track tab activation to maintain MRU history and capture active tab preview
chrome.tabs.onActivated.addListener((activeInfo) => {
    updateTabHistory(activeInfo.tabId);

    // Capture the newly active tab's screenshot after a brief delay so page stabilizes
    setTimeout(async () => {
        try {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            if (tab && !isInjectable(tab.url)) return;
            const dataUrl = await chrome.tabs.captureVisibleTab(activeInfo.windowId, { format: "jpeg", quality: 40 });
            tabScreenshots[activeInfo.tabId] = dataUrl;
        } catch (e) {
            // Silently fail if active tab is not captureable (e.g. chrome:// URL)
        }
    }, 400);
});

// Track tab deletion to maintain MRU history and clean up preview cache
chrome.tabs.onRemoved.addListener((tabId) => {
    removeFromTabHistory(tabId);
    delete tabScreenshots[tabId]; // Evict screenshot from memory cache
    delete tabFavicons[tabId]; // Evict preloaded favicon
});

// Capture page screenshot when a tab finishes loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.favIconUrl || changeInfo.status === "complete") {
        preloadFavicon(tab);
    }

    if (changeInfo.status === "complete" && tab.active) {
        if (!isInjectable(tab.url)) return;
        try {
            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 40 });
            tabScreenshots[tabId] = dataUrl;
        } catch (e) {
            // Silently ignore restricted urls
        }
    }
});

// Preload favicon when a new tab is created
chrome.tabs.onCreated.addListener((tab) => {
    preloadFavicon(tab);
});

// Pre-check function to verify if a tab's URL is a core browser page
function isInjectable(url) {
    if (!url) return false;

    // We only block core browser schemas to prevent ugly console errors
    const restrictedProtocols = [
        "chrome:",
        "chrome-extension:",
        "chrome-search:",
        "edge:",
        "about:",
        "moz-extension:"
    ];

    try {
        const parsed = new URL(url);
        return !restrictedProtocols.includes(parsed.protocol);
    } catch (e) {
        return false;
    }
}

// Helper to verify if content script is active on a tab, programmatically inject if missing
async function ensureContentScriptActive(tabId) {
    try {
        await chrome.tabs.sendMessage(tabId, { type: "cyclr-ping" });
        return true;
    } catch (e) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ["src/content/overlay.js"]
            });
            log("[CYCLR] Programmatically injected overlay.js into tab", tabId);
            await new Promise(resolve => setTimeout(resolve, 60));
            return true;
        } catch (injectError) {
            // Browser blocked the injection (e.g., protected domain like support.mozilla.org)
            warn("[CYCLR] Programmatic injection failed/blocked:", injectError.message);
            return false;
        }
    }
}

// Helper to retrieve saved user settings
async function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get({
            orderMode: "tab-order",
            theme: "dark",
            layoutMode: "preview",
            uiScale: "1.15",
            enableAnimations: true,
            enableBlur: false
        }, (items) => {
            resolve(items);
        });
    });
}

// Robust Promise-wrapped helper to fetch current webpage zoom factor
async function getTabZoom(tabId) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.getZoom(tabId, (zoom) => {
                resolve(zoom || 1.0);
            });
        } catch (e) {
            resolve(1.0);
        }
    });
}

// Broadcast rendering updates to the content script of the source tab
async function broadcastRender() {
    if (!state.sourceTabId) return;

    try {
        const settings = await getSettings();
        const zoomFactor = await getTabZoom(state.sourceTabId);

        await chrome.tabs.sendMessage(state.sourceTabId, {
            type: "cyclr-render",
            tabs: state.tabs.map(t => ({
                id: t.id,
                title: t.title,
                url: t.url, 
                favIconUrl: t.favIconUrl,
                favIconDataUrl: (tabFavicons[t.id] && tabFavicons[t.id].dataUrl) || null,
                active: t.active, 
                screenshot: tabScreenshots[t.id] || null 
            })),
            selectedIndex: state.selectedIndex,
            theme: settings.theme, 
            layoutMode: settings.layoutMode, 
            zoomFactor: zoomFactor, 
            uiScale: parseFloat(settings.uiScale || "1.15"), 
            enableAnimations: !!settings.enableAnimations, 
            enableBlur: !!settings.enableBlur 
        });
    } catch (err) {
        warn("[CYCLR] Broadcast render failed:", err);
    }
}

// Core trigger function called by both native Alt+Q command and custom shortcut messenger
async function triggerOpen() {
    await ensureTabHistory();
    const settings = await getSettings();

    if (!state.active) {
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = activeTabs[0];
        if (!activeTab) return;

        // Try to capture a fresh screenshot of the active tab immediately before showing the overlay
        if (isInjectable(activeTab.url)) {
            try {
                const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: "jpeg", quality: 40 });
                tabScreenshots[activeTab.id] = dataUrl;
            } catch (e) {
                // Silently ignore restricted context captures
            }
        }

        // 1. Trial and Error Injection
        const canInjectProtocol = isInjectable(activeTab.url);
        let scriptActive = false;

        if (canInjectProtocol) {
            scriptActive = await ensureContentScriptActive(activeTab.id);
        }

        // 2. Unified Fallback (Triggers if protocol is blocked OR injection fails)
        if (!canInjectProtocol || !scriptActive) {
            log("[CYCLR] Restricted context detected. Executing direct switch fallback.");
            let tabs = await chrome.tabs.query({ currentWindow: true });
            
            if (settings.orderMode === "mru") {
                tabs.sort((a, b) => {
                    let idxA = tabHistory.indexOf(a.id);
                    let idxB = tabHistory.indexOf(b.id);
                    if (idxA === -1) idxA = Infinity;
                    if (idxB === -1) idxB = Infinity;
                    return idxA - idxB;
                });
            }

            const activeIndex = tabs.findIndex(t => t.id === activeTab.id);
            let prevActiveIndex = (activeIndex !== -1) ? (activeIndex + 1) % tabs.length : 0;
            
            if (settings.orderMode === "mru" && tabHistory.length > 1) {
                const prevActiveId = tabHistory.find(id => id !== activeTab.id && tabs.some(t => t.id === id));
                if (prevActiveId) {
                    const idx = tabs.findIndex(t => t.id === prevActiveId);
                    if (idx !== -1) {
                        prevActiveIndex = idx;
                    }
                }
            }

            const targetTab = tabs[prevActiveIndex];
            if (targetTab && targetTab.id !== activeTab.id) {
                await chrome.tabs.update(targetTab.id, { active: true });
                updateTabHistory(targetTab.id);
                log("[CYCLR] Switched from restricted page to standard tab:", targetTab.id);
            }
            return;
        }

        // 3. Injectable Flow: Script is active, proceed to render overlay
        let tabs = await chrome.tabs.query({ currentWindow: true });

        // Preload any missing favicons for current window tabs
        for (const tab of tabs) {
            preloadFavicon(tab);
        }

        if (settings.orderMode === "mru") {
            // Sort tabs by their position in the MRU history
            tabs.sort((a, b) => {
                let idxA = tabHistory.indexOf(a.id);
                let idxB = tabHistory.indexOf(b.id);
                if (idxA === -1) idxA = Infinity;
                if (idxB === -1) idxB = Infinity;
                return idxA - idxB;
            });
        }
        // In "tab-order" mode, we do nothing to the tabs order, so they stay in standard left-to-right order!

        // Limit visible tabs to MAX_VISIBLE_TABS (8)
        tabs = tabs.slice(0, MAX_VISIBLE_TABS);

        if (tabs.length === 0) return;

        state.active = true;
        state.tabs = tabs;
        state.sourceTabId = activeTab.id;
        
        // Initial selectedIndex:
        // Try to select the previously active tab (from MRU history) if present in the visible tabs,
        // otherwise select the next tab to the right in the list.
        const activeIndex = tabs.findIndex(t => t.id === activeTab.id);
        let initialIndex = (activeIndex !== -1) ? (activeIndex + 1) % tabs.length : 0;
        
        if (settings.orderMode === "mru" && tabHistory.length > 1) {
            const prevActiveId = tabHistory.find(id => id !== activeTab.id && tabs.some(t => t.id === id));
            if (prevActiveId) {
                const idx = tabs.findIndex(t => t.id === prevActiveId);
                if (idx !== -1) {
                    initialIndex = idx;
                }
            }
        }
        state.selectedIndex = initialIndex;

        log("[CYCLR] Opened. Initial index:", state.selectedIndex);
        await broadcastRender();
    } else {
        // Subsequent presses cycle down the list
        state.selectedIndex = (state.selectedIndex + 1) % state.tabs.length;
        log("[CYCLR] Cycled. Index:", state.selectedIndex);
        await broadcastRender();
    }
}

// Handle Alt+Q native command trigger
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "open-cyclr") return;

    // Ignore default Alt+Q command if user has a custom shortcut active to prevent double conflicts
    const hasCustom = await new Promise(resolve => {
        chrome.storage.local.get("customShortcut", (data) => {
            resolve(!!data.customShortcut);
        });
    });
    if (hasCustom) {
        log("[CYCLR] Default Alt+Q ignored since custom shortcut is active.");
        return;
    }

    await triggerOpen();
});

// Listen to message interactions from content script overlay
chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "cyclr-trigger-open") {
        await triggerOpen();
    } else if (msg.type === "cyclr-commit") {
        if (!state.active) return;

        // Immediately close the overlay UI
        if (state.sourceTabId) {
            try {
                await chrome.tabs.sendMessage(state.sourceTabId, { type: "cyclr-close" });
            } catch (e) {}
        }

        const targetTab = state.tabs[state.selectedIndex];
        if (targetTab && targetTab.id !== state.sourceTabId) {
            await chrome.tabs.update(targetTab.id, { active: true });
            updateTabHistory(targetTab.id);
        }

        state.active = false;
        state.tabs = [];
        state.selectedIndex = 0;
        state.sourceTabId = null;
        log("[CYCLR] Committed switch");
    } else if (msg.type === "cyclr-close") {
        if (!state.active) return;

        if (state.sourceTabId) {
            try {
                await chrome.tabs.sendMessage(state.sourceTabId, { type: "cyclr-close" });
            } catch (e) {}
        }

        state.active = false;
        state.tabs = [];
        state.selectedIndex = 0;
        state.sourceTabId = null;
        log("[CYCLR] Closed/Cancelled");
    } else if (msg.type === "cyclr-change-selected") {
        if (!state.active) return;

        const direction = msg.direction || 1;
        state.selectedIndex = (state.selectedIndex + direction + state.tabs.length) % state.tabs.length;
        await broadcastRender();
    } else if (msg.type === "cyclr-close-tab") {
        if (!state.active) return;
        const tabId = msg.tabId;
        try {
            await chrome.tabs.remove(tabId);
            state.tabs = state.tabs.filter(t => t.id !== tabId);
            if (state.selectedIndex >= state.tabs.length) {
                state.selectedIndex = Math.max(0, state.tabs.length - 1);
            }
            if (state.tabs.length === 0) {
                state.active = false;
                if (state.sourceTabId) {
                    try {
                        await chrome.tabs.sendMessage(state.sourceTabId, { type: "cyclr-close" });
                    } catch (e) {}
                }
            } else {
                await broadcastRender();
            }
        } catch (e) {
            error("[CYCLR] Failed to close tab:", e);
        }
    }
});