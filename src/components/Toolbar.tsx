import React from "react";
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Search,
  ArrowUpDown,
  Sparkles,
  Compass,
  Settings as SettingsIcon,
  Layers,
  FolderOpen,
  Puzzle,
} from "lucide-react";
import { getApiUrl, openDownloadsFolderNative } from "../lib/utils";

interface ToolbarProps {
  onOpenAddModal: () => void;
  onOpenAnalyzerModal: () => void;
  onOpenWizard: () => void;
  onOpenSettings: () => void;
  onOpenBatch: () => void;
  onOpenCheatSheet: () => void;
  onOpenExtensionModal?: () => void;
  onResumeAll: () => void;
  onPauseAll: () => void;
  onClearCompleted: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: "date" | "name" | "size" | "speed";
  onSortChange: (sort: "date" | "name" | "size" | "speed") => void;
  hasActiveDownloads: boolean;
  hasCompletedDownloads: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  defaultDownloadDir?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onOpenAddModal,
  onOpenAnalyzerModal,
  onOpenWizard,
  onOpenSettings,
  onOpenBatch,
  onOpenCheatSheet,
  onResumeAll,
  onPauseAll,
  onClearCompleted,
  onOpenExtensionModal,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  hasActiveDownloads,
  hasCompletedDownloads,
  searchInputRef,
  defaultDownloadDir,
}) => {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 mb-6 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenAddModal}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Download</span>
          </button>

          <button
            onClick={onOpenAnalyzerModal}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 font-medium px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all active:scale-95 group cursor-pointer shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-amber-500 group-hover:rotate-12 transition-transform" />
            <span>Sniff & Extract Media</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 font-medium px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-xs"
            title="Application Settings"
            aria-label="Open settings"
          >
            <SettingsIcon className="w-4 h-4 text-indigo-500" />
            <span>Settings</span>
          </button>

          <button
            onClick={onOpenBatch}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 font-medium px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-xs"
            title="Batch Import (B)"
            aria-label="Batch import URLs"
          >
            <Layers className="w-4 h-4 text-violet-500" />
            <span className="hidden sm:inline">Batch</span>
          </button>

          <button
            onClick={onOpenCheatSheet}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 font-mono font-medium px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
            title="Shortcuts Cheat Sheet (K or ?)"
            aria-label="Open keyboard shortcuts cheat sheet"
          >
            <Compass className="w-4 h-4 text-slate-500" />
            <span>?</span>
          </button>

          <button
            onClick={() => {
              openDownloadsFolderNative(defaultDownloadDir);
            }}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 font-medium px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
            title="Buka Folder Downloads di File Explorer"
            aria-label="Buka folder download"
          >
            <FolderOpen className="w-4 h-4 text-amber-600" />
            <span className="hidden sm:inline">Buka Folder</span>
          </button>

          {onOpenExtensionModal && (
            <button
              onClick={onOpenExtensionModal}
              className="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 hover:border-teal-300 font-medium px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Pasang Ekstensi Browser Chrome/Edge (1-Klik)"
              aria-label="Pasang ekstensi browser"
            >
              <Puzzle className="w-4 h-4 text-teal-600" />
              <span className="hidden sm:inline">Ekstensi Chrome</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={onResumeAll}
              className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-white rounded-lg transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
              title="Resume All Downloads"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Resume All</span>
            </button>

            <button
              onClick={onPauseAll}
              disabled={!hasActiveDownloads}
              className="p-2 text-slate-600 hover:text-amber-700 hover:bg-white rounded-lg transition-colors text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Pause All Downloads"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Pause All</span>
            </button>

            <button
              onClick={onClearCompleted}
              disabled={!hasCompletedDownloads}
              className="p-2 text-slate-600 hover:text-red-700 hover:bg-white rounded-lg transition-colors text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Clear Completed Tasks"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clean</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search filename or link..."
              className="w-full bg-muted border border-muted rounded-xl pl-9 pr-3 py-2 text-xs text-on-surface placeholder:text-muted focus:bg-elevated focus:outline-none focus:border-success-500 focus:ring-1 focus:ring-success-500 transition-all shadow-card"
              aria-label="Search downloads"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as any)}
              aria-label="Sort downloads by"
              className="bg-transparent text-xs text-slate-700 focus:outline-none cursor-pointer pr-1"
            >
              <option value="date">Date Added</option>
              <option value="name">Filename</option>
              <option value="size">File Size</option>
              <option value="speed">Speed</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
