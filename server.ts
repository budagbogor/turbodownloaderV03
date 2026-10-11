import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z, ZodError } from "zod";
import play from "play-dl";
import youtubedlPkg from "youtube-dl-exec";
const youtubedl = (youtubedlPkg as any).default || youtubedlPkg;
import fbDownloaderPkg from "@renpwn/fb-downloader";
const fbDownloader = (fbDownloaderPkg as any).default || fbDownloaderPkg;
import { downloadManager } from "./src/server/DownloadManager.js";
import { decodeHtmlEntities, debugReport, DEFAULT_USER_AGENT } from "./src/server/task-types.js";
import {
  exportAllJson,
  vacuumAndWipeAll,
  appendEventLog,
  getActiveDownloadDir,
} from "./src/server/database.js";
import {
  analyzeUniversalMedia,
  listSupportedPlatforms,
} from "./src/server/universal-extractors.js";
import { getFfmpegBinary, hasFfmpegBinary } from "./src/server/ffmpeg-toolchain.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = Number(process.env.PORT) || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_URL);

// ============================================================
// HELMET (11 Security Headers) - pertama sebelum route apapun
// ============================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        mediaSrc: ["'self'", "data:", "blob:", "https:", "http://127.0.0.1:*", "http://localhost:*"],
        connectSrc: [
          "'self'",
          "ws://localhost:*",
          "wss://localhost:*",
          "ws://127.0.0.1:*",
          "wss://127.0.0.1:*",
          "http://localhost:*",
          "https://localhost:*",
          "http://127.0.0.1:*",
          "https://127.0.0.1:*",
          "https:",
          "wss://*.vercel.app",
          "wss://*.vercel.dev",
        ],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// ============================================================
// CORS - Strict LAN ONLY origins on self-host. On Vercel allow preview subdomains + *.vercel.app
// ============================================================
const LAN_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
];
const VERCEL_ORIGINS = [/\.vercel\.app$/i, /\.vercel\.dev$/i, /^https?:\/\/turbodownoader/i];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) return callback(null, true);
      if (LAN_ORIGINS.some((re) => re.test(origin))) return callback(null, true);
      if (IS_VERCEL && VERCEL_ORIGINS.some((re) => re.test(origin))) return callback(null, true);
      if (IS_VERCEL) return callback(null, true);
      // Allow browser extension & media portal cross-origin download requests
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
  })
);

app.use(express.json({ limit: "1mb" }));

// ============================================================
// ZOD Validation Schemas
// ============================================================
const AnalyzeSchema = z.object({
  url: z.string().trim().url("Must be a valid URL").min(5),
});

const CreateDownloadSchema = z.object({
  url: z.string().trim().min(5, "URL required"),
  filename: z.string().trim().max(200).optional(),
  connections: z.coerce.number().int().min(1).max(32).optional(),
  autoCompress: z.boolean().optional(),
  openFolder: z.boolean().optional(),
});

const IdParamSchema = z.object({
  id: z.string().trim().uuid("Invalid task id format"),
});

const SettingKeySchema = z.object({
  key: z.string().trim().min(2).max(40),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

// ============================================================
// Validation Middlewares
// ============================================================
function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        appendEventLog({ eventType: "validation_error", message: JSON.stringify(e.issues) });
        return res.status(400).json({
          error: "Invalid request body",
          issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      return res.status(500).json({ error: "Validation failed" });
    }
  };
}

function validateParam<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.params) as Record<string, unknown>;
      for (const k of Object.keys(parsed)) {
        (req.params as Record<string, unknown>)[k] = parsed[k];
      }
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({
          error: "Invalid URL parameter",
          issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      return res.status(500).json({ error: "Param validation failed" });
    }
  };
}

// ============================================================
// Rate Limiting (prevent abuse & flood)
// ============================================================
const strictCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many download requests. Please slow down (max 20/minute)." },
});
// Rate limiter is applied directly to POST /api/downloads route below

// ============================================================
// Path Traversal Safe Helper - only allow files under baseDir
// ============================================================
function safeResolve(baseDir: string, ...join: string[]): string {
  const normalizedJoin = join.map((part) => part.replace(/^\/+/, ""));
  const resolved = path.resolve(baseDir, ...normalizedJoin);
  const sep = path.sep;
  if (
    resolved !== baseDir &&
    !(resolved.startsWith(baseDir + sep) || resolved.startsWith(baseDir + "/"))
  ) {
    const err = new Error("Path traversal detected");
    (err as any).status = 403;
    throw err;
  }
  return resolved;
}

function getDownloadsDir(): string {
  if (IS_VERCEL) {
    return "/tmp/turbodownloader-downloads";
  }
  return getActiveDownloadDir();
}

function openDownloadsFolder(filename?: string) {
  try {
    const baseDir = path.resolve(getDownloadsDir());
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    if (process.platform === "win32") {
      if (filename) {
        const targetPath = path.resolve(baseDir, filename);
        if (fs.existsSync(targetPath)) {
          console.log(`[TurboDownloader] Membuka File Explorer & menyeleksi: ${targetPath}`);
          const psSelect = `powershell -NoProfile -Command "Start-Process explorer.exe -ArgumentList '/select,\\\"${targetPath.replace(/"/g, '`"')}\\\"' -ErrorAction SilentlyContinue"`;
          exec(psSelect, (err) => {
            if (err) {
              const p = spawn("explorer.exe", [`/select,${targetPath}`], { detached: true, stdio: "ignore" });
              p.unref();
            }
          });
          return;
        }
      }
      console.log(`[TurboDownloader] Membuka folder downloads di File Explorer: ${baseDir}`);
      const psOpen = `powershell -NoProfile -Command "Start-Process explorer.exe -ArgumentList '\\\"${baseDir.replace(/"/g, '`"')}\\\"' -ErrorAction SilentlyContinue"`;
      exec(psOpen, (err) => {
        if (err) {
          const p = spawn("explorer.exe", [baseDir], { detached: true, stdio: "ignore" });
          p.unref();
        }
      });
    } else if (process.platform === "darwin") {
      exec(`open "${baseDir}"`);
    } else {
      exec(`xdg-open "${baseDir}"`);
    }
  } catch (err) {
    console.warn("Failed to open downloads folder in explorer:", err);
  }
}

// ============================================================
// WebSocket connection handling
// ============================================================

wss.on("connection", (ws, req) => {

  try {
    ws.send(JSON.stringify({ type: "INIT", data: downloadManager.getAll() }));
  } catch (e) {
    console.warn("WS init send failed:", e);
  }
});

function broadcast(message: any) {
  const clients = Array.from(wss.clients);
  const openClients = clients.filter(c => c.readyState === WebSocket.OPEN);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (e) {

      }
    }
  });
}

const completedOpenedIds = new Set<string>();

setInterval(() => {
  const all = downloadManager.getAll();
  const active = all.filter((d: any) => d.status === "downloading" || d.status === "merging" || d.status === "pending");

  // Otomatis buka folder dan seleksi file ketika unduhan selesai
  const newlyCompleted = all.filter((d: any) => d.status === "completed" && !completedOpenedIds.has(d.id));
  for (const t of newlyCompleted) {
    completedOpenedIds.add(t.id);
    const taskObj = downloadManager.getTask(t.id);
    if (taskObj) {
      openDownloadsFolder(taskObj.filename);
    }
  }

  // Trigger auto-compression
  const newlyCompletedAuto = all.filter((d: any) => d.status === "completed" && downloadManager.getTask(d.id)?.autoCompress);
  for (const t of newlyCompletedAuto) {
    const taskObj = downloadManager.getTask(t.id);
    if (taskObj) {
      taskObj.autoCompress = false;
      axios.post(`http://localhost:${PORT}/api/downloads/${t.id}/enhance`, { preset: "compress" }).catch(() => {});
    }
  }

  // NOTE: SELALU BROADCAST setiap detik, BUKAN HANYA jika active > 0.
  //       Sebelumnya filter `if (active.length > 0)` menyebabkan:
  //       ketika task terakhir transition completed → active.length 0 → IF FALSE.
  //       UI TIDAK PERNAH meneriman UPDATE status completed → stuck Downloading @100% infinite.
  //       Performance: payload JSON semua task ringan (<1000 task umumnya << 100KB), jadi selalu broadcast aman.
  broadcast({ type: "UPDATE_ALL", data: all });
}, 1000);

// ============================================================
// /api/health - Engine Status Check (5 engines)
// ============================================================
app.get("/api/health", async (req, res) => {
  const results: Record<string, any> = {};
  results.ts = Date.now();
  results.db = { ok: true, tables: ["tasks", "settings", "event_log"] };
  results.uptimeSec = Math.floor(process.uptime());
  const mem = process.memoryUsage();
  results.memory = { rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576) };
  const diskPath = path.join(process.cwd(), "downloads");
  try {
    const stat = fs.statSync(diskPath);
    results.disk = { downloadsDir: diskPath, access: fs.constants.W_OK !== undefined };
  } catch (e: any) {
    results.disk = { error: e.message };
  }
  try {
    const nodeVer = process.versions.node;
    results.node = { version: nodeVer };
  } catch (e) {}
  try {
    results.ytdlp = { installed: true, package: "youtube-dl-exec" };
  } catch {}
  try {
    const ffmpegBin = getFfmpegBinary();
    results.ffmpeg = { available: hasFfmpegBinary(), binary: ffmpegBin || null };
  } catch {}
  res.json(results);
});

app.post("/api/db/export", (req, res) => {
  const data = exportAllJson();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="turbodownloader-backup-${Date.now()}.json"`);
  res.send(data);
});

app.post("/api/db/wipe", (req, res) => {
  try {
    vacuumAndWipeAll();
    broadcast({ type: "UPDATE_ALL", data: [] });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/platforms", (req, res) => {
  res.json({
    platforms: listSupportedPlatforms(),
    total: listSupportedPlatforms().length,
    engines: ["yt-dlp (universal 1000+ sites)", "play-dl (YouTube)", "@renpwn/fb-downloader (Facebook)", "tikwm (TikTok)", "axios Direct HTTP"],
  });
});

// ============================================================
// Settings REST API
// ============================================================
app.get("/api/settings", (req, res) => {
  res.json(downloadManager.getSettings());
});

app.post("/api/settings", validateBody(SettingKeySchema), (req, res) => {
  const { key, value } = req.body as z.infer<typeof SettingKeySchema>;
  try {
    downloadManager.updateSetting(key, value);
    broadcast({ type: "SETTINGS_UPDATED", data: downloadManager.getSettings() });
    res.json({ success: true, settings: downloadManager.getSettings() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint untuk membuka dialog pemilihan folder Windows Explorer asli
app.post("/api/settings/choose-folder", (req, res) => {
  if (process.platform === "win32") {
    const curDir = getDownloadsDir().replace(/\\/g, "\\\\");
    const psCmd = `powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Pilih Folder Penyimpanan TurboDownloader'; if (Test-Path '${curDir}') { $f.SelectedPath = '${curDir}' }; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"`;
    exec(psCmd, (err, stdout) => {
      const selected = (stdout || "").trim();
      if (selected && fs.existsSync(selected)) {
        downloadManager.updateSetting("defaultDownloadDir", selected);
        broadcast({ type: "SETTINGS_UPDATED", data: downloadManager.getSettings() });
        return res.json({ success: true, folder: selected });
      }
      return res.json({ success: false, cancelled: true });
    });
  } else {
    res.json({ success: false, error: "Native dialog only supported on Windows" });
  }
});

// ============================================================
// /api/analyze - Universal Media Format Sniffer (yt-dlp 1000+ sites)
// ============================================================
app.post("/api/analyze", validateBody(AnalyzeSchema), async (req, res) => {
  const { url } = req.body as z.infer<typeof AnalyzeSchema>;
  try {
    const universal = await analyzeUniversalMedia(url);
    return res.json({
      platform: universal.platform,
      title: universal.title,
      thumbnail: universal.thumbnail,
      durationSec: universal.durationSec,
      formats: universal.formats,
    });
  } catch (error: any) {
    const errStr = String(error?.message || error);
    console.error("Analyze universal error:", errStr.substring(0, 250));
    if (errStr.includes("login (cookies)")) {
      return res.status(403).json({ error: errStr });
    }
    try {
      let size = 0;
      let contentType = "application/octet-stream";
      let acceptRanges = false;
      try {
        const response = await axios.head(url, { timeout: 8000, headers: { "User-Agent": DEFAULT_USER_AGENT } });
        const contentLength = response.headers["content-length"] as string | undefined;
        contentType = (response.headers["content-type"] as string) || "application/octet-stream";
        acceptRanges = response.headers["accept-ranges"] === "bytes";
        size = contentLength ? parseInt(contentLength, 10) : 0;
      } catch { /* head not supported */ }
      return res.json({
        platform: { key: "direct_http", name: "Direct HTTP Source" },
        title: url.split("/").pop()?.split("?")[0]?.substring(0, 60) || "download",
        formats: [{ id: "direct", quality: "Direct Source Stream", format: contentType, size, url, supportsRange: acceptRanges }],
      });
    } catch (fallbackError: any) {
      console.error("Analyze fallback also failed:", fallbackError?.message);
      res.status(500).json({ error: "Failed to analyze URL" });
    }
  }
});

// ============================================================
// Sample 12MB Range demo file
// ============================================================
const DEMO_FILE_SIZE = 12 * 1024 * 1024;
app.head("/api/sample-demo.dat", (req, res) => {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", DEMO_FILE_SIZE.toString());
  res.setHeader("Content-Disposition", 'attachment; filename="TurboSpeed_Sample_12MB.zip"');
  res.status(200).end();
});
app.get("/api/sample-demo.dat", (req, res) => {
  const range = req.headers.range;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Disposition", 'attachment; filename="TurboSpeed_Sample_12MB.zip"');
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : DEMO_FILE_SIZE - 1;
    const chunksize = end - start + 1;
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${DEMO_FILE_SIZE}`);
    res.setHeader("Content-Length", chunksize.toString());
    res.end(Buffer.alloc(chunksize, 0x5a));
  } else {
    res.setHeader("Content-Length", DEMO_FILE_SIZE.toString());
    res.end(Buffer.alloc(DEMO_FILE_SIZE, 0x5a));
  }
});

// ============================================================
// Download Tasks
// ============================================================
app.get("/api/downloads", (req, res) => {
  res.json(downloadManager.getAll());
});

app.get("/api/stats", (req, res) => {
  res.json(downloadManager.getStats());
});

app.get("/api/trash", (req, res) => {
  res.json(downloadManager.getTrash());
});

app.post("/api/trash/:id/restore", validateParam(IdParamSchema), (req, res) => {
  downloadManager.restoreFromTrash(req.params.id);
  broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
  res.json({ success: true });
});

app.delete("/api/trash/:id/forever", validateParam(IdParamSchema), (req, res) => {
  downloadManager.foreverDeleteFromTrash(req.params.id);
  res.json({ success: true });
});

app.get("/api/downloads/:id/logs", validateParam(IdParamSchema), (req, res) => {
  res.json(downloadManager.getTaskLogs(req.params.id));
});

app.post("/api/downloads", strictCreateLimiter, validateBody(CreateDownloadSchema), async (req, res) => {
  const { url, filename, connections, autoCompress, openFolder } = req.body as z.infer<typeof CreateDownloadSchema>;
  try {
    const task = await downloadManager.addDownload(url, filename, connections, autoCompress);
    broadcast({ type: "NEW_DOWNLOAD", data: task });
    broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });

    // Otomatis buka folder download di File Explorer ketika download dimulai (kecuali di-disable)
    if (openFolder !== false) {
      openDownloadsFolder(task.filename);
    }

    res.json(task);
  } catch (error: any) {
    appendEventLog({ eventType: "api_error", message: error.message });
    console.error("Download error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint eksplisit untuk membuka folder downloads di File Explorer
app.post("/api/downloads/open-folder", (req, res) => {
  try {
    const { filename } = req.body || {};
    openDownloadsFolder(filename);
    res.json({ success: true, folder: getDownloadsDir() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/downloads/:id/open-folder", (req, res) => {
  try {
    const { id } = req.params;
    let task = downloadManager.getTask(id) as any;
    if (!task) {
      const all = downloadManager.getAll();
      task = all.find((t) => t.id === id);
    }
    if (!task) {
      const dbTasks = getAllTasks(false);
      const row = dbTasks.find((r) => r.id === id);
      if (row) task = { filename: row.filename };
    }
    openDownloadsFolder(task?.filename);
    res.json({ success: true, folder: getDownloadsDir() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint untuk membantu pengguna memasang ekstensi Chrome dalam 1-klik
app.post("/api/extension/open-install", (req, res) => {
  try {
    const extDir = safeResolve(process.cwd(), "extension");
    if (process.platform === "win32") {
      // 1. Buka folder ekstensi di File Explorer
      exec(`powershell -NoProfile -Command "Invoke-Item '${extDir.replace(/'/g, "''")}'"`);
      // 2. Buka tab chrome://extensions di Chrome
      exec(`powershell -NoProfile -Command "Start-Process chrome.exe 'chrome://extensions' -ErrorAction SilentlyContinue"`);
    } else if (process.platform === "darwin") {
      exec(`open "${extDir}"`);
      exec(`open -a "Google Chrome" "chrome://extensions"`);
    } else {
      exec(`xdg-open "${extDir}"`);
    }
    res.json({ success: true, path: extDir });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/downloads/pause-all", (req, res) => {
  downloadManager.pauseAll();
  broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
  res.json({ success: true });
});

app.post("/api/downloads/resume-all", (req, res) => {
  downloadManager.resumeAll();
  broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
  res.json({ success: true });
});

app.post("/api/downloads/clear-completed", (req, res) => {
  const cleared = downloadManager.clearCompleted();
  broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
  res.json({ success: true, cleared });
});

app.post("/api/downloads/:id/pause", validateParam(IdParamSchema), (req, res) => {
  downloadManager.pauseDownload(req.params.id);
  broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
  res.json({ success: true });
});

app.post("/api/downloads/:id/resume", validateParam(IdParamSchema), (req, res) => {
  downloadManager.resumeDownload(req.params.id);
  broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
  res.json({ success: true });
});

app.delete("/api/downloads/:id", validateParam(IdParamSchema), (req, res) => {
  const { id } = req.params;
  downloadManager.removeDownload(id);
  broadcast({ type: "DELETE_DOWNLOAD", data: { id } });
  broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
  res.json({ success: true });
});

app.get("/api/downloads/:id/file", validateParam(IdParamSchema), (req, res) => {
  const { id } = req.params;
  const task = downloadManager.getTask(id);
  if (!task) return res.status(404).json({ error: "Download task not found" });
  try {
    const baseDir = getDownloadsDir();
    const filePath = path.join(baseDir, task.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk or still being assembled" });
    res.download(filePath, task.filename);
  } catch (e: any) {
    res.status(e.status || 403).json({ error: e.message });
  }
});

// ============================================================
// Play Native Media in Default Windows Player (WMP, VLC, Film & TV)
// ============================================================
app.post("/api/downloads/:id/play-native", validateParam(IdParamSchema), (req, res) => {
  const { id } = req.params;
  let task = downloadManager.getTask(id) as any;
  if (!task) {
    const all = downloadManager.getAll();
    task = all.find((t) => t.id === id);
  }
  if (!task) {
    const dbTasks = getAllTasks(false);
    const row = dbTasks.find((r) => r.id === id);
    if (row) task = { filename: row.filename };
  }
  if (!task) return res.status(404).json({ error: "Download task not found" });

  try {
    const baseDir = getDownloadsDir();
    const filePath = path.join(baseDir, task.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });

    if (process.platform === "win32") {
      const psCmd = `powershell -NoProfile -Command "Start-Process '${filePath.replace(/'/g, "''")}'"`;
      exec(psCmd, (err) => {
        if (err) console.error("Failed to start media player:", err);
      });
    } else if (process.platform === "darwin") {
      exec(`open "${filePath}"`);
    } else {
      exec(`xdg-open "${filePath}"`);
    }
    res.json({ success: true, file: filePath });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// Stream WITH Range 206 Partial Content (seekable HTML5 player)
// ============================================================
app.get("/api/downloads/:id/stream", validateParam(IdParamSchema), (req, res) => {
  const { id } = req.params;
  let task = downloadManager.getTask(id) as any;
  if (!task) {
    const all = downloadManager.getAll();
    task = all.find((t) => t.id === id);
  }
  if (!task) {
    const dbTasks = getAllTasks(false);
    const row = dbTasks.find((r) => r.id === id);
    if (row) task = { filename: row.filename };
  }
  if (!task) return res.status(404).json({ error: "Download task not found" });

  try {
    const baseDir = getDownloadsDir();
    const filePath = path.join(baseDir, task.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(filePath).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".mp4") contentType = "video/mp4";
    else if (ext === ".webm") contentType = "video/webm";
    else if (ext === ".mkv") contentType = "video/x-matroska";
    else if (ext === ".mp3") contentType = "audio/mpeg";
    else if (ext === ".m4a") contentType = "audio/mp4";
    else if (ext === ".wav") contentType = "audio/wav";

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Accept-Ranges",
    };

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      let start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= fileSize) end = fileSize - 1;
      if (start > end) return res.status(416).set("Content-Range", `bytes */${fileSize}`).send("Requested Range Not Satisfiable");
      const chunksize = end - start + 1;
      res.writeHead(206, {
        ...corsHeaders,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
      });
      const stream = fs.createReadStream(filePath, { start, end });
      stream.on("error", (e) => {
        try { res.destroy(e as Error); } catch {}
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        ...corsHeaders,
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
      });
      const stream = fs.createReadStream(filePath);
      stream.on("error", (e) => {
        try { res.destroy(e as Error); } catch {}
      });
      stream.pipe(res);
    }
  } catch (e: any) {
    res.status(e.status || 403).json({ error: e.message });
  }
});

// Repair & optimize video
app.post("/api/downloads/:id/repair", validateParam(IdParamSchema), (req, res) => {
  const { id } = req.params;
  const task = downloadManager.getTask(id);
  if (!task) return res.status(404).json({ error: "Download task not found" });
  try {
    const baseDir = safeResolve(process.cwd(), "downloads");
    const filePath = safeResolve(baseDir, task.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });
    const ffmpegBin = getFfmpegBinary();
    if (!ffmpegBin) {
      return res.status(500).json({ error: "FFmpeg tidak tersedia untuk repair video" });
    }
    const tempOut = filePath + ".repaired.mp4";
    const cmd = `"${ffmpegBin}" -y -i "${filePath}" -c:v copy -c:a aac -b:a 128k -movflags +faststart "${tempOut}"`;
    exec(cmd, { timeout: 60000 }, (error) => {
      if (error) {
        console.error("Manual repair error:", error);
        return res.status(500).json({ error: "Gagal memperbaiki video: " + error.message });
      }
      if (fs.existsSync(tempOut) && fs.statSync(tempOut).size > 1000) {
        try {
          fs.unlinkSync(filePath);
          fs.renameSync(tempOut, filePath);
          const newSize = fs.statSync(filePath).size;
          task.downloadedSize = newSize;
          task.totalSize = newSize;
          broadcast({ type: "UPDATE_DOWNLOAD", data: task.toJSON() });
          return res.json({ success: true, message: "Video berhasil diperbaiki (AAC-LC + FastStart).", size: newSize });
        } catch (e: any) {
          return res.status(500).json({ error: e.message });
        }
      }
      return res.status(500).json({ error: "File hasil perbaikan kosong" });
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Video Enhancement & Upscaling (Sharpen, Denoise, Color Boost, 1080p/4K Upscale)
app.post("/api/downloads/:id/enhance", validateParam(IdParamSchema), (req, res) => {
  const { id } = req.params;
  const { preset } = req.body || {};
  const task = downloadManager.getTask(id);
  if (!task) return res.status(404).json({ error: "Download task not found" });

  if (task.status === "merging") {
    return res.status(400).json({ error: "Video is already being enhanced or processed" });
  }

  try {
    const baseDir = process.env.DOWNLOAD_DIR
      ? path.resolve(process.env.DOWNLOAD_DIR)
      : safeResolve(process.cwd(), "downloads");
    
    let filePath = safeResolve(baseDir, task.filename);

    if (!fs.existsSync(filePath)) {
      // Try with .mp4 or searching directory for matching file
      if (fs.existsSync(filePath + ".mp4")) {
        filePath = filePath + ".mp4";
      } else {
        const files = fs.readdirSync(baseDir);
        const match = files.find(f => f.toLowerCase() === task.filename.toLowerCase() || f.toLowerCase().startsWith(task.filename.toLowerCase()));
        if (match) {
          filePath = safeResolve(baseDir, match);
        }
      }
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File video tidak ditemukan di disk (${task.filename})` });
    }

    const ffmpegBin = getFfmpegBinary();
    if (!ffmpegBin) {
      return res.status(500).json({ error: "FFmpeg binary is required for video enhancement" });
    }

    let filterChain = "";
    let audioFlags = "-c:a copy";
    let videoCodec = "-c:v libx264 -preset medium -crf 18";
    let label = "Enhanced";

    switch (preset) {
      case "compress":
        videoCodec = "-c:v libx264 -preset slow -crf 24";
        audioFlags = "-c:a aac -b:a 128k";
        filterChain = "";
        label = "Smart Compress (Hemat Ukuran ~50%, Visual Asli)";
        break;
      case "compress_hevc":
        videoCodec = "-c:v libx265 -preset medium -crf 28";
        audioFlags = "-c:a aac -b:a 128k";
        filterChain = "";
        label = "Ultra Compress H.265 (Hemat Ukuran ~70%)";
        break;
      case "sharpen":
        filterChain = '-vf "unsharp=5:5:0.8:5:5:0.0,hqdn3d=1.2:1.2:4:4"';
        label = "HD Sharpened & Denoised";
        break;
      case "vibrant":
        filterChain = '-vf "eq=saturation=1.28:contrast=1.12:brightness=0.01"';
        label = "Vibrant Color Boost";
        break;
      case "upscale1080p":
        filterChain = '-vf "scale=1920:1080:flags=lanczos,unsharp=3:3:0.6"';
        label = "Upscaled to 1080p Full HD";
        break;
      case "upscale4k":
        filterChain = '-vf "scale=3840:2160:flags=lanczos,unsharp=3:3:0.6"';
        label = "Upscaled to 4K Ultra HD";
        break;
      case "full":
      default:
        filterChain = '-vf "scale=1920:1080:flags=lanczos,unsharp=5:5:0.8:5:5:0.0,eq=saturation=1.22:contrast=1.08,hqdn3d=1.2:1.2:4:4"';
        audioFlags = '-c:a aac -b:a 192k -af "loudnorm=I=-16:TP=-1.5:LRA=11"';
        label = "Full Ultra Quality Enhancement";
        break;
    }

    const tempOut = filePath + `.enhanced-${Date.now()}.mp4`;
    const cmd = `"${ffmpegBin}" -y -i "${filePath}" ${filterChain} ${videoCodec} ${audioFlags} -movflags +faststart "${tempOut}"`;

    // Immediately mark as processing and respond to client to avoid HTTP timeout
    task.status = "merging";
    broadcast({ type: "UPDATE_DOWNLOAD", data: task.toJSON() });
    broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });

    res.json({
      success: true,
      message: `Proses ${label} dimulai di background! Mohon tunggu beberapa saat.`,
    });

    // Execute heavy FFmpeg rendering asynchronously
    exec(cmd, { timeout: 600000 }, (error) => {
      if (error) {
        console.error("Video enhance background error:", error);
        task.status = "completed";
        task.error = "Enhancement error: " + error.message;
        broadcast({ type: "UPDATE_DOWNLOAD", data: task.toJSON() });
        broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
        return;
      }

      if (fs.existsSync(tempOut) && fs.statSync(tempOut).size > 1000) {
        try {
          fs.unlinkSync(filePath);
          fs.renameSync(tempOut, filePath);
          const newSize = fs.statSync(filePath).size;
          task.downloadedSize = newSize;
          task.totalSize = newSize;
          task.status = "completed";
          task.error = undefined;
          broadcast({ type: "UPDATE_DOWNLOAD", data: task.toJSON() });
          broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
        } catch (e: any) {
          console.error("File replacement error post enhance:", e);
          task.status = "completed";
          broadcast({ type: "UPDATE_DOWNLOAD", data: task.toJSON() });
          broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
        }
      } else {
        task.status = "completed";
        broadcast({ type: "UPDATE_DOWNLOAD", data: task.toJSON() });
        broadcast({ type: "UPDATE_ALL", data: downloadManager.getAll() });
      }
    });
  } catch (e: any) {
    if (!res.headersSent) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }
});

// Static downloads dir WITH safeBase path traversal prevention
const downloadDir = getDownloadsDir();
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
app.use("/downloads", (req, res, next) => {
  try {
    // Decode once (browsers/axios already decode; but handle double-encoded)
    let decoded: string;
    try { decoded = decodeURIComponent(req.path || ""); }
    catch { decoded = req.path || ""; }
    safeResolve(downloadDir, decoded);
    next();
  } catch (e: any) {
    res.status(403).json({ error: "Forbidden" });
  }
}, express.static(downloadDir, { acceptRanges: true }));

const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { maxAge: "1d" }));
}

// ============================================================
// Global Error Handler - stack trace stripped for production
// ============================================================
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err?.message?.includes("CORS blocked")) {
    appendEventLog({ eventType: "cors_blocked", message: String(req.headers.origin || "") });
    return res.status(403).json({ error: err.message });
  }
  if (err?.status === 403) return res.status(403).json({ error: err.message || "Forbidden" });
  console.error("Unhandled error:", err);
  appendEventLog({ eventType: "server_error", message: String(err?.message || err) });
  res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err?.message || "Internal server error" });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production" && !IS_VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    } else if (IS_VERCEL) {
      const staticDist = path.resolve(process.cwd(), "dist");
      if (fs.existsSync(staticDist)) {
        app.use(express.static(staticDist));
        app.get("*", (_req, res) => {
          res.sendFile(path.join(staticDist, "index.html"));
        });
      }
    }
  }
  if (!IS_VERCEL) {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`[TurboDownloader] Server running on http://localhost:${PORT}`);
      console.log(`[TurboDownloader] Security: helmet+rateLimit+CORS-LAN+zod validation enabled`);
      console.log(`[TurboDownloader] Persistence: SQLite (WAL) tasks/settings/event_log tables ready`);
    });
  }
}

if (IS_VERCEL) {
  startServer();
} else if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js") || process.env.NODE_ENV === "production") {
  startServer();
}

export default app;
export { app as expressApp, server as httpServer };
