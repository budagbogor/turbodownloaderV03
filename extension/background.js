// TurboDownloader Integration Module - Background Service Worker
const TURBO_SERVER = "http://localhost:3000";

// Storage for detected media streams per tab
const tabMediaStreams = new Map();

// File extensions and MIME types to sniff
const MEDIA_EXTENSIONS = [".mp4", ".mkv", ".webm", ".m3u8", ".mpd", ".flv", ".mov", ".m4a", ".mp3", ".aac", ".wav", ".ts"];
const MEDIA_MIMES = ["video/mp4", "video/webm", "video/x-matroska", "application/x-mpegurl", "application/dash+xml", "audio/mpeg", "audio/mp4"];

// Network Request Sniffer (IDM-class detection)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details.url || details.tabId < 0) return;
    const url = details.url;

    // Filter out common ad/analytics scripts
    if (url.includes("google-analytics") || url.includes("doubleclick") || url.includes("facebook.com/tr")) return;

    let isMedia = false;
    let contentType = "";

    // Check Content-Type header
    if (details.responseHeaders) {
      for (const h of details.responseHeaders) {
        if (h.name.toLowerCase() === "content-type") {
          contentType = h.value.toLowerCase();
          if (MEDIA_MIMES.some((m) => contentType.includes(m))) {
            isMedia = true;
          }
          break;
        }
      }
    }

    // Check extension if MIME not explicit
    if (!isMedia) {
      const cleanUrl = url.split("?")[0].toLowerCase();
      if (MEDIA_EXTENSIONS.some((ext) => cleanUrl.endsWith(ext))) {
        isMedia = true;
      }
    }

    if (isMedia) {
      const tabId = details.tabId;
      if (!tabMediaStreams.has(tabId)) {
        tabMediaStreams.set(tabId, []);
      }
      const streams = tabMediaStreams.get(tabId);
      if (!streams.some((s) => s.url === url)) {
        streams.push({
          url,
          mime: contentType,
          type: contentType.includes("audio") ? "audio" : "video",
          timestamp: Date.now(),
        });
        // Limit to 20 streams per tab
        if (streams.length > 20) streams.shift();
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Clean up memory when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaStreams.delete(tabId);
});

// Handle incoming messages from Content Script and Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_TAB_STREAMS") {
    const tabId = request.tabId || (sender.tab ? sender.tab.id : null);
    const streams = tabId ? tabMediaStreams.get(tabId) || [] : [];
    sendResponse({ streams });
    return true;
  }

  if (request.action === "START_DOWNLOAD") {
    sendDownloadToServer(request.url, request.filename)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "CHECK_SERVER") {
    checkServerStatus()
      .then((online) => sendResponse({ online }))
      .catch(() => sendResponse({ online: false }));
    return true;
  }
});

async function checkServerStatus() {
  try {
    const res = await fetch(`${TURBO_SERVER}/api/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendDownloadToServer(url, filename = "") {
  const res = await fetch(`${TURBO_SERVER}/api/downloads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, filename }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Server HTTP error " + res.status }));
    throw new Error(err.error || "Gagal memulai download ke TurboDownloader");
  }
  return res.json();
}
