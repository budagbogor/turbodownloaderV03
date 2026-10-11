import React, { useState } from "react";
import { DownloadTask } from "../types";
import { formatBytes, formatTime, getApiUrl, openFileInFolderNative } from "../lib/utils";
import { SegmentVisualizer } from "./SegmentVisualizer";
import {
  Play,
  Pause,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
  Video,
  Music,
  Archive,
  FileText,
  Package,
  FileQuestion,
  Cpu,
  Download,
  FolderOpen,
} from "lucide-react";
import { motion } from "framer-motion";

interface DownloadItemProps {
  task: DownloadTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onInspect: (task: DownloadTask) => void;
  onPlay?: (task: DownloadTask) => void;
}

export const DownloadItem: React.FC<DownloadItemProps> = ({
  task,
  onPause,
  onResume,
  onDelete,
  onInspect,
  onPlay,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getCategoryIcon = () => {
    switch (task.category) {
      case "video":
        return <Video className="w-5 h-5 text-blue-600" />;
      case "audio":
        return <Music className="w-5 h-5 text-purple-600" />;
      case "compressed":
        return <Archive className="w-5 h-5 text-amber-600" />;
      case "document":
        return <FileText className="w-5 h-5 text-emerald-600" />;
      case "program":
        return <Package className="w-5 h-5 text-rose-600" />;
      default:
        return <FileQuestion className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = () => {
    switch (task.status) {
      case "completed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Completed
          </span>
        );
      case "downloading":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            Downloading
          </span>
        );
      case "merging":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            Merging Streams
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            Paused
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Pending
          </span>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="bg-white hover:bg-slate-50/50 border border-slate-200/90 hover:border-slate-300 rounded-2xl p-4 sm:p-5 transition-all shadow-xs hover:shadow-sm group"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 shrink-0 mt-0.5">
            {getCategoryIcon()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4
                className="font-semibold text-slate-800 truncate text-sm sm:text-base group-hover:text-slate-900 transition-colors cursor-pointer"
                title={task.filename}
                onClick={() => onInspect(task)}
              >
                {task.filename}
              </h4>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                {task.category}
              </span>
            </div>

            <div className="text-xs text-slate-400 truncate mt-1 flex items-center gap-2 font-mono">
              <span className="truncate max-w-md" title={task.url}>
                {task.url}
              </span>
            </div>

            <div className="mt-3 relative h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/70">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  task.status === "completed"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                    : task.status === "error"
                    ? "bg-red-500"
                    : task.status === "paused"
                    ? "bg-amber-500"
                    : task.status === "merging"
                    ? "bg-blue-500 animate-pulse"
                    : "bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500"
                }`}
                style={{ width: `${task.progress}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs font-mono text-slate-500">
              <div className="flex items-center gap-3">
                <span className="text-slate-700 font-medium">
                  {formatBytes(task.downloadedSize)} / {formatBytes(task.totalSize)}
                </span>
                <span>•</span>
                <span className="font-semibold text-slate-900">{Math.floor(task.progress)}%</span>
              </div>

              <div className="flex items-center gap-3">
                {task.status === "downloading" && (
                  <>
                    <span className="text-emerald-600 font-semibold">{formatBytes(task.speed)}/s</span>
                    {task.eta && (
                      <>
                        <span>•</span>
                        <span className="text-slate-400">ETA: {formatTime(task.eta)}</span>
                      </>
                    )}
                  </>
                )}
                {task.status === "completed" && (
                  <span className="text-emerald-700 font-medium">Downloaded</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
          <div>{getStatusBadge()}</div>

          <div className="flex items-center gap-1.5">
            {task.status === "completed" && task.category === "video" && onPlay && (
              <button
                onClick={() => onPlay(task)}
                className="px-2.5 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/90 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-2xs cursor-pointer"
                title="Putar video langsung di browser"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">Play</span>
              </button>
            )}



            {(task.status === "downloading" || task.status === "pending") && (
              <button
                onClick={() => onPause(task.id)}
                className="p-2 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
                title="Pause Download"
              >
                <Pause className="w-4 h-4 fill-current" />
              </button>
            )}

            {(task.status === "paused" || task.status === "error") && (
              <button
                onClick={() => onResume(task.id)}
                className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                title="Resume Download"
              >
                <Play className="w-4 h-4 fill-current" />
              </button>
            )}

            <button
              onClick={() => onInspect(task)}
              className="p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
              title="Inspect Properties"
            >
              <Info className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`p-2 rounded-xl transition-colors flex items-center gap-1 text-xs font-mono cursor-pointer ${
                isExpanded
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              }`}
              title="Toggle Parallel Connection Waterfall"
            >
              <Cpu className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px]">{task.numConnections}T</span>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => onDelete(task.id)}
              className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
              title="Remove Download"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <SegmentVisualizer segments={task.segments} numConnections={task.numConnections} />
      )}
    </motion.div>
  );
};
