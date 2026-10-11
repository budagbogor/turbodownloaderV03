import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import "@fontsource-variable/inter";
import App from "./App";
import "./index.css";

// Auto-route API and WebSocket calls to local engine on port 3000 when running inside Tauri
const isTauri =
  typeof window !== "undefined" &&
  (window.location.hostname === "tauri.localhost" ||
    Boolean((window as any).__TAURI_INTERNALS__) ||
    Boolean((window as any).__TAURI__) ||
    window.location.protocol === "tauri:" ||
    window.location.protocol === "asset:");

if (isTauri) {
  const BACKEND_URL = "http://127.0.0.1:3000";
  axios.defaults.baseURL = BACKEND_URL;

  const originalFetch = window.fetch;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      if (input.startsWith("/api/")) {
        return originalFetch(`${BACKEND_URL}${input}`, init);
      }
      if (input.startsWith("http://127.0.0.1:3000") || input.startsWith("http://localhost:3000")) {
        return originalFetch(input, init);
      }
    }
    return originalFetch(input, init);
  };
}

function ensureFavicon() {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][sizes="any"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/x-icon";
    link.sizes = "any";
    document.head.appendChild(link);
  }
  const ts = String(Date.now());
  link.href = "/favicon.ico?v=" + ts;
  const short = document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
  if (!short) {
    const s = document.createElement("link");
    s.rel = "shortcut icon";
    s.type = "image/x-icon";
    s.href = "/favicon.ico?v=" + ts;
    document.head.appendChild(s);
  } else {
    short.href = "/favicon.ico?v=" + ts;
  }
}

ensureFavicon();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
