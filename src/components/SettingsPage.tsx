import React, { useEffect, useState } from "react";
import { X, Save, Bell, FolderOpen, Radio, Wifi, Eye, Trash2, Palette, Network, Sliders } from "lucide-react";
import { AppSettings } from "../types";
import { pickFolderNative } from "../lib/utils";

interface SettingsPageProps {
  isOpen: boolean;
  initialSettings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<boolean>;
}

const QUALITY_OPTIONS = ["best", "2160p", "1440p", "1080p", "720p", "480p", "360p"];
const TABS = [
  { key: "general",       label: "General",       icon: Sliders },
  { key: "network",       label: "Networking",    icon: Network },
  { key: "quality",       label: "Quality",       icon: Eye },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "advanced",      label: "Advanced",      icon: Palette },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const BoolToggle: React.FC<{
  value: number;
  onChange: (v: number) => void;
  label: string;
  description: string;
}> = ({ value, onChange, label, description }) => (
  <div className="flex items-start justify-between gap-4 py-3.5 border-b border-subtle">
    <div className="flex-1 min-w-0">
      <div className="text-sm font-bold text-on-surface tracking-tight">{label}</div>
      <div className="text-xs text-muted mt-0.5 leading-relaxed">{description}</div>
    </div>
    <button
      type="button"
      onClick={() => onChange(value ? 0 : 1)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 border cursor-pointer ${
        value
          ? "bg-blue-600 border-blue-700 shadow-sm"
          : "bg-slate-200 border-slate-300 hover:bg-slate-300"
      }`}
      aria-pressed={Boolean(value)}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
          value ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  </div>
);

const TextInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  label: string;
  description: string;
  placeholder?: string;
  type?: string;
}> = ({ value, onChange, label, description, placeholder, type = "text" }) => (
  <div className="py-3 border-b border-subtle">
    <label className="block text-sm font-bold text-on-surface mb-1 tracking-tight">{label}</label>
    <div className="text-xs text-muted mb-2 leading-relaxed">{description}</div>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3.5 py-2.5 text-sm rounded-xl2 border border-muted bg-surface text-on-surface focus:outline-none shadow-ring focus:border-brand-400 transition-colors font-medium"
    />
  </div>
);

const NumberSlider: React.FC<{
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  label: string;
  description: string;
  zeroLabel?: string;
}> = ({ value, min, max, step, unit, onChange, label, description, zeroLabel }) => (
  <div className="py-3 border-b border-subtle">
    <div className="flex items-center justify-between mb-1.5">
      <label className="block text-sm font-bold text-on-surface tracking-tight">{label}</label>
      <span className="chip chip-brand">
        {value === 0 && zeroLabel ? zeroLabel : `${value} ${unit}`}
      </span>
    </div>
    <div className="text-xs text-muted mb-2.5 leading-relaxed">{description}</div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className="w-full accent-brand-600 h-1.5 bg-muted rounded-full appearance-none"
    />
  </div>
);

const SelectField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  description: string;
}> = ({ value, onChange, options, label, description }) => (
  <div className="py-3 border-b border-subtle">
    <label className="block text-sm font-bold text-on-surface mb-1 tracking-tight">{label}</label>
    <div className="text-xs text-muted mb-2 leading-relaxed">{description}</div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3.5 py-2.5 text-sm rounded-xl2 border border-muted bg-surface text-on-surface focus:outline-none shadow-ring focus:border-brand-400 font-semibold"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

export const SettingsPage: React.FC<SettingsPageProps> = ({ isOpen, initialSettings, onClose, onSave }) => {
  const [tab, setTab] = useState<TabKey>("general");
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const handleChooseFolder = async () => {
    setIsPickingFolder(true);
    try {
      const folder = await pickFolderNative();
      if (folder) {
        patch("defaultDownloadDir", folder);
      }
    } catch (e) {
      console.error("Choose folder error:", e);
    } finally {
      setIsPickingFolder(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSettings(initialSettings);
      setTab("general");
      setSaveError(null);
    }
  }, [isOpen, initialSettings]);

  if (!isOpen) return null;

  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const isDirty = Object.keys(settings).some(
    (k) => settings[k as keyof AppSettings] !== initialSettings[k as keyof AppSettings],
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const ok = await onSave(settings);
      if (ok) onClose();
      else setSaveError("Server gagal menyimpan pengaturan. Coba kembali.");
    } catch (e: any) {
      setSaveError(e?.message || "Terjadi kesalahan saat menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] surface-card flex flex-col overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight gradient-text-brand">Settings</h2>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Konfigurasi aplikasi disimpan permanen ke database SQLite lokal
              </p>
            </div>
            {isDirty && (
              <span
                className="chip !py-1 flex items-center gap-1.5 shrink-0"
                style={{
                  background: "var(--warning-50)",
                  color: "var(--warning-600)",
                  border: "1px solid var(--warning-500)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--warning-500)" }}
                />
                Unsaved changes
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl2 hover:bg-muted text-muted transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-52 shrink-0 border-r border-subtle p-3 bg-muted/60">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl2 text-sm mb-1 text-left transition-all ${
                    active
                      ? "bg-brand-50 text-brand-700 font-bold border border-brand-100 shadow-sm"
                      : "text-secondary hover:bg-surface hover:text-on-surface border border-transparent font-semibold"
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto p-6 scroll-soft">
            {tab === "general" && (
              <div>
                <div className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase mb-4">General</div>
                <div className="py-3.5 border-b border-subtle">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-bold text-on-surface tracking-tight">
                      Download Directory
                    </label>
                  </div>
                  <div className="text-xs text-muted mb-2.5 leading-relaxed">
                    Folder lokasi file hasil unduhan disimpan. Anda bisa langsung memilih folder lewat File Explorer atau mengetik path folder sendiri.
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={settings.defaultDownloadDir}
                      placeholder="./downloads"
                      onChange={(e) => patch("defaultDownloadDir", e.target.value)}
                      className="flex-1 px-3.5 py-2.5 text-sm rounded-xl2 border border-muted bg-surface text-on-surface focus:outline-none shadow-ring focus:border-brand-400 transition-colors font-medium font-mono text-xs sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleChooseFolder}
                      disabled={isPickingFolder}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl2 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                      title="Buka File Explorer untuk memilih folder"
                    >
                      <FolderOpen className="w-4 h-4 text-brand-600" />
                      <span>{isPickingFolder ? "Memilih..." : "Pilih Folder"}</span>
                    </button>
                  </div>
                </div>
                <NumberSlider
                  value={settings.trashRetentionDays}
                  min={1}
                  max={90}
                  step={1}
                  unit="hari"
                  onChange={(v) => patch("trashRetentionDays", v)}
                  label="Trash Retention"
                  description="Berapa lama item di tempat sampah sebelum dihapus permanen otomatis oleh sistem."
                />
                <BoolToggle
                  value={settings.autoMergeSegments}
                  onChange={(v) => patch("autoMergeSegments", v)}
                  label="Auto Merge Segments"
                  description="Secara otomatis menggabungkan potongan-potongan hasil multi-connection download setelah semua selesai."
                />
                <BoolToggle
                  value={settings.autoOptimizeMp4}
                  onChange={(v) => patch("autoOptimizeMp4", v)}
                  label="Auto Optimize MP4"
                  description="Jalankan ffmpeg faststart pada file MP4 supaya kompatibel diputar di browser (moov atom dipindahkan ke depan)."
                />
              </div>
            )}

            {tab === "network" && (
              <div>
                <div className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase mb-4">Networking</div>
                <NumberSlider
                  value={settings.maxConcurrentDownloads}
                  min={1}
                  max={16}
                  step={1}
                  unit="tugas"
                  onChange={(v) => patch("maxConcurrentDownloads", v)}
                  label="Concurrent Downloads"
                  description="Jumlah maksimal task download yang berjalan paralel bersamaan. Meningkatkan nilai ini mempercepat banyak task kecil tapi membebani CPU/RAM."
                />
                <NumberSlider
                  value={settings.defaultConnections}
                  min={1}
                  max={32}
                  step={1}
                  unit="conn"
                  onChange={(v) => patch("defaultConnections", v)}
                  label="Default Connections / Task"
                  description="Jumlah paralel HTTP connection per download (Range requests). Jumlah optimal 8-16 untuk file besar."
                />
                <NumberSlider
                  value={settings.maxBandwidthKbps}
                  min={0}
                  max={100000}
                  step={100}
                  unit="KB/s"
                  onChange={(v) => patch("maxBandwidthKbps", v)}
                  label="Global Bandwidth Limit"
                  description="Batasi kecepatan transfer keseluruhan (0 = unlimited). Berguna ketika aplikasi dipakai di jaringan bersama."
                  zeroLabel="Unlimited"
                />
              </div>
            )}

            {tab === "quality" && (
              <div>
                <div className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase mb-4">Quality & Engines</div>
                <SelectField
                  value={settings.defaultVideoQuality}
                  onChange={(v) => patch("defaultVideoQuality", v)}
                  options={QUALITY_OPTIONS.map((q) => ({ value: q, label: q === "best" ? "Best Available" : q }))}
                  label="Default Video Quality"
                  description="Kualitas pilihan utama untuk YouTube / Vimeo / platform lain yang menyediakan multiple resolution."
                />
                <TextInput
                  value={settings.youtubeCookiePath}
                  onChange={(v) => patch("youtubeCookiePath", v)}
                  label="YouTube cookies.txt Path"
                  description="Path absolut ke file Netscape cookies.txt (export dari browser). Dibutuhkan untuk konten usia terbatas atau jika IP server terblokir oleh YouTube."
                  placeholder="C:/Users/name/Downloads/youtube_cookies.txt"
                />
                <TextInput
                  value={settings.instagramCookieHeader}
                  onChange={(v) => patch("instagramCookieHeader", v)}
                  label="Instagram Cookie (raw header)"
                  description="Nilai header Cookie mentah (copy dari DevTools Network tab). Dibutuhkan untuk download reel/story Instagram yang tidak public."
                  placeholder="sessionid=xxx; ds_user_id=yyy; csrftoken=zzz..."
                />
              </div>
            )}

            {tab === "notifications" && (
              <div>
                <div className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase mb-4">Notifications</div>
                <BoolToggle
                  value={settings.enableBrowserNotifications}
                  onChange={(v) => patch("enableBrowserNotifications", v)}
                  label="Browser Notifications"
                  description="Gunakan Web Notification API browser untuk notifikasi desktop ketika download selesai. Membutuhkan izin browser."
                />
                <BoolToggle
                  value={settings.notificationsEnabled}
                  onChange={(v) => patch("notificationsEnabled", v)}
                  label="In-App Toasts & Audio"
                  description="Tampilkan notifikasi toast di dalam aplikasi + suara beep untuk event penting (selesai/gagal)."
                />
              </div>
            )}

            {tab === "advanced" && (
              <div>
                <div className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase mb-4">Advanced</div>
                <div className="rounded-2xl border border-warning-100 bg-warning-50/80 p-4 mb-5">
                  <div className="flex items-start gap-2.5">
                    <Radio className="w-4.5 h-4.5 text-warning-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-warning-700 tracking-tight">Advanced / Experimental</div>
                      <div className="text-xs text-warning-600 mt-1 leading-relaxed">
                        Pengaturan di bawah hanya informasi engine. Pengaturan tema warna diseragamkan (Light Only) secara permanen agar tampilan profesional konsisten.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {[
                    {
                      icon: Wifi, title: "Engines Used",
                      desc: "yt-dlp (universal 1000+ sites) • play-dl (YouTube) • axios (HTTP direct) • ffmpeg (merge/optimize).",
                      status: "Active", statusChip: "chip-success",
                    },
                    {
                      icon: FolderOpen, title: "Data Store",
                      desc: "SQLite WAL tasks / settings / event_log tables with debounce 5s bulk transaction.",
                      status: "WAL Mode", statusChip: "chip-brand",
                    },
                    {
                      icon: Trash2, title: "Soft Delete System",
                      desc: `Task dihapus masuk ke Trash (marked deleted_at) selama ${settings.trashRetentionDays} hari, lalu di-purge otomatis.`,
                      status: "Enabled", statusChip: "chip-success",
                    },
                    {
                      icon: Palette, title: "Theme Mode",
                      desc: "Light Only premium world-class UI — consistent white surface + indigo accent + emerald positive states.",
                      status: "Light Only", statusChip: "chip-brand",
                    },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={i} className="surface-card !shadow-none !rounded-[12px] !p-4 border border-subtle !border-muted">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 flex items-start gap-2.5">
                            <div className="p-2 rounded-xl bg-muted text-brand-700 shrink-0 mt-0.5">
                              <Icon className="w-4.5 h-4.5" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-on-surface tracking-tight">{item.title}</div>
                              <div className="text-xs text-muted mt-0.5 leading-relaxed">{item.desc}</div>
                            </div>
                          </div>
                          <span className={`chip ${item.statusChip} shrink-0 mt-1`}>{item.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-subtle bg-muted/50 shrink-0 min-h-[72px]">
          <div className="flex items-center gap-3 min-w-0">
            {saveError ? (
              <span
                className="text-xs font-semibold chip !py-1 flex items-center gap-1.5"
                style={{ background: "var(--danger-50)", color: "var(--danger-600)", border: "1px solid var(--danger-500)" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                  style={{ background: "var(--danger-500)" }}
                />
                {saveError}
              </span>
            ) : isDirty ? (
              <span
                className="text-xs font-semibold chip !py-1 flex items-center gap-1.5"
                style={{ background: "var(--warning-50)", color: "var(--warning-600)", border: "1px solid var(--warning-500)" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                  style={{ background: "var(--warning-500)" }}
                />
                {saving ? "Menyimpan..." : "Perubahan belum disimpan — klik Save untuk permanen"}
              </span>
            ) : (
              <span
                className="text-xs font-semibold chip !py-1 flex items-center gap-1.5"
                style={{ background: "var(--success-50)", color: "var(--success-600)", border: "1px solid var(--success-500)" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "var(--success-500)" }}
                />
                Semua pengaturan tersimpan
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold rounded-xl2 inline-flex items-center justify-center transition-colors shrink-0 min-w-[96px]"
              style={{
                color: "var(--text-secondary)",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-muted)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl2 inline-flex items-center justify-center gap-2 transition-all shrink-0 min-w-[160px]"
              style={{
                color: "#ffffff",
                background: saving || !isDirty ? "var(--brand-300, #a5b4fc)" : "var(--brand-600)",
                border: `1px solid ${saving || !isDirty ? "var(--brand-200, #c7d2fe)" : "rgba(67,56,202,0.55)"}`,
                boxShadow: "0 0 0 4px rgba(99,102,241,0.10)",
                cursor: saving || !isDirty ? "not-allowed" : "pointer",
                opacity: saving || !isDirty ? 0.85 : 1,
                transform: saving ? "translateY(0)" : undefined,
              }}
              onMouseEnter={(e) => {
                if (!(saving || !isDirty)) {
                  (e.currentTarget as HTMLElement).style.background = "var(--brand-700)";
                }
              }}
              onMouseLeave={(e) => {
                if (!(saving || !isDirty)) {
                  (e.currentTarget as HTMLElement).style.background = "var(--brand-600)";
                }
              }}
            >
              <Save className="w-4 h-4 shrink-0" />
              <span className="shrink-0 whitespace-nowrap">
                {saving ? "Saving..." : isDirty ? "Save Changes" : "Saved ✓"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
