// TurboDownloader IDM-Class Floating Video Sniffer Widget
(function () {
  if (window.__turboSnifferInjected) return;
  window.__turboSnifferInjected = true;

  const PROCESSED_VIDEOS = new WeakSet();

  function showToast(message, isSuccess = true) {
    let toast = document.getElementById("turbo-downloader-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "turbo-downloader-toast";
      document.body.appendChild(toast);
    }
    toast.className = `turbo-toast ${isSuccess ? "success" : "error"}`;
    toast.innerHTML = `
      <div class="turbo-toast-icon">${isSuccess ? "⚡" : "⚠️"}</div>
      <div class="turbo-toast-text">${message}</div>
    `;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 4000);
  }

  function createFloatingButton(videoEl) {
    if (PROCESSED_VIDEOS.has(videoEl)) return;
    PROCESSED_VIDEOS.add(videoEl);

    // Parent wrapper check
    const container = videoEl.parentElement;
    if (!container) return;

    // Ensure relative positioning
    const compPos = window.getComputedStyle(container).position;
    if (compPos === "static") {
      container.style.position = "relative";
    }

    const btnWrapper = document.createElement("div");
    btnWrapper.className = "turbo-floating-widget";
    btnWrapper.innerHTML = `
      <button class="turbo-btn-main" title="Download video ini dengan TurboDownloader">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download Video</span>
        <span class="turbo-badge">Turbo</span>
      </button>
    `;

    const btn = btnWrapper.querySelector(".turbo-btn-main");
    if (!btn) return;

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      let targetUrl = videoEl.currentSrc || videoEl.src || window.location.href;

      // Handle YouTube / social media portals by page URL
      if (window.location.host.includes("youtube.com") || window.location.host.includes("youtu.be") ||
          window.location.host.includes("tiktok.com") || window.location.host.includes("facebook.com") ||
          window.location.host.includes("instagram.com")) {
        targetUrl = window.location.href;
      }

      btn.disabled = true;
      btn.classList.add("loading");
      btn.querySelector("span").textContent = "Mengirim...";

      chrome.runtime.sendMessage(
        { action: "START_DOWNLOAD", url: targetUrl, filename: "" },
        (response) => {
          btn.disabled = false;
          btn.classList.remove("loading");
          btn.querySelector("span").textContent = "Download Video";

          if (response && response.success) {
            showToast("Video berhasil dikirim ke TurboDownloader! 🚀", true);
          } else {
            const errStr = response ? response.error : "TurboDownloader Server Offline (Pastikan app berjalan di localhost:3000)";
            showToast(errStr, false);
          }
        }
      );
    });

    container.appendChild(btnWrapper);
  }

  function scanMediaPlayers() {
    const videos = document.querySelectorAll("video");
    videos.forEach((v) => {
      if (v.offsetWidth > 150 && v.offsetHeight > 100) {
        createFloatingButton(v);
      }
    });
  }

  // Initial scan & MutationObserver for dynamically loaded videos
  scanMediaPlayers();
  const observer = new MutationObserver(() => {
    scanMediaPlayers();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(scanMediaPlayers, 2500);
})();
