document.addEventListener("DOMContentLoaded", () => {
    const orderSelect = document.getElementById("orderMode");
    const themeSelect = document.getElementById("themeMode");
    const layoutToggle = document.getElementById("layoutToggle");
    const devToggle = document.getElementById("devToggle");
    const animationsToggle = document.getElementById("animationsToggle");
    const blurToggle = document.getElementById("blurToggle");
    const uiScaleSelect = document.getElementById("uiScale");
    const recordBtn = document.getElementById("recordShortcutBtn");
    const resetBtn = document.getElementById("resetShortcutBtn");
    const getStartedBtn = document.getElementById("getStartedBtn");
    let isRecording = false;
    let devMode = false;

    // Helper to log messages only if devMode is active
    function log(...args) {
        if (devMode) console.log(...args);
    }

    // Load saved settings (defaulting to tab-strip order, dark theme, list layout, dev mode off, and medium scale)
    chrome.storage.local.get({
        orderMode: "tab-order",
        theme: "dark",
        layoutMode: "list",
        devMode: false,
        uiScale: "1.0",
        enableAnimations: true,
        enableBlur: false
    }, (items) => {
        devMode = !!items.devMode;
        orderSelect.value = items.orderMode;
        themeSelect.value = items.theme;
        layoutToggle.checked = (items.layoutMode === "preview");
        devToggle.checked = devMode;
        uiScaleSelect.value = items.uiScale;
        animationsToggle.checked = !!items.enableAnimations;
        blurToggle.checked = !!items.enableBlur;
    });

    // Save changes immediately on select selection
    orderSelect.addEventListener("change", () => {
        chrome.storage.local.set({
            orderMode: orderSelect.value
        }, () => {
            log("[CYCLR] Saved orderMode:", orderSelect.value);
        });
    });

    themeSelect.addEventListener("change", () => {
        chrome.storage.local.set({
            theme: themeSelect.value
        }, () => {
            log("[CYCLR] Saved theme:", themeSelect.value);
        });
    });

    // Save layout mode when the toggle is flipped
    layoutToggle.addEventListener("change", () => {
        const mode = layoutToggle.checked ? "preview" : "list";
        chrome.storage.local.set({
            layoutMode: mode
        }, () => {
            log("[CYCLR] Saved layoutMode:", mode);
        });
    });

    // Save devMode when the toggle is flipped
    devToggle.addEventListener("change", () => {
        devMode = devToggle.checked;
        chrome.storage.local.set({
            devMode: devMode
        }, () => {
            if (devMode) console.log("[CYCLR] Dev logging enabled!");
        });
    });

    // Save Switcher Scale selection
    uiScaleSelect.addEventListener("change", () => {
        chrome.storage.local.set({
            uiScale: uiScaleSelect.value
        }, () => {
            log("[CYCLR] Saved uiScale:", uiScaleSelect.value);
        });
    });

    // Save Animations toggle selection
    animationsToggle.addEventListener("change", () => {
        chrome.storage.local.set({
            enableAnimations: animationsToggle.checked
        }, () => {
            log("[CYCLR] Saved enableAnimations:", animationsToggle.checked);
        });
    });

    // Save Blur Backdrop toggle selection
    blurToggle.addEventListener("change", () => {
        chrome.storage.local.set({
            enableBlur: blurToggle.checked
        }, () => {
            log("[CYCLR] Saved enableBlur:", blurToggle.checked);
        });
    });

    // Load and display custom shortcut key
    function updateShortcutDisplay() {
        chrome.storage.local.get("customShortcut", (data) => {
            if (data.customShortcut) {
                const s = data.customShortcut;
                const parts = [];
                if (s.ctrlKey) parts.push("Ctrl");
                if (s.altKey) parts.push("Alt");
                if (s.shiftKey) parts.push("Shift");
                if (s.metaKey) parts.push("Meta");
                
                const keyDisplay = s.key.length === 1 ? s.key.toUpperCase() : s.key;
                parts.push(keyDisplay);
                
                recordBtn.textContent = parts.join(" + ");
                resetBtn.style.display = "block";
            } else {
                recordBtn.textContent = "Alt + Q";
                resetBtn.style.display = "none";
            }
        });
    }

    updateShortcutDisplay();

    // Reset shortcut back to default Alt+Q
    resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.storage.local.remove("customShortcut", () => {
            log("[CYCLR] Custom shortcut reset to default");
            updateShortcutDisplay();
        });
    });

    // Record shortcut listener
    recordBtn.addEventListener("click", () => {
        if (isRecording) {
            stopRecording();
            return;
        }
        startRecording();
    });

    function startRecording() {
        isRecording = true;
        recordBtn.textContent = "Press keys...";
        recordBtn.classList.add("recording");
        window.addEventListener("keydown", handleRecordKeydown);
    }

    function stopRecording() {
        isRecording = false;
        recordBtn.classList.remove("recording");
        window.removeEventListener("keydown", handleRecordKeydown);
        updateShortcutDisplay();
    }

    function handleRecordKeydown(e) {
        e.preventDefault();
        e.stopPropagation();

        if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
            return;
        }

        if (!e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
            recordBtn.textContent = "Hold modifier!";
            setTimeout(() => {
                if (isRecording) recordBtn.textContent = "Press keys...";
            }, 1000);
            return;
        }

        const customShortcut = {
            key: e.key,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey
        };

        chrome.storage.local.set({ customShortcut }, () => {
            log("[CYCLR] Custom shortcut saved:", customShortcut);
            stopRecording();
        });
    }

    // Close the onboarding setup tab with a success transition
    getStartedBtn.addEventListener("click", () => {
        // Change button state to show save confirmation
        getStartedBtn.textContent = "Saved! Closing...";
        getStartedBtn.style.backgroundColor = "#2b8a3e";
        getStartedBtn.style.borderColor = "#40c057";
        getStartedBtn.style.color = "#ffffff";
        
        setTimeout(() => {
            try {
                chrome.tabs.getCurrent((tab) => {
                    if (tab && tab.id) {
                        chrome.tabs.remove(tab.id);
                    } else {
                        window.close();
                    }
                });
            } catch (e) {
                window.close();
            }
        }, 1000);
    });
});
