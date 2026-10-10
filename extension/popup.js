document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  const container = document.getElementById("stream-container");

  // 1. Check Server Connection
  chrome.runtime.sendMessage({ action: "CHECK_SERVER" }, (res) => {
    if (res && res.online) {
      statusEl.className = "status-badge status-online";
      statusText.textContent = "Server Online";
    } else {
      statusEl.className = "status-badge status-offline";
      statusText.textContent = "Server Offline";
    }
  });

  // 2. Query Current Active Tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const currentTab = tabs[0];

    chrome.runtime.sendMessage({ action: "GET_TAB_STREAMS", tabId: currentTab.id }, (res) => {
      const streams = res ? res.streams || [] : [];

      if (streams.length === 0) {
        // Fallback: offer page URL directly
        container.innerHTML = `
          <div class="stream-item">
            <div class="stream-info">
              <div class="stream-url">${escapeHtml(currentTab.title || currentTab.url)}</div>
              <div class="stream-meta">Web Page Source URL</div>
            </div>
            <button class="btn-download" data-url="${escapeHtml(currentTab.url)}">Download</button>
          </div>
        `;
      } else {
        container.innerHTML = streams
          .map((s, idx) => `
            <div class="stream-item">
              <div class="stream-info">
                <div class="stream-url">${escapeHtml(s.url)}</div>
                <div class="stream-meta">${escapeHtml(s.mime || s.type)} • ${new Date(s.timestamp).toLocaleTimeString()}</div>
              </div>
              <button class="btn-download" data-url="${escapeHtml(s.url)}">Download</button>
            </div>
          `)
          .join("");
      }

      // Add click listeners to Download buttons
      container.querySelectorAll(".btn-download").forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetUrl = btn.getAttribute("data-url");
          btn.disabled = true;
          btn.textContent = "Sending...";

          chrome.runtime.sendMessage({ action: "START_DOWNLOAD", url: targetUrl }, (resp) => {
            btn.disabled = false;
            if (resp && resp.success) {
              btn.textContent = "Sent! 🚀";
              setTimeout(() => { btn.textContent = "Download"; }, 2000);
            } else {
              btn.textContent = "Failed";
              alert(resp ? resp.error : "Failed to connect to TurboDownloader server");
            }
          });
        });
      });
    });
  });
});

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
