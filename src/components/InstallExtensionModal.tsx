import React, { useState } from "react";
import { X, Puzzle, ExternalLink, CheckCircle2, Folder, Chrome, Sparkles } from "lucide-react";
import axios from "axios";

interface InstallExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallExtensionModal: React.FC<InstallExtensionModalProps> = ({ isOpen, onClose }) => {
  const [isOpening, setIsOpening] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleOpenInstall = async () => {
    setIsOpening(true);
    try {
      await axios.post("/api/extension/open-install");
      setSuccess(true);
    } catch (e) {
      console.error("Failed to trigger open-install:", e);
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-teal-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shadow-sm">
              <Puzzle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Pasang Ekstensi Browser</h2>
              <p className="text-xs text-slate-500">Video Sniffer otomatis untuk Chrome, Edge & Brave</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-white/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 leading-relaxed">
            <span className="font-semibold text-slate-800">Catatan Keamanan Browser:</span> Google Chrome & Microsoft Edge tidak mengizinkan aplikasi eksternal memasang ekstensi secara diam-diam (*silent install*). Anda cukup memasangnya sekali dalam 3 langkah mudah:
          </div>

          {/* Steps */}
          <div className="space-y-3.5">
            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-white border border-slate-100 shadow-2xs">
              <div className="w-6 h-6 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div className="text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Klik tombol di bawah</span> untuk membuka folder ekstensi dan tab <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-700 font-mono">chrome://extensions</code> secara otomatis.
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-white border border-slate-100 shadow-2xs">
              <div className="w-6 h-6 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div className="text-xs text-slate-700">
                Di halaman Chrome, aktifkan toggle <span className="font-semibold text-slate-900">"Mode Pengembang" (Developer mode)</span> di pojok kanan atas.
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-white border border-slate-100 shadow-2xs">
              <div className="w-6 h-6 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <div className="text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Tarik (Drag & drop)</span> folder <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-700 font-mono">extension</code> yang baru terbuka ke halaman Chrome tersebut.
              </div>
            </div>
          </div>

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-medium animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Folder ekstensi & browser berhasil dibuka di komputer Anda!</span>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              onClick={handleOpenInstall}
              disabled={isOpening}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all active:scale-95 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
            >
              <Chrome className="w-4 h-4" />
              <span>{isOpening ? "Membuka..." : "🚀 Buka Folder Ekstensi & Chrome"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
