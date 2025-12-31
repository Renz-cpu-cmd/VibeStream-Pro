"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "@/context/PlayerContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AudioInfo {
  title: string;
  thumbnail: string | null;
  duration: number | null;
  duration_str: string;
  url: string | null;
  uploader: string | null;
}

type HistoryItem = {
  url: string;
  title: string;
  at: number;
};

const HISTORY_KEY = "vibestream_mp3_history_v1";
const HISTORY_LIMIT = 5;

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

// Equalizer Loading Component
const EqualizerLoader = () => (
  <div className="flex items-end justify-center gap-1 h-12">
    {[1, 2, 3, 4, 5].map((i) => (
      <motion.div
        key={i}
        className={`w-2 bg-gradient-to-t from-emerald-500 to-cyan-500 rounded-full equalizer-bar-${i}`}
        style={{ minHeight: "4px" }}
      />
    ))}
  </div>
);

// Audio Quality Options
const qualityOptions = [
  { value: "64", label: "64 kbps", desc: "Low" },
  { value: "128", label: "128 kbps", desc: "Standard" },
  { value: "192", label: "192 kbps", desc: "High" },
  { value: "256", label: "256 kbps", desc: "Very High" },
  { value: "320", label: "320 kbps", desc: "Maximum" },
];

export default function MP3Page() {
  const [url, setUrl] = useState("");
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [audioQuality, setAudioQuality] = useState<"64" | "128" | "192" | "256" | "320">("192");
  const [showFallback, setShowFallback] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const { playSong } = usePlayer();

  const canUseLocalStorage = useMemo(() => {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  }, []);

  useEffect(() => {
    if (!canUseLocalStorage) return;
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const cleaned: HistoryItem[] = parsed
        .filter(
          (x): x is HistoryItem =>
            Boolean(x) &&
            typeof (x as HistoryItem).url === "string" &&
            typeof (x as HistoryItem).title === "string" &&
            typeof (x as HistoryItem).at === "number"
        )
        .slice(0, HISTORY_LIMIT);
      setHistory(cleaned);
    } catch {
      // ignore corrupted history
    }
  }, [canUseLocalStorage]);

  const writeHistory = (items: HistoryItem[]) => {
    setHistory(items);
    if (!canUseLocalStorage) return;
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
    } catch {
      // ignore quota/errors
    }
  };

  const addToHistory = (item: Omit<HistoryItem, "at">) => {
    const next: HistoryItem[] = [
      { ...item, at: Date.now() },
      ...history.filter((h) => !(h.url === item.url)),
    ].slice(0, HISTORY_LIMIT);
    writeHistory(next);
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setAudioInfo(null);
    setShowFallback(false);
    setPreviewUrl(null);

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to analyze");
      }
      const data: AudioInfo = await res.json();
      setAudioInfo(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!url.trim()) return;
    setDownloading(true);
    setError(null);
    setDownloadStatus(`🎵 Converting to ${audioQuality} kbps MP3...`);

    try {
      const downloadUrl = audioInfo?.url || url;
      const queryParams = `url=${encodeURIComponent(downloadUrl)}&quality=${audioQuality}`;

      const res = await fetch(`${API_BASE}/download?${queryParams}`);

      if (!res.ok) {
        let errorMessage = "MP3 conversion failed";
        try {
          const data = await res.json();
          errorMessage = data.detail || errorMessage;
        } catch {
          errorMessage = `Server error (${res.status}): ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      setDownloadStatus("Conversion complete! Saving MP3...");

      const blob = await res.blob();
      const filename = audioInfo?.title?.replace(/[\\/*?:"<>|]/g, "") || "audio";
      
      // Create download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.mp3`;
      link.click();
      
      // Also create a preview URL for the player
      setPreviewUrl(URL.createObjectURL(blob));

      addToHistory({
        url: url.trim(),
        title: audioInfo?.title || filename,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Download failed";
      setError(errorMsg);
      if (errorMsg.includes("Download failed") || errorMsg.includes("500") || errorMsg.includes("blocking") || errorMsg.includes("bot")) {
        setShowFallback(true);
      }
    } finally {
      setDownloading(false);
      setDownloadStatus("");
    }
  };

  const handlePlayPreview = () => {
    if (previewUrl && audioInfo) {
      playSong({
        id: `mp3-${Date.now()}`,
        title: audioInfo.title,
        artist: audioInfo.uploader || "Unknown Artist",
        duration: audioInfo.duration || 0,
        durationStr: audioInfo.duration_str,
        thumbnail: audioInfo.thumbnail,
        audioBlob: new Blob(), // Not stored, just for type compatibility
        audioUrl: previewUrl,
        downloadedAt: Date.now(),
        url: url,
        mode: "standard",
        fileSize: 0,
      });
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Animated Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950" />
        
        {/* MP3-themed gradient orbs - emerald/cyan tones */}
        <div 
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-70"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.5) 0%, rgba(16, 185, 129, 0) 70%)',
            animation: 'float 8s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, rgba(6, 182, 212, 0) 70%)',
            animation: 'floatReverse 10s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full opacity-50"
          style={{
            background: 'radial-gradient(circle, rgba(20, 184, 166, 0.4) 0%, rgba(20, 184, 166, 0) 70%)',
            animation: 'float 12s ease-in-out infinite',
          }}
        />
        
        {/* Subtle grid overlay */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
            backgroundSize: "50px 50px",
          }}
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/20" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 py-12">
        {/* Hero Section */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="w-full text-center"
        >
          {/* Logo/Title */}
          <motion.div variants={fadeInUp} className="mb-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              MP3 Converter • Pro
            </span>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="mt-6 bg-gradient-to-r from-white via-emerald-200 to-cyan-200 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl lg:text-7xl"
          >
            VibeStream
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text"> MP3</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-4 max-w-md text-gray-400"
          >
            Convert videos to high-quality MP3 from YouTube, TikTok, Instagram, Twitter & more.
          </motion.p>
        </motion.div>

        {/* Main Glass Card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 w-full"
        >
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            {/* Search Bar */}
            <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="relative">
              <div className={`relative transition-all duration-500 ${isSearchFocused ? 'rounded-2xl shadow-lg shadow-emerald-500/20' : ''}`}>
                <div className="flex w-full flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                      <svg className={`h-5 w-5 transition-colors ${isSearchFocused ? 'text-emerald-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                    <input
                      suppressHydrationWarning
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => setIsSearchFocused(false)}
                      onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                      placeholder="Paste any video URL (YouTube, TikTok, Instagram...)"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-white placeholder:text-gray-500 backdrop-blur-sm transition-all focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none"
                    />
                  </div>
                  <motion.button
                    suppressHydrationWarning
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAnalyze}
                    disabled={loading || !url.trim()}
                    className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-8 py-4 font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="relative z-10">
                      {loading ? "Analyzing..." : "Analyze"}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                  </motion.button>
                </div>
              </div>
            </motion.div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-5 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-center text-sm text-red-200 backdrop-blur-sm"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Equalizer Loading Animation */}
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-8 flex flex-col items-center gap-4"
                >
                  <EqualizerLoader />
                  <p className="text-sm text-gray-400">Fetching audio info...</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Audio Card */}
            <AnimatePresence>
              {audioInfo && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md"
                >
                  <div className="flex flex-col sm:flex-row">
                    {/* Thumbnail */}
                    {audioInfo.thumbnail && (
                      <div className="relative sm:w-48 shrink-0">
                        <img
                          src={audioInfo.thumbnail}
                          alt={audioInfo.title}
                          className="h-48 w-full object-cover sm:h-full"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-gray-900/80 hidden sm:block" />
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent sm:hidden" />
                        {/* Music icon overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full bg-emerald-500/20 p-4 backdrop-blur-sm">
                            <svg className="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex-1 p-5 sm:p-6">
                      <motion.h2
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-lg font-bold text-white sm:text-xl line-clamp-2"
                      >
                        {audioInfo.title}
                      </motion.h2>
                      {audioInfo.uploader && (
                        <p className="mt-1 text-sm text-gray-400">
                          {audioInfo.uploader}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {audioInfo.duration_str}
                        </span>
                        <span className="text-emerald-400">MP3</span>
                      </div>

                      {/* Quality Selector */}
                      <div className="mt-5">
                        <label className="mb-2 block text-xs font-medium text-gray-400 uppercase tracking-wide">
                          Audio Quality (Bitrate)
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                          {qualityOptions.map((option) => (
                            <motion.button
                              key={option.value}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setAudioQuality(option.value as typeof audioQuality)}
                              className={`rounded-xl border px-2 py-2.5 text-center transition-all ${
                                audioQuality === option.value
                                  ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                                  : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:bg-white/10"
                              }`}
                            >
                              <div className="text-xs font-semibold">{option.label}</div>
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      {/* Download & Play Buttons */}
                      <div className="mt-6 flex gap-3">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleDownload}
                          disabled={downloading}
                          className="flex-1 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-cyan-600 to-emerald-600 bg-[size:200%] py-4 font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 disabled:cursor-wait disabled:opacity-70"
                          style={{
                            animation: downloading ? "gradient-shift 2s linear infinite" : "none",
                          }}
                        >
                          {downloading ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              {downloadStatus || "Converting..."}
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download MP3 ({audioQuality} kbps)
                            </span>
                          )}
                        </motion.button>

                        {/* Play in MiniPlayer button - only show after download */}
                        {previewUrl && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handlePlayPreview}
                            className="rounded-2xl border border-emerald-500/30 bg-emerald-500/20 px-5 py-4 text-emerald-300 transition-all hover:bg-emerald-500/30"
                          >
                            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Fallback Notice */}
            <AnimatePresence>
              {showFallback && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-5 rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-center backdrop-blur-sm"
                >
                  <p className="text-sm text-amber-200">
                    ⚠️ This platform may be blocking third-party services.
                  </p>
                  <p className="mt-1 text-xs text-amber-300/70">
                    Try again later, use a different link, or run locally for best results.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Feature Cards */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 grid grid-cols-3 gap-3"
            >
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="text-xs font-medium text-gray-300">1000+</div>
                <div className="text-xs text-gray-500">Sites Supported</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div className="text-xs font-medium text-gray-300">320 kbps</div>
                <div className="text-xs text-gray-500">Max Quality</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/20 text-teal-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-xs font-medium text-gray-300">No Limit</div>
                <div className="text-xs text-gray-500">Free Forever</div>
              </div>
            </motion.div>

            {/* Supported Platforms */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-6 text-center"
            >
              <p className="text-xs text-gray-500 mb-2">Supported Platforms</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["YouTube", "TikTok", "Instagram", "Twitter/X", "Facebook", "SoundCloud", "Vimeo", "Dailymotion"].map((platform) => (
                  <span
                    key={platform}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-400"
                  >
                    {platform}
                  </span>
                ))}
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                  +1000 more
                </span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Recent History */}
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 w-full"
          >
            <h3 className="mb-4 text-sm font-medium text-gray-400">Recent Conversions</h3>
            <div className="space-y-2">
              {history.map((item) => (
                <motion.button
                  key={item.at}
                  whileHover={{ scale: 1.01, x: 4 }}
                  onClick={() => {
                    setUrl(item.url);
                    handleAnalyze();
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left backdrop-blur-sm transition hover:border-emerald-500/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                      🎵
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{item.title}</div>
                      <div className="truncate text-xs text-gray-500">{item.url}</div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
