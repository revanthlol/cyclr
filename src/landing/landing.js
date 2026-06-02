document.addEventListener("DOMContentLoaded", () => {
    const chromeShortcutsBtn = document.getElementById("chromeShortcutsBtn");
    
    if (chromeShortcutsBtn) {
        chromeShortcutsBtn.addEventListener("click", () => {
            try {
                chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
            } catch (e) {
                console.error("Failed to open shortcuts config:", e);
            }
        });
    }
});
