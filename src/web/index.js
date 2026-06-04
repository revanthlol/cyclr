document.addEventListener("DOMContentLoaded", () => {
    // ── Mockup Tab Switcher Demo ──────────────────────────────────────────────
    const tabRows = document.querySelectorAll(".mockup-tab-row");
    const previewImg = document.querySelector(".mockup-preview-screenshot");
    const mockupOverlay = document.querySelector(".mockup-overlay-container");
    let currentIndex = 0;
    let cycleInterval = null;
    let resumeTimeout = null;

    // Give the image a CSS transition for the auto-cycle fade
    if (previewImg) {
        previewImg.style.transition = "opacity 0.3s ease";
    }

    function activateTab(index, instant = false) {
        const isGrid = mockupOverlay && mockupOverlay.classList.contains("grid-mode");
        const limit = isGrid ? 4 : tabRows.length;
        index = ((index % limit) + limit) % limit;
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

    // Widescreen, List & Grid Mode Mockup Toggle
    const toggleWidescreen = document.getElementById("toggleWidescreen");
    const toggleList = document.getElementById("toggleList");
    const toggleGrid = document.getElementById("toggleGrid");

    if (toggleWidescreen && toggleList && toggleGrid && mockupOverlay) {
        toggleWidescreen.addEventListener("click", () => {
            toggleWidescreen.classList.add("active");
            toggleList.classList.remove("active");
            toggleGrid.classList.remove("active");
            mockupOverlay.classList.remove("list-mode");
            mockupOverlay.classList.remove("grid-mode");
        });

        toggleList.addEventListener("click", () => {
            toggleList.classList.add("active");
            toggleWidescreen.classList.remove("active");
            toggleGrid.classList.remove("active");
            mockupOverlay.classList.add("list-mode");
            mockupOverlay.classList.remove("grid-mode");
        });

        toggleGrid.addEventListener("click", () => {
            toggleGrid.classList.add("active");
            toggleWidescreen.classList.remove("active");
            toggleList.classList.remove("active");
            mockupOverlay.classList.add("grid-mode");
            mockupOverlay.classList.remove("list-mode");
            if (currentIndex >= 4) {
                activateTab(0, true);
            }
        });
    }

    // Close button interactions in mockup
    const closeBtns = document.querySelectorAll(".mockup-close-tab-btn, .mockup-grid-close-btn");
    closeBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            const row = btn.closest(".mockup-tab-row");
            if (row) {
                row.style.transition = "all 0.3s ease";
                row.style.opacity = "0";
                row.style.transform = "scale(0.9)";
                setTimeout(() => {
                    row.style.display = "none";
                }, 300);
            }
        });
        btn.addEventListener("mouseenter", (e) => {
            e.stopPropagation();
        });
        btn.addEventListener("mouseleave", (e) => {
            e.stopPropagation();
        });
    });
});

