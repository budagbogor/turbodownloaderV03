import React, { useState } from "react";
import { DownloadTask } from "../types";
import { X, Download, Wrench, CheckCircle, AlertCircle, Film, ShieldCheck, Play } from "lucide-react";
import axios from "axios";
import { getApiUrl } from "../lib/utils";

interface VideoPlayerModalProps {
  task: DownloadTask | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ task, onClose, onRefresh }) => {
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairSuccess, setRepairSuccess] = useState<string | null>(null);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [isPlayingNative, setIsPlayingNative] = useState(false);

  if (!task) return null;

  const handlePlayNative = async () => {
    setIsPlayingNative(true);
    try {
      await axios.post(`/api/downloads/${task.id}/play-native`);
    } catch (err: any) {
      console.error("Play native error:", err);
    } finally {
      setIsPlayingNative(false);
    }
  };

  const handleRepair = async () => {
    setIsRepairing(true);
    setRepairSuccess(null);
    setRepairError(null);
    try {
      const res = await axios.post(`/api/downloads/${task.id}/repair`);
      setRepairSuccess(res.data?.message || "Video berhasil diperbaiki dan dikonversi ke AAC-LC universal!");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setRepairError(err.response?.data?.error || err.message || "Gagal memperbaiki video");
    } finally {
      setIsRepairing(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <div className="p-2 bg-emerald-100/70 text-emerald-700 rounded-xl">
              <Film className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 truncate" title={task.filename}>
                {task.filename}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium">
                <span>{formatBytes(task.downloadedSize || task.totalSize)}</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> MP4 Universal (H.264 + AAC-LC)
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handlePlayNative}
              disabled={isPlayingNative}
              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Buka langsung di Pemutar Windows (WMP/Film & TV)"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Putar di Windows</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Player Box */}
        <div className="bg-black relative aspect-video w-full flex items-center justify-center overflow-hidden">
          <video
            key={repairSuccess || task.id}
            src={getApiUrl(`/api/downloads/${task.id}/stream`)}
            crossOrigin="anonymous"
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          >
            Browser Anda tidak mendukung tag video HTML5.
          </video>
        </div>

        {/* Compatibility Info & Actions */}
        <div className="p-4 space-y-3 overflow-y-auto">
          {repairSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Berhasil:</span> {repairSuccess}
              </div>
            </div>
          )}

          {repairError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Perhatian:</span> {repairError}
              </div>
            </div>
          )}

          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-slate-600 leading-relaxed">
            <div className="font-semibold text-blue-900 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              Kompatibilitas Windows Media Player (Error 0xC00D36C4):
            </div>
            Facebook sering mengompres audio dengan codec <code className="px-1 bg-white rounded border border-blue-200 text-blue-800 font-mono">HE-AACv2</code> yang tidak didukung pemutar bawaan Windows. Sistem telah otomatis menormalisasinya ke codec <code className="px-1 bg-white rounded border border-blue-200 text-blue-800 font-mono">AAC-LC</code> standar serta merapikan header FastStart agar dapat diputar langsung di Windows Media Player, Film & TV, VLC, dan ponsel.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <button
            onClick={handleRepair}
            disabled={isRepairing}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            title="Konversi ulang format audio dan rapikan moov atom"
          >
            <Wrench className={`w-3.5 h-3.5 ${isRepairing ? "animate-spin" : ""}`} />
            <span>{isRepairing ? "Memperbaiki..." : "Re-Optimasi untuk Windows"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayNative}
              disabled={isPlayingNative}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
              title="Putar langsung di Windows Media Player / VLC / Film & TV"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Putar di Windows</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer shadow-2xs"
            >
              Tutup
            </button>
            <a
              href={getApiUrl(`/api/downloads/${task.id}/file`)}
              download={task.filename}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh / Simpan Ulang</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
