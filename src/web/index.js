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



    const downloadBtn = document.getElementById("downloadBtn");
    const downloadModal = document.getElementById("downloadModal");
    const modalCancelBtn = document.getElementById("modalCancelBtn");
    const modalConfirmBtn = document.getElementById("modalConfirmBtn");
    
    // GitHub's direct URL to download 'cyclr.zip' from the latest release.
    // This automatically redirects to the latest tag's 'cyclr.zip' file.
    let downloadUrl = "https://github.com/revanthlol/cyclr/releases/latest/download/cyclr.zip";

    // Pre-fetch latest release zip link from GitHub API to resolve asset URLs dynamically
    fetch("https://api.github.com/repos/revanthlol/cyclr/releases/latest")
        .then(response => {
            if (!response.ok) throw new Error("API response error");
            return response.json();
        })
        .then(data => {
            if (data && data.assets && data.assets.length > 0) {
                // Look for a zip file asset
                const zipAsset = data.assets.find(asset => asset.name.endsWith(".zip"));
                if (zipAsset) {
                    downloadUrl = zipAsset.browser_download_url;
                    return;
                }
            }
            if (data && data.zipball_url) {
                downloadUrl = data.zipball_url;
            }
        })
        .catch(err => {
            console.warn("Failed to fetch latest release from GitHub API, using fallback latest release download url:", err);
        });


    if (downloadBtn && downloadModal) {
        // Show modal on download button click
        downloadBtn.addEventListener("click", (e) => {
            e.preventDefault();
            downloadModal.classList.add("active");
        });
    }

    if (modalCancelBtn && downloadModal) {
        // Hide modal on Cancel click
        modalCancelBtn.addEventListener("click", () => {
            downloadModal.classList.remove("active");
        });
    }

    if (modalConfirmBtn && downloadModal) {
        // Redirect to install page with the download URL as query parameter on Confirm click
        modalConfirmBtn.addEventListener("click", () => {
            // Close the modal
            downloadModal.classList.remove("active");
            
            // Redirect current window to the manual installation guide page with download param
            window.location.href = `install.html?download=${encodeURIComponent(downloadUrl)}`;
        });
    }
});

