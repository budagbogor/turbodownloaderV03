import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatTime(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

export function uuid4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto && typeof (crypto as Crypto).randomUUID === "function") {
    try { return (crypto as Crypto).randomUUID(); } catch { /* fallback */ }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getApiUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const isTauri =
    typeof window !== "undefined" &&
    (window.location.hostname === "tauri.localhost" ||
      Boolean((window as any).__TAURI_INTERNALS__) ||
      Boolean((window as any).__TAURI__) ||
      window.location.protocol === "tauri:" ||
      window.location.protocol === "asset:");
  if (isTauri) {
    return `http://127.0.0.1:3000${path.startsWith("/") ? path : "/" + path}`;
  }
  return path;
}

export async function openDownloadsFolderNative(customPath?: string) {
  // 1. Coba lewat Tauri Invoke jika berjalan di desktop
  try {
    const tauri = (window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__;
    if (tauri && typeof tauri.invoke === "function") {
      await tauri.invoke("open_downloads_folder", { path: customPath || null });
      return;
    }
  } catch (e) {
    console.warn("Tauri invoke open_downloads_folder failed, falling back to API:", e);
  }

  // 2. Fallback ke endpoint backend HTTP
  try {
    await fetch(getApiUrl("/api/downloads/open-folder"), { method: "POST" });
  } catch (e) {
    console.error("Failed to open folder via API:", e);
  }
}

export async function openFileInFolderNative(taskId: string, filepath?: string) {
  // 1. Coba lewat Tauri Invoke jika ada filepath
  try {
    const tauri = (window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__;
    if (tauri && typeof tauri.invoke === "function" && filepath) {
      await tauri.invoke("open_file_in_folder", { filepath });
      return;
    }
  } catch (e) {
    console.warn("Tauri invoke open_file_in_folder failed, falling back to API:", e);
  }

  // 2. Fallback ke endpoint backend HTTP
  try {
    await fetch(getApiUrl(`/api/downloads/${taskId}/open-folder`), { method: "POST" });
  } catch (e) {
    console.error("Failed to open task folder via API:", e);
  }
}

export async function pickFolderNative(): Promise<string | null> {
  // 1. Coba lewat Tauri Invoke dialog
  try {
    const tauri = (window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__;
    if (tauri && typeof tauri.invoke === "function") {
      const selected = await tauri.invoke("pick_folder");
      if (selected && typeof selected === "string") {
        return selected;
      }
      return null;
    }
  } catch (e) {
    console.warn("Tauri invoke pick_folder failed, falling back to API:", e);
  }

  // 2. Fallback ke API backend
  try {
    const res = await fetch(getApiUrl("/api/settings/choose-folder"), { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.folder) {
        return data.folder;
      }
    }
  } catch (e) {
    console.error("Failed to pick folder via API:", e);
  }
  return null;
}
