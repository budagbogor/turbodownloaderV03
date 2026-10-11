import { useEffect, useRef, useState, useCallback } from "react";
import type { DownloadTask } from "../types";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "polling" | "offline";

export interface WsMessage {
  type: string;
  data?: any;
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 600;
const POLL_INTERVAL_MS = 1200;

function getWsUrl(): string {
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "tauri.localhost" ||
      Boolean((window as any).__TAURI_INTERNALS__) ||
      Boolean((window as any).__TAURI__) ||
      window.location.protocol === "tauri:" ||
      window.location.protocol === "asset:")
  ) {
    return "ws://127.0.0.1:3000";
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}`;
}

export function useDownloadsWebSocket(initialDownloads: DownloadTask[] = []) {
  const [downloads, setDownloads] = useState<DownloadTask[]>(initialDownloads);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastMessageAt, setLastMessageAt] = useState<number>(Date.now());

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const isPollingModeRef = useRef<boolean>(false);
  const notifiedRef = useRef<Set<string>>(new Set());
  const onNotifiedRef = useRef<((task: DownloadTask) => void) | null>(null);
  const onInspectUpdateRef = useRef<((task: DownloadTask) => void) | null>(null);
  const inspectingIdRef = useRef<string | null>(null);

  const setInspectingId = useCallback((id: string | null) => {
    inspectingIdRef.current = id;
  }, []);

  const setOnTaskNotified = useCallback((cb: (task: DownloadTask) => void) => {
    onNotifiedRef.current = cb;
  }, []);

  const setOnInspectUpdate = useCallback((cb: (task: DownloadTask) => void) => {
    onInspectUpdateRef.current = cb;
  }, []);

  const processDownloads = useCallback((list: DownloadTask[]) => {
    setDownloads(list);
    const inspectId = inspectingIdRef.current;
    if (inspectId && onInspectUpdateRef.current) {
      const updated = list.find((t) => t.id === inspectId);
      if (updated) onInspectUpdateRef.current(updated);
    }
    if (onNotifiedRef.current) {
      list.forEach((task) => {
        if (task.status === "completed" && !notifiedRef.current.has(task.id)) {
          notifiedRef.current.add(task.id);
          onNotifiedRef.current!(task);
        }
      });
    }
    setLastMessageAt(Date.now());
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const res = await fetch("/api/downloads", { cache: "no-store" });
      if (res.ok) {
        const ctype = res.headers.get("content-type") || "";
        if (ctype.includes("application/json")) {
          const data: DownloadTask[] = await res.json();
          processDownloads(data);
          if (!isPollingModeRef.current) setStatus("connected");
        }
      }
    } catch {
      if (isPollingModeRef.current) setStatus("offline");
    }
  }, [processDownloads]);

  const startPolling = useCallback(() => {
    isPollingModeRef.current = true;
    setStatus("polling");
    if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    pollOnce();
    pollTimerRef.current = window.setInterval(pollOnce, POLL_INTERVAL_MS);
  }, [pollOnce]);

  const connect = useCallback(() => {
    if (isPollingModeRef.current) return;
    if (retryCountRef.current > MAX_RETRIES) {
      startPolling();
      return;
    }
    setStatus(retryCountRef.current === 0 ? "connecting" : "reconnecting");

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getWsUrl());
    } catch (e: any) {
      retryCountRef.current += 1;
      const delay = BASE_BACKOFF_MS * Math.pow(2, retryCountRef.current - 1);
      reconnectTimerRef.current = window.setTimeout(connect, delay);
      return;
    }
    wsRef.current = ws;

    let didOpen = false;

    ws.onopen = () => {
      didOpen = true;
      retryCountRef.current = 0;
      setStatus("connected");
      setLastMessageAt(Date.now());
    };

    ws.onmessage = (ev) => {
      try {
        const msg: WsMessage = JSON.parse(String(ev.data));
        if (msg.type === "INIT" || msg.type === "UPDATE_ALL") {
          const list = Array.isArray(msg.data) ? (msg.data as DownloadTask[]) : [];
          processDownloads(list);
        } else if (msg.type === "UPDATE_DOWNLOAD") {
          const task = msg.data as DownloadTask;
          setDownloads((prev) => {
            const idx = prev.findIndex((t) => t.id === task.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = task;
              return next;
            }
            return [...prev, task];
          });
          if (inspectingIdRef.current === task.id && onInspectUpdateRef.current) {
            onInspectUpdateRef.current(task);
          }
          if (onNotifiedRef.current && task.status === "completed" && !notifiedRef.current.has(task.id)) {
            notifiedRef.current.add(task.id);
            onNotifiedRef.current(task);
          }
          setLastMessageAt(Date.now());
        } else if (msg.type === "NEW_DOWNLOAD") {
          const task = msg.data as DownloadTask;
          setDownloads((prev) => {
            if (prev.find((t) => t.id === task.id)) return prev;
            return [task, ...prev];
          });
        } else if (msg.type === "DELETE_DOWNLOAD") {
          const { id } = msg.data as { id: string };
          setDownloads((prev) => prev.filter((t) => t.id !== id));
        } else if (msg.type === "SETTINGS_UPDATED") {
          setSettings(msg.data || {});
        }
      } catch {
        /* ignore bad frames */
      }
    };

    const scheduleReconnect = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (isPollingModeRef.current) return;
      retryCountRef.current += 1;
      if (retryCountRef.current > MAX_RETRIES) {
        startPolling();
        return;
      }
      setStatus("reconnecting");
      const delay = BASE_BACKOFF_MS * Math.pow(2, retryCountRef.current - 1);
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      if (!didOpen) scheduleReconnect();
    };
    ws.onclose = () => {
      scheduleReconnect();
    };
  }, [processDownloads, startPolling]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      try { wsRef.current?.close(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [connect]);

  return {
    downloads,
    settings,
    status,
    lastMessageAt,
    setDownloads,
    setInspectingId,
    setOnTaskNotified,
    setOnInspectUpdate,
    forcePoll: pollOnce,
  };
}
