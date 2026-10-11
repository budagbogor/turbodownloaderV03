import { DownloadTask } from "./DownloadTask.js";
import fs from "fs";
import path from "path";
import { dbgReport } from "./task-types.js";
import {
  db,
  getAllTasks,
  upsertTask,
  deleteTaskPermanently,
  softDeleteTask,
  restoreTask,
  getTrashTasks,
  appendEventLog,
  getEventLogs,
  purgeOldTrash,
  getAllSettings,
  setSetting,
  getSetting,
  DEFAULT_SETTINGS,
  getActiveDownloadDir,
  TaskRow,
} from "./database.js";

export type { TaskRow, SettingsDefaults } from "./database.js";

class DownloadManager {
  private tasks: Map<string, DownloadTask> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private dirtyIds: Set<string> = new Set();

  constructor() {
    this.restoreFromDbAndFileSystem();
    purgeOldTrash(getSetting("trashRetentionDays") || 30);
  }

  private restoreFromDbAndFileSystem() {
    try {
      const rows = getAllTasks(false);
      const restoredFromDb: Set<string> = new Set();
      for (const row of rows) {
        try {
          const task = new DownloadTask(row.url, row.filename, row.num_connections);
          task.id = row.id;
          task.createdAt = row.created_at;
          task.totalSize = row.total_size;
          task.downloadedSize = row.downloaded_size;
          task.status = row.status === "downloading" || row.status === "merging" ? "paused" : row.status;
          task.speed = 0;
          task.error = row.error || undefined;
          task.isSocialMedia = row.is_social === 1;
          task.useYoutubeDlDirect = row.use_ytdl === 1;
          this.tasks.set(task.id, task);
          restoredFromDb.add(row.filename);
        } catch (e) {
          console.error(`Failed to restore DB task ${row.id}:`, e);
        }
      }

      const downloadDir = getActiveDownloadDir();
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      } else {
        const files = fs.readdirSync(downloadDir);
        for (const file of files) {
          if (file.startsWith(".")) continue;
          if (restoredFromDb.has(file)) {
            const existingTask = Array.from(this.tasks.values()).find((t) => t.filename === file);
            if (existingTask && existingTask.status !== "completed") {
              const filePath = path.join(downloadDir, file);
              try {
                const stat = fs.statSync(filePath);
                if (stat.isFile() && stat.size > 0) {
                  existingTask.status = "completed";
                  existingTask.totalSize = stat.size;
                  existingTask.downloadedSize = stat.size;
                  this.markDirty(existingTask.id);
                }
              } catch (_) {}
            }
            continue;
          }
          const filePath = path.join(downloadDir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isFile() && stat.size > 0) {
              const task = new DownloadTask("local://" + file, file, 8);
              task.status = "completed";
              task.totalSize = stat.size;
              task.downloadedSize = stat.size;
              task.createdAt = stat.mtimeMs;
              task.speed = 0;
              this.tasks.set(task.id, task);
              this.markDirty(task.id);
            }
          } catch (e) {}
        }
      }

      this.flushDirtyImmediately();
    } catch (e) {
      console.error("Failed to restore tasks:", e);
    }
  }

  private markDirty(id: string) {
    this.dirtyIds.add(id);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.flushDirtyImmediately();
    }, 5000);
  }

  private flushDirtyImmediately() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    try {
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          const t = this.tasks.get(id);
          if (!t) continue;
          const json: any = t.toJSON();
          json.isSocialMedia = t.isSocialMedia;
          json.useYoutubeDlDirect = t.useYoutubeDlDirect;
          upsertTask(json);
        }
      });
      if (this.dirtyIds.size > 0) {
        tx(Array.from(this.dirtyIds));
      }
    } catch (e) {
      console.error("Flush dirty failed:", e);
    }
    this.dirtyIds.clear();
  }

  async addDownload(url: string, filename?: string, connections?: number, autoCompress?: boolean): Promise<any> {
    const maxConcurrent = getSetting("maxConcurrentDownloads") || DEFAULT_SETTINGS.maxConcurrentDownloads;
    const activeCount = Array.from(this.tasks.values()).filter(
      (t) => t.status === "downloading" || t.status === "merging"
    ).length;

    const task = new DownloadTask(url, filename, connections);
    if (autoCompress) task.autoCompress = true;
    await task.initialize();
    this.tasks.set(task.id, task);

    // #region debug-point C:add-download-created
    dbgReport(
      "C",
      "DownloadManager.ts:addDownload:after-initialize",
      "[DEBUG] addDownload created task",
      {
        taskId: task.id,
        status: task.status,
        filename: task.filename,
        useYoutubeDlDirect: task.useYoutubeDlDirect ? 1 : 0,
        totalSize: task.totalSize,
        activeCount,
        maxConcurrent,
      },
      "youtube-audio-stuck"
    );
    // #endregion

    this.markDirty(task.id);
    this.flushDirtyImmediately();

    appendEventLog({
      taskId: task.id,
      eventType: "task_created",
      message: `Task created: ${task.filename}`,
      metadata: { url, filename: task.filename, numConnections: task.numConnections },
    });

    if (activeCount >= maxConcurrent) {
      task.status = "pending";
      // #region debug-point C:add-download-queued
      dbgReport(
        "C",
        "DownloadManager.ts:addDownload:queued",
        "[DEBUG] task queued because max concurrent reached",
        {
          taskId: task.id,
          activeCount,
          maxConcurrent,
          pendingCount: Array.from(this.tasks.values()).filter((t) => t.status === "pending").length,
        },
        "youtube-audio-stuck"
      );
      // #endregion
      appendEventLog({ taskId: task.id, eventType: "queued", message: `Queued (max ${maxConcurrent} running)` });
    } else {
      task.start();
    }

    this.markDirty(task.id);
    this.flushDirtyImmediately();
    return task.toJSON();
  }

  pauseDownload(id: string) {
    const task = this.tasks.get(id);
    if (task) {
      task.pause();
      appendEventLog({ taskId: id, eventType: "paused", message: "Download paused by user" });
      this.markDirty(id);
    }
  }

  resumeDownload(id: string) {
    const task = this.tasks.get(id);
    if (task) {
      task.resume();
      appendEventLog({ taskId: id, eventType: "resumed", message: "Download resumed" });
      this.markDirty(id);
      this.processQueue();
    }
  }

  pauseAll() {
    for (const task of this.tasks.values()) {
      if (task.status === "downloading") {
        task.pause();
        appendEventLog({ taskId: task.id, eventType: "paused", message: "Batch pause" });
        this.markDirty(task.id);
      }
    }
  }

  resumeAll() {
    for (const task of this.tasks.values()) {
      if (task.status === "paused" || task.status === "error") {
        task.resume();
        appendEventLog({ taskId: task.id, eventType: "resumed", message: "Batch resume" });
        this.markDirty(task.id);
      }
    }
    this.processQueue();
  }

  processQueue() {
    const maxConcurrent = getSetting("maxConcurrentDownloads") || DEFAULT_SETTINGS.maxConcurrentDownloads;
    const active = Array.from(this.tasks.values()).filter(
      (t) => t.status === "downloading" || t.status === "merging"
    );
    // #region debug-point H5:processQueue-entry
    dbgReport("H5", "DownloadManager.ts:processQueue:197", "[DEBUG] H5 processQueue called", { maxConcurrent, activeCount: active.length, activeIds: active.slice(0, 10).map((t: any) => t.id), pendingStatusCount: Array.from(this.tasks.values()).filter((t: any) => t.status === "pending").length, totalTasks: this.tasks.size });
    // #endregion
    if (active.length >= maxConcurrent) return;

    const pending = Array.from(this.tasks.values())
      .filter((t) => t.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt);

    const slots = maxConcurrent - active.length;
    for (let i = 0; i < slots && i < pending.length; i++) {
      const t = pending[i];
      appendEventLog({ taskId: t.id, eventType: "dequeued", message: "Started from queue" });
      t.start();
      // #region debug-point C:process-queue-dequeued
      dbgReport(
        "C",
        "DownloadManager.ts:processQueue:dequeued",
        "[DEBUG] pending task started from queue",
        {
          taskId: t.id,
          slots,
          maxConcurrent,
          activeCount: active.length,
          pendingCountBefore: pending.length,
          statusAfterStart: t.status,
        },
        "youtube-audio-stuck"
      );
      // #endregion
      // #region debug-point H5:processQueue-start
      dbgReport("H5", "DownloadManager.ts:processQueue:212", "[DEBUG] H5 processQueue dequeue start() called", { taskId: t.id, statusAfterStart: t.status, useYoutubeDlDirect: (t as any).useYoutubeDlDirect });
      // #endregion
      this.markDirty(t.id);
    }
  }

  clearCompleted() {
    const completedIds: string[] = [];
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === "completed") {
        completedIds.push(id);
        appendEventLog({ taskId: id, eventType: "cleared", message: "Task cleared from list" });
      }
    }
    for (const id of completedIds) {
      this.tasks.delete(id);
      deleteTaskPermanently(id);
    }
    return completedIds;
  }

  getStats() {
    let totalSpeed = 0;
    let activeCount = 0;
    let completedCount = 0;
    let pausedCount = 0;
    let queuedCount = 0;
    let errorCount = 0;

    for (const task of this.tasks.values()) {
      if (task.status === "downloading") {
        activeCount++;
        totalSpeed += task.speed;
      } else if (task.status === "merging") {
        activeCount++;
      } else if (task.status === "completed") {
        completedCount++;
      } else if (task.status === "paused") {
        pausedCount++;
      } else if (task.status === "pending") {
        queuedCount++;
      } else if (task.status === "error") {
        errorCount++;
      }
    }

    return {
      totalTasks: this.tasks.size,
      activeCount,
      completedCount,
      pausedCount,
      queuedCount,
      errorCount,
      totalSpeed,
    };
  }

  removeDownload(id: string) {
    const task = this.tasks.get(id);
    if (task) {
      task.cancel();
      appendEventLog({ taskId: id, eventType: "soft_deleted", message: "Moved to trash" });
      this.tasks.delete(id);
      softDeleteTask(id);

      const filePath = path.join(getActiveDownloadDir(), task.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error("Failed to delete output file:", err);
        }
      }
      this.processQueue();
    }
  }

  getTrash() {
    return getTrashTasks();
  }

  restoreFromTrash(id: string) {
    restoreTask(id);
    const row = getAllTasks(true).find((r) => r.id === id);
    if (row) {
      try {
        const task = new DownloadTask(row.url, row.filename, row.num_connections);
        task.id = row.id;
        task.createdAt = row.created_at;
        task.totalSize = row.total_size;
        task.downloadedSize = row.downloaded_size;
        task.status = "paused";
        task.speed = 0;
        task.error = row.error || undefined;
        task.isSocialMedia = row.is_social === 1;
        task.useYoutubeDlDirect = row.use_ytdl === 1;
        this.tasks.set(task.id, task);
        appendEventLog({ taskId: id, eventType: "restored", message: "Restored from trash" });
      } catch (e) {
        console.error("Restore task failed:", e);
      }
    }
  }

  foreverDeleteFromTrash(id: string) {
    deleteTaskPermanently(id);
  }

  getTask(id: string): DownloadTask | undefined {
    return this.tasks.get(id);
  }

  getTaskLogs(id: string, limit = 300) {
    return getEventLogs(id, limit);
  }

  getAll() {
    this.flushDirtyImmediately();
    return Array.from(this.tasks.values()).map((task) => task.toJSON());
  }

  getSettings() {
    return getAllSettings();
  }

  updateSetting(key: any, value: any) {
    setSetting(key, value);
    appendEventLog({ eventType: "settings_updated", message: `${key} = ${JSON.stringify(value)}` });
  }
}

export const downloadManager = new DownloadManager();
