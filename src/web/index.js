document.addEventListener("DOMContentLoaded", () => {
    // ── Mockup Tab Switcher Demo ──────────────────────────────────────────────
    const tabRows = document.querySelectorAll(".mockup-tab-row");
    const previewImg = document.querySelector(".mockup-preview-screenshot");
    let currentIndex = 0;
    let cycleInterval = null;
    let resumeTimeout = null;

    // Give the image a CSS transition for the auto-cycle fade
    if (previewImg) {
        previewImg.style.transition = "opacity 0.3s ease";
    }

    function activateTab(index, instant = false) {
        index = ((index % tabRows.length) + tabRows.length) % tabRows.length;
        currentIndex = index;

        // Update highlight
        tabRows.forEach((row, i) => {
            row.classList.toggle("active-tab", i === index);
        });

        const newSrc = tabRows[index].dataset.preview;
        if (!previewImg || !newSrc) return;

        if (instant) {
            // Hover: bypass transition, swap immediately
            previewImg.style.transition = "none";
            previewImg.src = newSrc;
            // Re-enable transition after the frame so auto-cycle still fades
            requestAnimationFrame(() => {
                previewImg.style.transition = "opacity 0.3s ease";
            });
        } else {
            // Auto-cycle: crossfade
            previewImg.style.opacity = "0";
            setTimeout(() => {
                previewImg.src = newSrc;
                previewImg.style.opacity = "1";
            }, 150);
        }
    }

    function startCycle() {
        if (cycleInterval) return;
        cycleInterval = setInterval(() => {
            activateTab(currentIndex + 1, false);
        }, 2000);
    }

    function pauseCycle() {
        clearInterval(cycleInterval);
        cycleInterval = null;
    }

    function scheduleResume() {
        clearTimeout(resumeTimeout);
        resumeTimeout = setTimeout(startCycle, 3000);
    }

    // Hover interaction — instant
    tabRows.forEach((row, index) => {
        row.addEventListener("mouseenter", () => {
            pauseCycle();
            clearTimeout(resumeTimeout);
            activateTab(index, true);
        });
        row.addEventListener("mouseleave", () => {
            scheduleResume();
        });
    });

    // Kick off auto-cycle
    activateTab(0, true);
    startCycle();
    // ─────────────────────────────────────────────────────────────────────────



    const downloadChromeBtn = document.getElementById("downloadChromeBtn");
    const downloadFirefoxBtn = document.getElementById("downloadFirefoxBtn");
    const versionBadge = document.getElementById("versionBadge");

    // Pre-fetch latest release from GitHub API to resolve asset URLs dynamically
    fetch("https://api.github.com/repos/revanthlol/cyclr/releases/latest")
        .then(response => {
            if (!response.ok) throw new Error("API response error");
            return response.json();
        })
        .then(data => {
            if (data && data.tag_name) {
                if (versionBadge) {
                    versionBadge.textContent = data.tag_name;
                }
            }
            if (data && data.assets && data.assets.length > 0) {
                const chromeAsset = data.assets.find(asset => asset.name === "cyclr-chrome.zip");
                const firefoxAsset = data.assets.find(asset => asset.name === "cyclr-firefox.zip");

                if (chromeAsset && downloadChromeBtn) {
                    downloadChromeBtn.href = chromeAsset.browser_download_url;
                }
                if (firefoxAsset && downloadFirefoxBtn) {
                    downloadFirefoxBtn.href = firefoxAsset.browser_download_url;
                }
            }
        })
        .catch(err => {
            console.warn("Failed to fetch latest release from GitHub API, using fallback latest release download URLs:", err);
            if (versionBadge) {
                versionBadge.textContent = "unknown";
            }
        });

    if (downloadChromeBtn) {
        downloadChromeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.location.href = `install.html?download=${encodeURIComponent(downloadChromeBtn.href)}`;
        });
    }

    if (downloadFirefoxBtn) {
        downloadFirefoxBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.location.href = `install.html?download=${encodeURIComponent(downloadFirefoxBtn.href)}`;
        });
    }
});

