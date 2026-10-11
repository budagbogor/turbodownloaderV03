import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { DownloadStatus, DownloadTaskJson } from "./task-types.js";

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

let DB_DIR: string;
let DB_PATH: string;

if (process.env.SQLITE_PATH) {
  DB_PATH = path.resolve(process.env.SQLITE_PATH);
  DB_DIR = path.dirname(DB_PATH);
} else if (IS_VERCEL) {
  DB_DIR = "/tmp/turbodownloader-db";
  DB_PATH = path.join(DB_DIR, "turbodownloader.ephemeral.sqlite");
} else {
  DB_DIR = path.join(process.cwd(), "data");
  DB_PATH = path.join(DB_DIR, "turbodownloader.db");
}

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  if (IS_VERCEL) try { fs.chmodSync(DB_DIR, 0o755); } catch {}
}

export { DB_DIR, DB_PATH, IS_VERCEL as DB_ON_VERCEL_EPHEMERAL };

export const db = new Database(DB_PATH);
try {
  db.pragma("journal_mode = WAL");
} catch (e) {
  console.warn("[database.ts] WAL pragma failed (ephemeral fs?), falling back to DELETE journal:", (e as Error).message);
  try { db.pragma("journal_mode = DELETE"); } catch {}
}
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  total_size INTEGER DEFAULT 0,
  downloaded_size INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  speed INTEGER DEFAULT 0,
  error TEXT,
  progress REAL DEFAULT 0,
  eta INTEGER,
  category TEXT DEFAULT 'other',
  num_connections INTEGER DEFAULT 8,
  created_at INTEGER NOT NULL,
  is_social INTEGER DEFAULT 0,
  use_ytdl INTEGER DEFAULT 0,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_log_task_id ON event_log(task_id);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at ON event_log(created_at);
`);

export interface TaskRow {
  id: string;
  url: string;
  filename: string;
  total_size: number;
  downloaded_size: number;
  status: DownloadStatus;
  speed: number;
  error: string | null;
  progress: number;
  eta: number | null;
  category: string;
  num_connections: number;
  created_at: number;
  is_social: number;
  use_ytdl: number;
  deleted_at: number | null;
}

export interface SettingsDefaults {
  maxConcurrentDownloads: number;
  maxBandwidthKbps: number;
  defaultConnections: number;
  defaultDownloadDir: string;
  defaultVideoQuality: string;
  youtubeCookiePath: string;
  instagramCookieHeader: string;
  theme: string;
  notificationsEnabled: number;
  autoMergeSegments: number;
  autoOptimizeMp4: number;
  trashRetentionDays: number;
  enableBrowserNotifications: number;
}

export const DEFAULT_SETTINGS: SettingsDefaults = {
  maxConcurrentDownloads: 3,
  maxBandwidthKbps: 0,
  defaultConnections: 8,
  defaultDownloadDir: "./downloads",
  defaultVideoQuality: "best",
  youtubeCookiePath: "",
  instagramCookieHeader: "",
  theme: "system",
  notificationsEnabled: 1,
  autoMergeSegments: 1,
  autoOptimizeMp4: 1,
  trashRetentionDays: 30,
  enableBrowserNotifications: 1,
};

export function upsertTask(task: DownloadTaskJson & { isSocialMedia?: boolean; useYoutubeDlDirect?: boolean }) {
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, url, filename, total_size, downloaded_size, status, speed, error,
      progress, eta, category, num_connections, created_at, is_social, use_ytdl
    ) VALUES (
      @id, @url, @filename, @totalSize, @downloadedSize, @status, @speed, @error,
      @progress, @eta, @category, @numConnections, @createdAt, @isSocial, @useYtdl
    )
    ON CONFLICT(id) DO UPDATE SET
      url = excluded.url,
      filename = excluded.filename,
      total_size = excluded.total_size,
      downloaded_size = excluded.downloaded_size,
      status = excluded.status,
      speed = excluded.speed,
      error = excluded.error,
      progress = excluded.progress,
      eta = excluded.eta,
      category = excluded.category,
      num_connections = excluded.num_connections
  `);
  stmt.run({
    id: task.id,
    url: task.url,
    filename: task.filename,
    totalSize: task.totalSize,
    downloadedSize: task.downloadedSize,
    status: task.status,
    speed: task.speed,
    error: task.error ?? null,
    progress: task.progress,
    eta: task.eta,
    category: task.category,
    numConnections: task.numConnections,
    createdAt: task.createdAt,
    isSocial: (task as any).isSocialMedia ? 1 : 0,
    useYtdl: (task as any).useYoutubeDlDirect ? 1 : 0,
  });
}

export function deleteTaskPermanently(id: string) {
  const stmt = db.prepare("DELETE FROM tasks WHERE id = ?");
  stmt.run(id);
}

export function softDeleteTask(id: string) {
  const stmt = db.prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?");
  stmt.run(Date.now(), id);
}

export function restoreTask(id: string) {
  const stmt = db.prepare("UPDATE tasks SET deleted_at = NULL WHERE id = ?");
  stmt.run(id);
}

export function getAllTasks(includeDeleted = false): TaskRow[] {
  const stmt = includeDeleted
    ? db.prepare("SELECT * FROM tasks ORDER BY created_at DESC")
    : db.prepare("SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY created_at DESC");
  return stmt.all() as TaskRow[];
}

export function getTrashTasks(): TaskRow[] {
  const stmt = db.prepare("SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC");
  return stmt.all() as TaskRow[];
}

export function getSetting<T extends keyof SettingsDefaults>(key: T): SettingsDefaults[T] {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key as string) as { value: string } | undefined;
  if (!row) return DEFAULT_SETTINGS[key];
  const val = JSON.parse(row.value);
  return val as SettingsDefaults[T];
}

export function getAllSettings(): SettingsDefaults {
  const out: any = { ...DEFAULT_SETTINGS };
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  for (const row of rows) {
    try { out[row.key] = JSON.parse(row.value); } catch {}
  }
  return out as SettingsDefaults;
}

export function setSetting<T extends keyof SettingsDefaults>(key: T, value: SettingsDefaults[T]) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  stmt.run(key as string, JSON.stringify(value), Date.now());
}

export function appendEventLog(opts: { taskId?: string; eventType: string; message?: string; metadata?: any }) {
  const stmt = db.prepare(`
    INSERT INTO event_log (task_id, event_type, message, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    opts.taskId || null,
    opts.eventType,
    opts.message || null,
    opts.metadata ? JSON.stringify(opts.metadata) : null,
    Date.now()
  );
}

export function getEventLogs(taskId: string, limit = 300) {
  const stmt = db.prepare(`
    SELECT * FROM event_log WHERE task_id = ? ORDER BY created_at DESC LIMIT ?
  `);
  return stmt.all(taskId, limit);
}

export function purgeOldTrash(days = 30) {
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  const stmt = db.prepare("DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?");
  const info = stmt.run(threshold);
  return info.changes;
}

export function exportAllJson(): string {
  const tasks = getAllTasks(true);
  const settings = getAllSettings();
  return JSON.stringify({ tasks, settings, exportedAt: Date.now() }, null, 2);
}

export function vacuumAndWipeAll() {
  db.exec("DELETE FROM event_log; DELETE FROM tasks; DELETE FROM settings; VACUUM;");
}

export function getActiveDownloadDir(): string {
  try {
    const custom = getSetting("defaultDownloadDir");
    if (custom && typeof custom === "string" && custom.trim()) {
      return path.resolve(custom.trim());
    }
  } catch {}
  if (process.env.DOWNLOAD_DIR) {
    return path.resolve(process.env.DOWNLOAD_DIR);
  }
  return path.join(process.cwd(), "downloads");
}
