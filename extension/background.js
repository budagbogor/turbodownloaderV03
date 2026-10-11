// TurboDownloader Integration Module - Background Service Worker
const TURBO_SERVER = "http://localhost:3000";

// Listen to message calls from Content Script and Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_DOWNLOAD") {
    sendDownloadToServer(request.url, request.filename)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === "CHECK_SERVER") {
    checkServerStatus()
      .then((online) => sendResponse({ online }))
      .catch(() => sendResponse({ online: false }));
    return true;
  }

  if (request.action === "OPEN_FOLDER") {
    fetch(`${TURBO_SERVER}/api/downloads/open-folder`, { method: "POST" })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
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
    body: JSON.stringify({ url, filename, autoCompress: true, openFolder: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Server HTTP error " + res.status }));
    throw new Error(err.error || "Gagal mengirim unduhan ke TurboDownloader");
  }
  return res.json();
}
