import fs from "fs";
import path from "path";
import youtubedlPkg from "youtube-dl-exec";
const youtubedl = (youtubedlPkg as any).default || youtubedlPkg;

import { DEFAULT_USER_AGENT, Segment, dbgReport } from "./task-types.js";
import { getFfmpegBinary, optimizeVideoForCompatibility, ensureExecutable } from "./ffmpeg-toolchain.js";
import { type YtDlTrackState, cleanYouTubeUrl } from "./media-extractors.js";
import { getAllSettings } from "./database.js";

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

export interface YtDlHandlerCtx extends YtDlTrackState {
  taskId: string;
  filename: string;
  tempDir: string;
  outputDir: string;
  originalYouTubeUrl: string;
  youtubeDlProcess: any;
  totalSize: number;
  downloadedSize: number;
  status: string;
  error?: string;
  segments: Segment[];
  isCancelled: boolean;
  getStatus: () => string;
  setStatus: (s: any) => void;
  setError: (s: string) => void;
  setProcess: (p: any) => void;
  setDownloadedSize: (n: number) => void;
  setTotalSize: (n: number) => void;
  setYtDlField: (field: keyof YtDlTrackState, value: any) => void;
  setSegment0: (updater: (s: Segment) => void) => void;
  startSpeedCalculation: () => void;
  stopSpeedCalculation: () => void;
  onCloseSuccess?: () => void;
}

export function findYtDlpBinary(): string {
  let ytExe = "yt-dlp";
  try {
    const ytAny = youtubedl as any;
    const candidates: string[] = [];
    if (ytAny?.executable) candidates.push(ytAny.executable);
    if (ytAny?.default?.executable) candidates.push(ytAny.default.executable);
    if (ytAny?.binary) candidates.push(ytAny.binary);
    if (ytAny?.__bin) candidates.push(ytAny.__bin);
    try {
      const nodeModRoot = process.cwd();
      const guesses = [
        path.join(nodeModRoot, "node_modules", "youtube-dl-exec", "bin", "yt-dlp"),
        path.join(nodeModRoot, "node_modules", "youtube-dl-exec", "bin", "yt-dlp.exe"),
        path.join(nodeModRoot, "node_modules", "youtube-dl-exec", "bin", "youtube-dl"),
        path.join(nodeModRoot, "node_modules", "youtube-dl-exec", "bin", "youtube-dl.exe"),
      ];
      if (IS_VERCEL) {
        guesses.push(
          "/tmp/yt-dlp",
          "/usr/local/bin/yt-dlp",
          "/usr/local/bin/youtube-dl",
          "/usr/bin/yt-dlp",
          "/opt/bin/yt-dlp"
        );
      }
      for (const g of guesses) candidates.push(g);
    } catch (_) {}
    for (const c of candidates) {
      if (typeof c === "string" && fs.existsSync(c)) {
        ensureExecutable(c);
        ytExe = c;
        break;
      }
    }
  } catch (_) {}
  return ytExe;
}

export async function startYoutubeDlDownload(ctx: YtDlHandlerCtx): Promise<void> {
  const ytUrl = ctx.originalYouTubeUrl;
  const tempOutTemplate = path.join(ctx.tempDir, "%(title)s.%(ext)s");

  console.log(`[Task ${ctx.taskId}] Starting youtube-dl direct download → ${ctx.filename}`);
  const ytExe = findYtDlpBinary();

  // #region debug-point H1:ytdl-spawn-check
  dbgReport("H1", "youtube-dl-handler.ts:startYoutubeDlDownload:65", "[DEBUG] H1 startYoutubeDlDownload spawn attempt", { taskId: ctx.taskId, ytExe: String(ytExe).substring(0, 120), ytExeExists: (() => { try { return fs.existsSync(ytExe); } catch { return false; } })(), ytUrl: ctx.originalYouTubeUrl.substring(0, 80) });
  // #endregion

  try {
    const { spawn } = await import("child_process");
    const ffmpegPath = getFfmpegBinary();
    const ffmpegAvailable = !!ffmpegPath;

    let cookieArg: string[] = [];
    try {
      const s = getAllSettings();
      if (s?.youtubeCookiePath) {
        const resolved = path.resolve(String(s.youtubeCookiePath));
        if (fs.existsSync(resolved)) {
          cookieArg = ["--cookies", resolved];
        }
      }
      if (s?.instagramCookieHeader && !cookieArg.length && (ytUrl.includes("instagram") || ytUrl.includes("cdninstagram"))) {
        cookieArg = ["--add-header", `Cookie:${s.instagramCookieHeader}`];
      }
    } catch (_cookieErr) { /* ignore */ }

    const sortSelector = ffmpegAvailable
      ? "vcodec:h264,res:1080,fps,res,acodec:m4a,br"
      : "res,fps,ext";
    const formatSelector = ffmpegAvailable
      ? "bestvideo*+bestaudio/best/bestvideo+bestaudio[ext=m4a]/bestvideo*+bestaudio[ext=m4a]/best"
      : "best";
    const cleanedYtUrl = cleanYouTubeUrl(ytUrl);
    const ytArgs = [
      cleanedYtUrl,
      "--no-playlist",
      "-S", sortSelector,
      // If ffmpeg is missing, force a single progressive audio+video stream to avoid audio-only leftovers.
      "-f", formatSelector,
      ...(ffmpegPath ? ["--ffmpeg-location", ffmpegPath] : []),
      ...(ffmpegAvailable ? ["--merge-output-format", "mp4"] : []),
      "--no-warnings",
      "--no-check-certificates",
      ...cookieArg,
      "--extractor-args", "youtube:player_client=android,web",
      "--force-ipv4",
      "--js-runtimes", "node",
      "--no-quiet",
      "-o", tempOutTemplate,
      "--newline",
      "--progress-template", "PROGRESS:%(progress.downloaded_bytes)s/%(progress.total_bytes)s/%(progress.speed)s/%(progress.eta)s",
      "--add-header", "Referer:https://www.youtube.com/",
      "--add-header", `User-Agent:${DEFAULT_USER_AGENT}`,
      "--add-header", "Accept-Language:en-US,en;q=0.9,id;q=0.8",
    ];

    // #region debug-point B:yt-args
    dbgReport(
      "B",
      "youtube-dl-handler.ts:startYoutubeDlDownload:ytArgs",
      "[DEBUG] yt-dlp args prepared",
      {
        taskId: ctx.taskId,
        ytUrl: String(ytUrl).slice(0, 120),
        formatSelector,
        sortSelector,
        ffmpegAvailable: ffmpegAvailable ? 1 : 0,
        ffmpegPath: ffmpegPath || "",
        outputTemplate: tempOutTemplate,
      },
      "youtube-audio-stuck"
    );
    // #endregion

    let proc: any = null;
    let spawnMethod = "none";
    const spawnAttempts: Array<{ name: string; shell: boolean; err?: string; code?: string; result?: string }> = [];

    const attemptSpawn = (cmd: string, shell: boolean, label: string): any => {
      try {
        const p = spawn(cmd, ytArgs, { stdio: ["ignore", "pipe", "pipe"], shell });
        const hasStdout = !!(p?.stdout?.on);
        const hasStderr = !!(p?.stderr?.on);
        spawnAttempts.push({ name: label, shell, result: hasStdout && hasStderr ? "assigned" : "no-stdio" });
        p.once("error", (spErr: any) => {
          dbgReport("H1", "youtube-dl-handler.ts:startYoutubeDlDownload:spawn-onerror", "[DEBUG] H1 spawn proc.on(error)", { taskId: ctx.taskId, label, shell, errMsg: String(spErr?.message || spErr).substring(0, 200), errCode: String(spErr?.code || "") });
        });
        return p;
      } catch (e: any) {
        spawnAttempts.push({ name: label, shell, err: String(e?.message || e).substring(0, 200) });
        return null;
      }
    };

    proc = attemptSpawn(ytExe, false, `ytExe[${String(ytExe).substring(0, 50)}] shell=false`);
    if (proc) spawnMethod = `spawn(ytExe shell=false)`;

    if (!proc) {
      proc = attemptSpawn("youtube-dl", false, "youtube-dl shell=false");
      if (proc) spawnMethod = "spawn(youtube-dl shell=false)";
    }
    if (!proc) {
      proc = attemptSpawn(ytExe, true, `ytExe[${String(ytExe).substring(0, 50)}] shell=true`);
      if (proc) spawnMethod = "spawn(ytExe shell=true)";
    }
    if (!proc) {
      proc = attemptSpawn("yt-dlp", true, "yt-dlp PATH shell=true");
      if (proc) spawnMethod = "spawn(yt-dlp PATH shell=true)";
    }

    if (!proc) {
      throw new Error("Tidak dapat menemukan binary yt-dlp atau youtube-dl. Jalankan `npm install` untuk menginstal binary youtube-dl-exec dengan benar.");
    }

    // #region debug-point H1/H3:ytdl-post-spawn
    dbgReport("H1", "youtube-dl-handler.ts:startYoutubeDlDownload:107", "[DEBUG] H1 post-spawn process assigned", { taskId: ctx.taskId, spawnMethod, hasProc: !!proc, hasStdout: !!proc?.stdout, hasStderr: !!proc?.stderr, spawnAttempts });
    // #endregion

    ctx.setProcess(proc);
    (ctx as any).youtubeDlProcess = proc;
    // #region debug-point H1:check-ctx-after-setProcess
    try {
      dbgReport("H1", "youtube-dl-handler.ts:after-setProcess", "[DEBUG] H1 after ctx.setProcess check ctx.youtubeDlProcess", {
        taskId: ctx.taskId,
        ctxYtDlProcess: !!ctx.youtubeDlProcess,
        ctxStdout: !!(ctx.youtubeDlProcess?.stdout?.on),
        ctxStderr: !!(ctx.youtubeDlProcess?.stderr?.on),
        procLocalStdout: !!(proc?.stdout?.on),
        procLocalStderr: !!(proc?.stderr?.on),
        ctxOwnsKey: Object.prototype.hasOwnProperty.call(ctx, "youtubeDlProcess"),
        ctxKeysFirst20: Object.keys(ctx).slice(0, 20),
        typeofSetProcess: typeof (ctx as any).setProcess,
        procType: typeof proc,
        stdoutInstanceofReadable: !!proc && typeof proc.stdout === "object" && !!proc.stdout && (proc.stdout.readable !== undefined || typeof proc.stdout.on === "function"),
        procPid: proc && typeof proc.pid !== "undefined" ? String(proc.pid) : "no-pid",
      });
    } catch (reportErr) {
      try {
        fs.appendFileSync(
          path.join(process.cwd(), ".dbg", "dbg-fallback-youtube-0bytes-failed.log"),
          `[${new Date().toISOString()}] afterSetProcess report failed: taskId=${ctx.taskId} err=${String(
            (reportErr as any)?.message || reportErr
          )}\n`,
          "utf-8"
        );
      } catch {}
    }
    // #endregion
    const activeProc = ctx.youtubeDlProcess;
    if (!activeProc || !activeProc.stdout || !activeProc.stderr) {
      try {
        fs.appendFileSync(
          path.join(process.cwd(), ".dbg", "dbg-fallback-youtube-0bytes-failed.log"),
          `[${new Date().toISOString()}] THROW-spawn-guard: taskId=${ctx.taskId} ctxYtDlProcess=${!!ctx
            .youtubeDlProcess} hasStdout=${!!ctx.youtubeDlProcess?.stdout} procLocalStdout=${!!proc?.stdout} typeofProcStdout=${typeof proc
            ?.stdout}\n`,
          "utf-8"
        );
      } catch {}
      throw new Error("Failed to spawn youtube-dl process. Try running npm install to ensure binaries are present.");
    }

    activeProc.stdout.on("data", (data: Buffer) => {
      if (ctx.isCancelled) return;
      const status = ctx.getStatus();
      if (status !== "downloading" && status !== "merging") return;
      const raw = data.toString("utf-8");
      const lines = raw.split(/\r?\n/);
      // #region debug-point H3:stdout-data
      dbgReport("H3", "youtube-dl-handler.ts:stdout:onData", "[DEBUG] H3 stdout received bytes", { taskId: ctx.taskId, byteLen: data.length, lineCount: lines.length, first200Chars: raw.substring(0, 200).replace(/[\r\n]/g, "↵") });
      // #endregion
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("[download]") && trimmed.includes("Destination:")) {
          const ytDlTrackCountSeen = ctx.ytDlTrackCountSeen;
          if (ytDlTrackCountSeen > 0) {
            const priorTrackSize = Math.max(ctx.ytDlLastTrackPeak, ctx.ytDlLastTrackDownloaded);
            ctx.setYtDlField("ytDlDownloadedAccum", ctx.ytDlDownloadedAccum + priorTrackSize);
            ctx.setYtDlField("ytDlLastTrackPeak", 0);
          }
          ctx.setYtDlField("ytDlTrackCountSeen", ctx.ytDlTrackCountSeen + 1);
          ctx.setYtDlField("ytDlLastTrackDownloaded", 0);
          console.log(`[Task ${ctx.taskId}] YouTube track #${ctx.ytDlTrackCountSeen} started (accumulated prior = ${(ctx.ytDlDownloadedAccum / 1024 / 1024).toFixed(2)} MB)`);
          continue;
        }

        if (trimmed.startsWith("PROGRESS:")) {
          const parts = trimmed.substring("PROGRESS:".length).split("/");
          const trackDownloaded = parseInt(parts[0], 10) || 0;
          const trackTotal = parseInt(parts[1], 10) || 0;

          const isTrackSwitch =
            ctx.ytDlTrackCountSeen > 0
              ? // Jika sudah melihat 1+ track sebelumnya: PASTI SWITCH JIKA trackDownloaded TURUN DRASTIS < 50% lastPeak.
                // (DULU terlalu ketat: && trackDownloaded <= 10240 → audio track mulai 1MB masih dianggap "lanjutan video"
                //  padahal 1MB << lastPeak 105MB → trigger accum agar tidak reset.)
                trackDownloaded < Math.max(10240, ctx.ytDlLastTrackPeak * 0.5)
              : // Track pertama, jika peak sudah ada tapi trackDownloaded tiba-tiba drop < 1% peak
                // (hanya safety net, first track jarang terjadi).
                ctx.ytDlLastTrackPeak > 1024 * 1024 && trackDownloaded < ctx.ytDlLastTrackPeak * 0.01;

          if (isTrackSwitch) {
            const priorTrackSize = ctx.ytDlLastTrackPeak;
            const prevAccum = ctx.ytDlDownloadedAccum;
            ctx.setYtDlField("ytDlDownloadedAccum", ctx.ytDlDownloadedAccum + priorTrackSize);
            ctx.setYtDlField("ytDlLastTrackPeak", 0);
            ctx.setYtDlField("ytDlTrackCountSeen", ctx.ytDlTrackCountSeen + 1);
            if (trackTotal > 0) {
              const combinedTotal = ctx.ytDlDownloadedAccum + trackTotal;
              if (combinedTotal > ctx.totalSize) {
                ctx.setTotalSize(combinedTotal);
              }
              ctx.setYtDlField("ytDlStableTotalLocked", true);
            }
            try {
              dbgReport("H6", "youtube-dl-handler.ts:isTrackSwitch-triggered", "[TRACK SWITCH OK] Accumulated prior track to downloadedSize", {
                __dbgEnv: "ws-closed-download-stuck",
                taskId: ctx.taskId,
                prevAccum,
                priorTrackSize,
                newAccum: ctx.ytDlDownloadedAccum,
                lastPeakBeforeReset: priorTrackSize,
                newTrackDownloaded: trackDownloaded,
                newTrackTotal: trackTotal,
                combinedTotal: ctx.totalSize,
                ytDlTrackCountSeen: ctx.ytDlTrackCountSeen,
              });
            } catch { /* noop debug guard */ }
            console.log(`[Task ${ctx.taskId}] YouTube auto-detected track #${ctx.ytDlTrackCountSeen} switch (new accum = ${(ctx.ytDlDownloadedAccum / 1024 / 1024).toFixed(2)} MB, combinedTotal = ${(ctx.totalSize / 1024 / 1024).toFixed(2)} MB, LOCKED)`);
          }

          if (trackDownloaded > ctx.ytDlLastTrackPeak) {
            ctx.setYtDlField("ytDlLastTrackPeak", trackDownloaded);
          }
          ctx.setYtDlField("ytDlLastTrackDownloaded", trackDownloaded);

          const cumDownloaded = ctx.ytDlDownloadedAccum + trackDownloaded;
          ctx.setDownloadedSize(cumDownloaded);

          if (!ctx.ytDlStableTotalLocked && trackTotal > 0) {
            if (ctx.ytDlEstimatedTotal > 0) {
              ctx.setTotalSize(ctx.ytDlEstimatedTotal);
              ctx.setYtDlField("ytDlStableTotalLocked", true);
            } else if (ctx.ytDlTrackCountSeen >= 2) {
              const combinedTotal = ctx.ytDlDownloadedAccum + trackTotal;
              if (combinedTotal > 0) {
                ctx.setTotalSize(Math.max(ctx.totalSize, combinedTotal));
                ctx.setYtDlField("ytDlStableTotalLocked", true);
              }
            } else if (ctx.totalSize === 0) {
              ctx.setTotalSize(trackTotal);
              ctx.setYtDlField("ytDlStableTotalLocked", true);
            }
          }

          if (ctx.totalSize === 0 && ctx.ytDlEstimatedTotal > 0) {
            ctx.setTotalSize(ctx.ytDlEstimatedTotal);
            ctx.setYtDlField("ytDlStableTotalLocked", true);
          }

          ctx.setSegment0((seg: Segment) => {
            seg.downloaded = cumDownloaded;
            if (ctx.totalSize > 0) seg.end = ctx.totalSize - 1;
          });
          continue;
        }

        if (trimmed.startsWith("[Merger]") || trimmed.toLowerCase().includes("merging formats") || trimmed.includes("Merging formats")) {
          if (ctx.getStatus() !== "merging") {
            const newAccum = ctx.ytDlDownloadedAccum + Math.max(ctx.ytDlLastTrackPeak, ctx.ytDlLastTrackDownloaded);
            ctx.setYtDlField("ytDlDownloadedAccum", newAccum);
            ctx.setYtDlField("ytDlLastTrackPeak", 0);
            ctx.setYtDlField("ytDlLastTrackDownloaded", 0);
            if (ctx.ytDlEstimatedTotal > 0 && ctx.totalSize < newAccum) {
              ctx.setTotalSize(Math.max(ctx.ytDlEstimatedTotal, newAccum));
            } else if (ctx.totalSize < newAccum) {
              ctx.setTotalSize(newAccum);
            }
            ctx.setYtDlField("ytDlStableTotalLocked", true);
            ctx.setDownloadedSize(newAccum);
            ctx.setSegment0((seg) => { seg.downloaded = newAccum; });
          }
          ctx.setStatus("merging");
        }
      }
    });

    activeProc.stderr.on("data", (data: Buffer) => {
      const msg = data.toString("utf-8").trim();
      if (!msg) return;
      // #region debug-point H1/H2:stderr-data
      dbgReport("H2", "youtube-dl-handler.ts:stderr:onData", "[DEBUG] H2/H1 stderr received", { taskId: ctx.taskId, first250Chars: msg.substring(0, 250).replace(/[\r\n]/g, "↵") });
      // #endregion
      if (msg.includes("Sign in to confirm") || msg.includes("bot")) {
        try { activeProc.kill("SIGKILL"); } catch (_) {}
        ctx.setProcess(null);
        ctx.setStatus("error");
        ctx.setError("Gagal mengekstrak video YouTube: YouTube memblokir request ini. Pastikan video bersifat publik dan tidak dibatasi usia.");
        ctx.stopSpeedCalculation();
        return;
      }
      console.warn(`[Task ${ctx.taskId}] youtube-dl stderr:`, msg.substring(0, 200));
    });

    activeProc.on("close", (code: number) => {
      if (ctx.isCancelled) return;
      ctx.setProcess(null);
      // #region debug-point H1/H3:on-close
      dbgReport("H1", "youtube-dl-handler.ts:onClose", "[DEBUG] H1 yt-dlp process closed", { taskId: ctx.taskId, exitCode: code === null ? "null" : code, totalSize: ctx.totalSize, downloadedSize: ctx.downloadedSize, status: ctx.getStatus(), error: String(ctx.error || "").substring(0, 150) });
      // #endregion

      if (code === 0 || code === null) {
        let finalFile = "";
        const finalCandidates: Array<{ name: string; size: number }> = [];
        try {
          const files = fs.readdirSync(ctx.tempDir);
          const rankedFiles = files
            .map((f) => {
              const fp = path.join(ctx.tempDir, f);
              try {
                const st = fs.statSync(fp);
                if (!st.isFile()) return null;
                finalCandidates.push({ name: f, size: st.size });
                const ext = path.extname(f).toLowerCase();
                const isAudioOnly = ext === ".m4a" || ext === ".mp3" || ext === ".aac" || ext === ".opus" || ext === ".ogg";
                const score = isAudioOnly ? 1 : 2;
                return { fp, f, size: st.size, score };
              } catch {
                return null;
              }
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b.score - a.score || b.size - a.size);
          for (const item of rankedFiles as Array<{ fp: string; f: string; size: number; score: number }>) {
            const f = item.f;
            try {
            } catch {}
            if (f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".mkv") || f.endsWith(".m4a")) {
              finalFile = item.fp;
              break;
            }
          }
        } catch (e) {}
        if (!finalFile) {
          try {
            const allFiles = fs.readdirSync(ctx.tempDir);
            let bestFile = "";
            let bestSize = 0;
            for (const f of allFiles) {
              const fp = path.join(ctx.tempDir, f);
              try {
                const st = fs.statSync(fp);
                if (st.isFile() && st.size > bestSize) {
                  bestSize = st.size;
                  bestFile = fp;
                }
              } catch (_) {}
            }
            if (bestFile) finalFile = bestFile;
          } catch (_) {}
        }

        // #region debug-point B/D:close-final-file
        dbgReport(
          "D",
          "youtube-dl-handler.ts:onClose:final-file-selection",
          "[DEBUG] yt-dlp close selected output candidate",
          {
            taskId: ctx.taskId,
            exitCode: code === null ? "null" : code,
            statusAtClose: ctx.getStatus(),
            finalFile,
            finalCandidates: finalCandidates.slice(0, 10),
            downloadedSize: ctx.downloadedSize,
            totalSize: ctx.totalSize,
          },
          "youtube-audio-stuck"
        );
        // #endregion

        if (finalFile && fs.existsSync(finalFile) && fs.statSync(finalFile).size > 1000) {
          try {
            if (!ctx.filename.includes(".")) ctx.filename += ".mp4";
            const dest = path.join(ctx.outputDir, ctx.filename);
            fs.copyFileSync(finalFile, dest);
            try { fs.unlinkSync(finalFile); } catch (_) {}
            try { fs.rmSync(ctx.tempDir, { recursive: true, force: true }); } catch (_) {}
            if (ctx.filename.toLowerCase().endsWith(".mp4")) {
              try { optimizeVideoForCompatibility(dest); } catch (_) {}
            }
            const st = fs.statSync(dest);
            ctx.setDownloadedSize(st.size);
            ctx.setTotalSize(st.size);
            ctx.setSegment0((seg) => {
              seg.status = "completed";
              seg.downloaded = st.size;
              seg.end = st.size - 1;
            });
            ctx.setStatus("completed");
            ctx.setError("");
            ctx.stopSpeedCalculation();
            console.log(`[Task ${ctx.taskId}] YouTube download completed: ${ctx.filename} (${st.size} bytes)`);
          } catch (e: any) {
            ctx.setStatus("error");
            ctx.setError(`Failed to save YouTube file: ${e.message}`);
            ctx.stopSpeedCalculation();
          }
        } else {
          ctx.setStatus("error");
          ctx.setError("youtube-dl mengklaim sukses tetapi file output tidak ditemukan atau kosong. Coba gunakan fitur Sniff Media Link lalu pilih resolusi lain.");
          ctx.stopSpeedCalculation();
        }
      } else {
        ctx.setStatus("error");
        ctx.setError(`youtube-dl exited with code ${code}. Kemungkinan video tidak tersedia (private/deleted/region-locked) atau format tidak didukung. Coba gunakan Sniff Media Link untuk memilih resolusi manual.`);
        ctx.stopSpeedCalculation();
      }
    });

    activeProc.on("error", (err: any) => {
      ctx.setProcess(null);
      console.error(`[Task ${ctx.taskId}] youtube-dl spawn error:`, err?.message || err);
      ctx.setStatus("error");
      ctx.setError("youtube-dl binary tidak ditemukan atau gagal dijalankan. Jalankan npm install untuk memastikan dependency youtube-dl-exec terinstal.");
      ctx.stopSpeedCalculation();
    });
  } catch (err: any) {
    // #region debug-point H1:top-level-catch
    try {
      dbgReport("H1", "youtube-dl-handler.ts:catch-top", "[DEBUG] H1 top-level catch fired", {
        taskId: ctx?.taskId || "n/a",
        errMsg: String(err?.message || err).substring(0, 300),
        errName: String(err?.name || ""),
        errStack: String(err?.stack || "").substring(0, 400),
        ctxYtDlProcess: !!(ctx && ctx.youtubeDlProcess),
      });
    } catch {}
    try {
      fs.appendFileSync(
        path.join(process.cwd(), ".dbg", "dbg-fallback-youtube-0bytes-failed.log"),
        `[${new Date().toISOString()}] TOP-CATCH: taskId=${ctx?.taskId || "n/a"} msg=${String(err?.message || err).substring(0, 280)}\n`,
        "utf-8"
      );
    } catch {}
    // #endregion
    ctx.setProcess(null);
    console.error(`[Task ${ctx.taskId}] startYoutubeDlDownload failed:`, err?.message || err);
    ctx.setStatus("error");
    ctx.setError(`YouTube direct download engine error: ${err.message || String(err)}`);
    ctx.stopSpeedCalculation();
  }
}
