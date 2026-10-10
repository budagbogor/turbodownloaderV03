import React, { useState } from "react";
import { DownloadTask } from "../types";
import { formatBytes, formatTime } from "../lib/utils";
import { SegmentVisualizer } from "./SegmentVisualizer";
import {
  X,
  Info,
  Link,
  Folder,
  Clock,
  Activity,
  Layers,
  Download,
  Play,
  Sparkles,
  Wand2,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface TaskDetailsModalProps {
  task: DownloadTask | null;
  onClose: () => void;
  onPlay?: (task: DownloadTask) => void;
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ task, onClose, onPlay }) => {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancePreset, setEnhancePreset] = useState<string | null>(null);
  const [enhanceMsg, setEnhanceMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!task) return null;

  const handleEnhance = async (preset: string) => {
    setIsEnhancing(true);
    setEnhancePreset(preset);
    setEnhanceMsg(null);
    try {
      const res = await fetch(`/api/downloads/${task.id}/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text || "Gagal membaca balasan server" };
      }

      if (res.ok && data.success) {
        setEnhanceMsg({ type: "success", text: data.message || "Proses peningkatan kualitas video dimulai di background!" });
      } else {
        const detailErr = data.error || (data.issues ? JSON.stringify(data.issues) : "") || text || `HTTP Error ${res.status}`;
        setEnhanceMsg({ type: "error", text: detailErr });
      }
    } catch (e: any) {
      setEnhanceMsg({ type: "error", text: e.message || "Terjadi kesalahan jaringan" });
    } finally {
      setIsEnhancing(false);
      setEnhancePreset(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 rounded-xl border border-blue-200 text-blue-600">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 truncate max-w-md" title={task.filename}>
                {task.filename}
              </h2>
              <p className="text-xs text-slate-500 font-mono">Task ID: {task.id.slice(0, 13)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-sm text-slate-700">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-slate-400" />
              Source Address
            </div>
            <div className="font-mono text-xs text-slate-700 break-all select-all">
              {task.url}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-medium uppercase">Total Size</div>
              <div className="text-sm font-mono font-semibold text-slate-900 mt-0.5">
                {formatBytes(task.totalSize)}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-medium uppercase">Downloaded</div>
              <div className="text-sm font-mono font-semibold text-emerald-700 mt-0.5">
                {formatBytes(task.downloadedSize)}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-medium uppercase">Current Speed</div>
              <div className="text-sm font-mono font-semibold text-amber-700 mt-0.5">
                {task.status === "downloading" ? `${formatBytes(task.speed)}/s` : "-"}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-medium uppercase">Time Remaining</div>
              <div className="text-sm font-mono font-semibold text-blue-700 mt-0.5">
                {task.eta ? formatTime(task.eta) : task.status === "completed" ? "Done" : "-"}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200/80 text-xs">
            <div className="flex items-center justify-between p-2.5">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" /> Category
              </span>
              <span className="font-semibold text-slate-800 uppercase">{task.category}</span>
            </div>
            <div className="flex items-center justify-between p-2.5">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-slate-400" /> Acceleration Streams
              </span>
              <span className="font-mono text-emerald-700 font-semibold">{task.numConnections} Threads</span>
            </div>
            <div className="flex items-center justify-between p-2.5">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-slate-400" /> Local Directory
              </span>
              <span className="font-mono text-slate-600 truncate max-w-xs">downloads/{task.filename}</span>
            </div>
            <div className="flex items-center justify-between p-2.5">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Added On
              </span>
              <span className="font-mono text-slate-700">
                {new Date(task.createdAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* AI / FFmpeg Video Quality Enhancement Panel */}
          {task.status === "completed" && task.category === "video" && (
            <div className="bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-slate-50 border border-indigo-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-900 font-semibold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                  Video Quality Enhancement & Upscaling
                </div>
                <span className="text-[11px] text-indigo-600/80 font-medium bg-indigo-100/60 px-2 py-0.5 rounded-full">
                  FFmpeg Engine
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tingkatkan ketajaman gambar, sesuaikan warna, hilangkan noise, atau tingkatkan resolusi video ini menjadi 1080p/4K.
              </p>

              {enhanceMsg && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    enhanceMsg.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}
                >
                  {enhanceMsg.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{enhanceMsg.text}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                <button
                  disabled={isEnhancing}
                  onClick={() => handleEnhance("sharpen")}
                  className="px-3 py-2 bg-white hover:bg-indigo-50/60 border border-indigo-200/80 hover:border-indigo-300 rounded-lg text-xs font-semibold text-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {isEnhancing && enhancePreset === "sharpen" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>HD Sharpen</span>
                </button>

                <button
                  disabled={isEnhancing}
                  onClick={() => handleEnhance("vibrant")}
                  className="px-3 py-2 bg-white hover:bg-indigo-50/60 border border-indigo-200/80 hover:border-indigo-300 rounded-lg text-xs font-semibold text-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {isEnhancing && enhancePreset === "vibrant" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  )}
                  <span>Vibrant Colors</span>
                </button>

                <button
                  disabled={isEnhancing}
                  onClick={() => handleEnhance("upscale1080p")}
                  className="px-3 py-2 bg-white hover:bg-indigo-50/60 border border-indigo-200/80 hover:border-indigo-300 rounded-lg text-xs font-semibold text-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {isEnhancing && enhancePreset === "upscale1080p" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  ) : (
                    <span className="font-black text-[10px] bg-blue-100 text-blue-700 px-1 rounded">1080p</span>
                  )}
                  <span>Upscale 1080p</span>
                </button>

                <button
                  disabled={isEnhancing}
                  onClick={() => handleEnhance("upscale4k")}
                  className="px-3 py-2 bg-white hover:bg-indigo-50/60 border border-indigo-200/80 hover:border-indigo-300 rounded-lg text-xs font-semibold text-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {isEnhancing && enhancePreset === "upscale4k" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  ) : (
                    <span className="font-black text-[10px] bg-amber-100 text-amber-700 px-1 rounded">4K</span>
                  )}
                  <span>Upscale 4K</span>
                </button>

                <button
                  disabled={isEnhancing}
                  onClick={() => handleEnhance("full")}
                  className="col-span-2 sm:col-span-2 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {isEnhancing && enhancePreset === "full" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  )}
                  <span>Full Ultra Enhancement (Upscale + Sharpen + Audio)</span>
                </button>
              </div>
            </div>
          )}

          <div className="pt-2">
            <SegmentVisualizer segments={task.segments} numConnections={task.numConnections} />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {task.status === "completed" && task.category === "video" && onPlay && (
              <button
                onClick={() => {
                  onClose();
                  onPlay(task);
                }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Play / Preview Video</span>
              </button>
            )}

            {task.status === "completed" && (
              <a
                href={`/api/downloads/${task.id}/file`}
                download={task.filename}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Save to Device</span>
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer shadow-2xs"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};

