document.addEventListener("DOMContentLoaded", () => {
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

