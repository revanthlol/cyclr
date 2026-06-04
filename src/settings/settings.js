document.addEventListener("DOMContentLoaded", () => {
    const orderSelect = document.getElementById("orderMode");
    const themeSelect = document.getElementById("themeMode");
    const layoutModeSelect = document.getElementById("layoutMode");
    const devToggle = document.getElementById("devToggle");
    const animationsToggle = document.getElementById("animationsToggle");
    const blurToggle = document.getElementById("blurToggle");
    const uiScaleSelect = document.getElementById("uiScale");
    const recordBtn = document.getElementById("recordShortcutBtn");
    const resetBtn = document.getElementById("resetShortcutBtn");
    let isRecording = false;
    let devMode = false;

    function log(...args) {
        if (devMode) console.log(...args);
    }

    chrome.storage.local.get({
        orderMode: "tab-order",
        theme: "dark",
        layoutMode: "list",
        devMode: false,
        uiScale: "1.15",
        enableAnimations: true,
        enableBlur: false
    }, (items) => {
        devMode = !!items.devMode;
        orderSelect.value = items.orderMode;
        themeSelect.value = items.theme;
        layoutModeSelect.value = items.layoutMode;
        devToggle.checked = devMode;
        uiScaleSelect.value = items.uiScale;
        animationsToggle.checked = !!items.enableAnimations;
        blurToggle.checked = !!items.enableBlur;
    });

    orderSelect.addEventListener("change", () => {
        chrome.storage.local.set({ orderMode: orderSelect.value }, () => {
            log("[CYCLR] Saved orderMode:", orderSelect.value);
        });
    });

    themeSelect.addEventListener("change", () => {
        chrome.storage.local.set({ theme: themeSelect.value }, () => {
            log("[CYCLR] Saved theme:", themeSelect.value);
        });
    });

    layoutModeSelect.addEventListener("change", () => {
        const mode = layoutModeSelect.value;
        chrome.storage.local.set({ layoutMode: mode }, () => {
            log("[CYCLR] Saved layoutMode:", mode);
        });
    });

    devToggle.addEventListener("change", () => {
        devMode = devToggle.checked;
        chrome.storage.local.set({ devMode }, () => {
            if (devMode) console.log("[CYCLR] Dev logging enabled!");
        });
    });

    uiScaleSelect.addEventListener("change", () => {
        chrome.storage.local.set({ uiScale: uiScaleSelect.value }, () => {
            log("[CYCLR] Saved uiScale:", uiScaleSelect.value);
        });
    });

    animationsToggle.addEventListener("change", () => {
        chrome.storage.local.set({ enableAnimations: animationsToggle.checked }, () => {
            log("[CYCLR] Saved enableAnimations:", animationsToggle.checked);
        });
    });

    blurToggle.addEventListener("change", () => {
        chrome.storage.local.set({ enableBlur: blurToggle.checked }, () => {
            log("[CYCLR] Saved enableBlur:", blurToggle.checked);
        });
    });

    // Human-readable labels for keys that aren't a single printable character.
    // Keyed by e.code (physical key — locale-independent, always reliable).
    const CODE_LABELS = {
        "Backquote":    "`",
        "Minus":        "-",
        "Equal":        "=",
        "BracketLeft":  "[",
        "BracketRight": "]",
        "Backslash":    "\\",
        "Semicolon":    ";",
        "Quote":        "'",
        "Comma":        ",",
        "Period":       ".",
        "Slash":        "/",
        "Space":        "Space",
        "Enter":        "Enter",
        "Backspace":    "Backspace",
        "Delete":       "Delete",
        "Tab":          "Tab",
        "ArrowUp":      "↑",
        "ArrowDown":    "↓",
        "ArrowLeft":    "←",
        "ArrowRight":   "→",
    };

    // Derive a clean display label for the non-modifier key part of a shortcut.
    // Prefers e.code (stored as s.code) because it's locale-independent.
    // Falls back to e.key (stored as s.key) for letter/digit keys.
    function getKeyLabel(s) {
        // Use code-based label if we have one
        if (s.code && CODE_LABELS[s.code] !== undefined) {
            return CODE_LABELS[s.code];
        }
        // Letter keys: code is "KeyQ" → label "Q"
        if (s.code && /^Key[A-Z]$/.test(s.code)) {
            return s.code.slice(3); // "KeyQ" → "Q"
        }
        // Digit keys: code is "Digit1" → label "1"
        if (s.code && /^Digit\d$/.test(s.code)) {
            return s.code.slice(5); // "Digit1" → "1"
        }
        // Fall back to e.key value if it's a normal printable char
        if (s.key && s.key !== "Unidentified" && s.key !== "Dead" && s.key.length === 1) {
            return s.key.toUpperCase();
        }
        // Last resort: use the raw code name or a question mark
        return s.code || s.key || "?";
    }

    function updateShortcutDisplay() {
        chrome.storage.local.get("customShortcut", (data) => {
            const s = data.customShortcut;
            if (s && (s.key || s.code)) {
                const parts = [];
                if (s.ctrlKey)  parts.push("Ctrl");
                if (s.altKey)   parts.push("Alt");
                if (s.shiftKey) parts.push("Shift");
                if (s.metaKey)  parts.push("Meta");
                parts.push(getKeyLabel(s));
                recordBtn.textContent = parts.join(" + ");
                resetBtn.style.display = "block";
            } else {
                recordBtn.textContent = "Alt + Q";
                resetBtn.style.display = "none";
            }
        });
    }

    updateShortcutDisplay();

    resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.storage.local.remove("customShortcut", () => {
            log("[CYCLR] Custom shortcut reset to default");
            updateShortcutDisplay();
        });
    });

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

        // Ignore bare modifier presses
        if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

        // Require at least one modifier
        if (!e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
            const prev = recordBtn.textContent;
            recordBtn.textContent = "Hold modifier!";
            setTimeout(() => {
                if (isRecording) recordBtn.textContent = "Press keys...";
            }, 1000);
            return;
        }

        // FIX: store BOTH e.key (character) and e.code (physical key name).
        // e.code is locale/modifier-independent — "Backquote" is always "Backquote"
        // even when Ctrl makes e.key come back as "Dead" or "Unidentified" on Linux.
        const customShortcut = {
            key:      e.key,    // "`", "q", "Dead", "Unidentified", etc.
            code:     e.code,   // "Backquote", "KeyQ", "Digit1", etc. — always reliable
            altKey:   e.altKey,
            ctrlKey:  e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey:  e.metaKey,
        };

        log("[CYCLR] Recording shortcut:", customShortcut);
        chrome.storage.local.set({ customShortcut }, () => {
            log("[CYCLR] Custom shortcut saved:", customShortcut);
            stopRecording();
        });
    }
});