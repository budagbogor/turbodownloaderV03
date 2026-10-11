import axios from "axios";
import fbDownloaderPkg from "@renpwn/fb-downloader";
import play from "play-dl";
import youtubedlPkg from "youtube-dl-exec";
const youtubedl = (youtubedlPkg as any).default || youtubedlPkg;
const fbDownloader = (fbDownloaderPkg as any).default || fbDownloaderPkg;

import {
  DEFAULT_USER_AGENT,
  decodeHtmlEntities,
  debugReport,
} from "./task-types.js";

export interface MediaExtractorOptions {
  taskId: string;
  url: string;
  sanitizeFilename: (name: string) => string;
  currentFilename: string;
}

export interface MediaExtractorResult {
  isSocialMedia: boolean;
  useYoutubeDlDirect: boolean;
  originalYouTubeUrl?: string;
  downloadUrl: string;
  filename: string;
  totalSize: number;
  ytDlEstimatedTotal?: number;
  ytDlStableTotalLocked?: boolean;
  extractorFailed?: boolean;
}

export interface YtDlTrackState {
  ytDlDownloadedAccum: number;
  ytDlLastTrackDownloaded: number;
  ytDlTrackCountSeen: number;
  ytDlLastTrackPeak: number;
  ytDlStableTotalLocked: boolean;
  ytDlEstimatedTotal: number;
}

export function detectSocialPlatforms(url: string) {
  const isFb =
    url.includes("facebook.com") ||
    url.includes("fb.watch") ||
    url.includes("fb.com");
  const isTikTok = url.includes("tiktok.com");
  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isInstagram = url.includes("instagram.com");
  const isSocial =
    isFb ||
    isTikTok ||
    isYouTube ||
    isInstagram ||
    url.includes("twitter.com") ||
    url.includes("x.com");
  return { isFb, isTikTok, isYouTube, isInstagram, isSocial };
}

export async function extractFacebook(opts: MediaExtractorOptions): Promise<{ downloadUrl: string; filename: string }> {
  const { taskId, url, sanitizeFilename, currentFilename } = opts;
  let downloadUrl = "";
  let filename = currentFilename;
  try {
    const fbRes = await fbDownloader(url);
    if (fbRes && (fbRes.hd || fbRes.sd)) {
      downloadUrl = fbRes.hd || fbRes.sd;
      if (fbRes.title && (!filename || filename.startsWith("download_"))) {
        const cleanTitle = decodeHtmlEntities(fbRes.title)
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
          .trim()
          .substring(0, 80);
        filename = (cleanTitle || `Facebook_Video_${taskId.substring(0, 8)}`) + ".mp4";
      } else if (!filename.endsWith(".mp4") && !filename.includes(".")) {
        filename += ".mp4";
      }
    }
  } catch (fbErr: any) {
    console.warn("Facebook extraction error:", fbErr.message);
  }
  return { downloadUrl, filename };
}

export async function extractTikTok(opts: MediaExtractorOptions): Promise<{ downloadUrl: string; filename: string; totalSize: number }> {
  const { taskId, url, sanitizeFilename, currentFilename } = opts;
  let downloadUrl = "";
  let filename = currentFilename;
  let totalSize = 0;
  try {
    const tikRes = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, {
      timeout: 10000,
    });
    if (tikRes.data?.data?.play) {
      downloadUrl = tikRes.data.data.play;
      if (!filename || filename.startsWith("download_")) {
        const rawTitle = tikRes.data.data.title || `TikTok_${taskId.substring(0, 8)}`;
        const cleanTitle = rawTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim().substring(0, 80);
        filename = (cleanTitle || `TikTok_${taskId.substring(0, 8)}`) + ".mp4";
      } else if (!filename.endsWith(".mp4") && !filename.includes(".")) {
        filename += ".mp4";
      }
      totalSize = tikRes.data.data.size || 0;
    }
  } catch (tikErr: any) {
    console.warn("TikTok extraction error:", tikErr.message);
  }
  return { downloadUrl, filename, totalSize };
}

export interface YouTubeExtractionResult {
  downloadUrl: string;
  filename: string;
  ytTitle: string;
  ytEstimate: number;
  normalizedUrl: string;
}

export function cleanYouTubeUrl(url: string): string {
  let normalizedUrl = url.trim();
  if (normalizedUrl.includes("/shorts/")) {
    const vid = normalizedUrl.split("/shorts/")[1]?.split("/")[0]?.split("?")[0];
    if (vid) return `https://www.youtube.com/watch?v=${vid}`;
  } else if (normalizedUrl.includes("youtu.be/")) {
    const vid = normalizedUrl.split("youtu.be/")[1]?.split("?")[0];
    if (vid) return `https://www.youtube.com/watch?v=${vid}`;
  }
  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) {
        return `https://www.youtube.com/watch?v=${v}`;
      }
    }
  } catch {}
  return normalizedUrl;
}

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
};

export async function extractYouTubePreInfo(opts: MediaExtractorOptions): Promise<YouTubeExtractionResult> {
  const { taskId, url, sanitizeFilename, currentFilename } = opts;
  const normalizedUrl = cleanYouTubeUrl(url);

  let downloadUrl = "";
  let filename = currentFilename;
  let ytTitle = "";
  let ytEstimate = 0;

  try {
    const info = await withTimeout(play.video_info(normalizedUrl), 5000, null as any);
    if (info && info.format) {
      const videoFormats = info.format.filter((f) => f.qualityLabel && f.audioQuality);
      const chosen = videoFormats[0] || info.format.find((f) => f.url);
      debugReport("A", "src/server/media-extractors.ts:extractYouTubePreInfo", "[DEBUG] play-dl returned YouTube formats", {
        taskId,
        normalizedUrl,
        formatCount: info.format.length,
        chosenHasUrl: Boolean(chosen?.url),
        chosenQuality: chosen?.qualityLabel || null,
        chosenMimeType: chosen?.mimeType || null,
      });
      if (info.video_details?.title) ytTitle = info.video_details.title;
      if (chosen && chosen.url) {
        downloadUrl = chosen.url;
        if (info.video_details?.durationInSec && chosen.bitrate) {
          ytEstimate = Math.floor((chosen.bitrate * info.video_details.durationInSec) / 8);
        }
      }
    }
  } catch (ytErr: any) {
    debugReport("C", "src/server/media-extractors.ts:extractYouTubePreInfo", "[DEBUG] play-dl extraction failed", {
      taskId,
      error: ytErr?.message || String(ytErr),
      url,
    });
    if (!String(ytErr?.message).includes("Sign in to confirm")) {
      console.warn("play-dl extraction error:", ytErr.message);
    }
  }

  try {
    const ytPromise = youtubedl(normalizedUrl, {
      dumpSingleJson: true,
      noPlaylist: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      format: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      addHeader: ["referer:https://www.youtube.com/", `user-agent:${DEFAULT_USER_AGENT}`],
    });
    const ytInfo: any = await withTimeout(ytPromise, 6000, null);
    if (ytInfo) {
      if (!ytTitle && ytInfo.title) ytTitle = ytInfo.title;
      let combinedSize = 0;
      try {
        if (ytInfo.requested_formats && ytInfo.requested_formats.length) {
          for (const rf of ytInfo.requested_formats) {
            combinedSize += rf.filesize || rf.filesize_approx || 0;
          }
        } else if (ytInfo.format || ytInfo.formats?.length) {
          const fmt = ytInfo.format || ytInfo.formats?.[ytInfo.formats.length - 1] || null;
          if (fmt) {
            combinedSize = fmt.filesize || fmt.filesize_approx || 0;
          }
        }
        if (combinedSize === 0 && ytInfo.formats && ytInfo.formats.length) {
          const bestVideo = ytInfo.formats
            .filter((f: any) => f.vcodec && f.vcodec !== "none" && f.ext === "mp4")
            .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];
          const bestAudio = ytInfo.formats
            .filter((f: any) => f.acodec && f.acodec !== "none")
            .sort((a: any, b: any) => (b.abr || 0) - (a.abr || 0))[0];
          const bvSize = bestVideo?.filesize || bestVideo?.filesize_approx || 0;
          const baSize = bestAudio?.filesize || bestAudio?.filesize_approx || 0;
          combinedSize = bvSize + baSize;
        }
      } catch (_) {}
      if (!combinedSize) combinedSize = ytInfo.filesize || ytInfo.filesize_approx || 0;
      if (combinedSize > 0) ytEstimate = combinedSize;
    }
  } catch (ytInfoErr: any) {
    console.warn(`[Task ${taskId}] YouTube ytdl metadata skipped:`, ytInfoErr?.message?.substring(0, 120) || ytInfoErr);
  }

  if (ytTitle && (!filename || filename.startsWith("download_"))) {
    filename = sanitizeFilename(ytTitle) + ".mp4";
  } else if (!filename.endsWith(".mp4") && !filename.includes(".")) {
    filename += ".mp4";
  }

  return { downloadUrl, filename, ytTitle, ytEstimate, normalizedUrl };
}

export async function socialMediaYtDlFallback(
  opts: MediaExtractorOptions & { isSocialMedia: boolean }
): Promise<{ downloadUrl: string; filename: string; totalSize: number; extractorFailed: boolean }> {
  const { taskId, url, sanitizeFilename, currentFilename, isSocialMedia } = opts;
  let downloadUrl = "";
  let filename = currentFilename;
  let totalSize = 0;
  let extractorFailed = false;

  if (!isSocialMedia) return { downloadUrl, filename, totalSize, extractorFailed };

  try {
    const info: any = await withTimeout(
      youtubedl(url, {
        dumpSingleJson: true,
        noPlaylist: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ["referer:https://www.google.com", `user-agent:${DEFAULT_USER_AGENT}`],
      }),
      7000,
      null
    );

    if (info && info.url) {
      downloadUrl = info.url;
      debugReport("C", "src/server/media-extractors.ts:socialMediaYtDlFallback", "[DEBUG] youtube-dl-exec fallback returned URL", {
        taskId,
        extractor: info.extractor || null,
        hasUrl: Boolean(info.url),
        ext: info.ext || null,
        filesize: info.filesize || info.filesize_approx || 0,
      });
      if (info.title && (!filename || filename.startsWith("download_"))) {
        const ext = info.ext ? `.${info.ext}` : ".mp4";
        filename = sanitizeFilename(info.title + ext);
      }
      totalSize = info.filesize || info.filesize_approx || 0;
    } else {
      extractorFailed = true;
    }
  } catch (e: any) {
    extractorFailed = true;
    const errStr = String(e?.message || e?.stderr || e);
    debugReport("C", "src/server/media-extractors.ts:socialMediaYtDlFallback", "[DEBUG] youtube-dl-exec fallback failed", {
      taskId,
      error: errStr,
      url,
    });
    if (errStr.includes("Sign in to confirm you're not a bot") || errStr.includes("Sign in to confirm")) {
      throw new Error("Gagal mengekstrak video media sosial: YouTube memblokir IP server ini (Google Cloud) untuk mencegah penyalahgunaan bot. Silakan jalankan aplikasi ini secara lokal.");
    }
    console.warn("Social media extraction fallback failed:", errStr);
    if (errStr.includes("ENOENT") && errStr.includes("youtube-dl-exec")) {
      console.error("youtube-dl-exec binary is missing! Ensure postinstall script runs properly.");
    }
  }

  return { downloadUrl, filename, totalSize, extractorFailed };
}
