"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface VideoInfo {
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

const HISTORY_KEY = "vibestream_video_history_v1";
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
        className={`w-2 bg-gradient-to-t from-pink-500 to-red-500 rounded-full equalizer-bar-${i}`}
        style={{ minHeight: "4px" }}
      />
    ))}
  </div>
);

// Video Resolution Options
const resolutionOptions = [
  { value: "360", label: "360p", desc: "Low Quality" },
  { value: "480", label: "480p", desc: "Standard" },
  { value: "720", label: "720p HD", desc: "Recommended" },
  { value: "1080", label: "1080p FHD", desc: "High Quality" },
  { value: "best", label: "Best", desc: "Highest Available" },
];

export default function VideoPage() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [videoResolution, setVideoResolution] = useState<"360" | "480" | "720" | "1080" | "best">("720");
  const [showFallback, setShowFallback] = useState(false);

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
    setVideoInfo(null);
    setShowFallback(false);

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
      const data: VideoInfo = await res.json();
      setVideoInfo(data);
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
    setDownloadStatus(`📹 Downloading ${videoResolution === "best" ? "best quality" : videoResolution + "p"} video...`);

    try {
      const downloadUrl = videoInfo?.url || url;
      const queryParams = `url=${encodeURIComponent(downloadUrl)}&resolution=${videoResolution}`;

      const res = await fetch(`${API_BASE}/download-video?${queryParams}`);

      if (!res.ok) {
        let errorMessage = "Video download failed";
        try {
          const data = await res.json();
          errorMessage = data.detail || errorMessage;
        } catch {
          errorMessage = `Server error (${res.status}): ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      setDownloadStatus("Download complete! Saving video...");

      const blob = await res.blob();
      const filename = videoInfo?.title?.replace(/[\\/*?:"<>|]/g, "") || "video";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}_${videoResolution}p.mp4`;
      link.click();
      URL.revokeObjectURL(link.href);

      addToHistory({
        url: url.trim(),
        title: videoInfo?.title || filename,
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

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Animated Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950" />
        
        {/* Video-themed gradient orbs - more red/orange tones */}
        <div 
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-70"
          style={{
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 0%, rgba(239, 68, 68, 0) 70%)',
            animation: 'float 8s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(249, 115, 22, 0.4) 0%, rgba(249, 115, 22, 0) 70%)',
            animation: 'floatReverse 10s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full opacity-50"
          style={{
            background: 'radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, rgba(236, 72, 153, 0) 70%)',
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
            <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-medium text-red-300 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
              </span>
              Video Hub • Beta
            </span>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="mt-6 bg-gradient-to-r from-white via-red-200 to-orange-200 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl lg:text-7xl"
          >
            VibeStream
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text"> Video</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-4 max-w-md text-gray-400"
          >
            Download videos in HD from YouTube, TikTok, Instagram, Twitter & 1000+ sites.
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
              <div className={`relative transition-all duration-500 ${isSearchFocused ? 'rounded-2xl shadow-lg shadow-red-500/20' : ''}`}>
                <div className="flex w-full flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                      <svg className={`h-5 w-5 transition-colors ${isSearchFocused ? 'text-red-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                      className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-white placeholder:text-gray-500 backdrop-blur-sm transition-all focus:border-red-500/50 focus:bg-white/10 focus:outline-none"
                    />
                  </div>
                  <motion.button
                    suppressHydrationWarning
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAnalyze}
                    disabled={loading || !url.trim()}
                    className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 px-8 py-4 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="relative z-10">
                      {loading ? "Analyzing..." : "Analyze"}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-orange-500 opacity-0 transition-opacity group-hover:opacity-100" />
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
                  <p className="text-sm text-gray-400">Fetching video info...</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Video Card */}
            <AnimatePresence>
              {videoInfo && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md"
                >
                  {videoInfo.thumbnail && (
                    <div className="relative">
                      <img
                        src={videoInfo.thumbnail}
                        alt={videoInfo.title}
                        className="h-56 w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent" />
                      {/* Duration badge */}
                      <div className="absolute bottom-4 right-4 rounded-lg bg-black/60 px-2 py-1 text-sm font-medium text-white backdrop-blur-sm">
                        🎬 {videoInfo.duration_str}
                      </div>
                    </div>
                  )}
                  <div className="p-5 sm:p-6">
                    <motion.h2
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-lg font-bold text-white sm:text-xl line-clamp-2"
                    >
                      {videoInfo.title}
                    </motion.h2>
                    {videoInfo.uploader && (
                      <p className="mt-1 text-sm text-gray-400">
                        {videoInfo.uploader}
                      </p>
                    )}

                    {/* Resolution Selector */}
                    <div className="mt-5">
                      <label className="mb-2 block text-xs font-medium text-gray-400 uppercase tracking-wide">
                        Video Quality
                      </label>
                      <div className="grid grid-cols-5 gap-2">
                        {resolutionOptions.map((option) => (
                          <motion.button
                            key={option.value}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setVideoResolution(option.value as typeof videoResolution)}
                            className={`rounded-xl border px-3 py-2.5 text-center transition-all ${
                              videoResolution === option.value
                                ? "border-red-500/50 bg-red-500/20 text-red-300"
                                : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:bg-white/10"
                            }`}
                          >
                            <div className="text-sm font-semibold">{option.label}</div>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Download Button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleDownload}
                      disabled={downloading}
                      className="mt-6 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 via-orange-600 to-red-600 bg-[size:200%] py-4 font-bold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-red-500/40 disabled:cursor-wait disabled:opacity-70"
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
                          {downloadStatus || "Processing..."}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download MP4 ({videoResolution === "best" ? "Best" : videoResolution + "p"})
                        </span>
                      )}
                    </motion.button>
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
                    ⚠️ YouTube is currently blocking third-party services.
                  </p>
                  <p className="mt-1 text-xs text-amber-300/70">
                    Try again later or use yt-dlp locally for best results.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
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
            <h3 className="mb-4 text-sm font-medium text-gray-400">Recent Downloads</h3>
            <div className="space-y-2">
              {history.map((item) => (
                <motion.button
                  key={item.at}
                  whileHover={{ scale: 1.01, x: 4 }}
                  onClick={() => {
                    setUrl(item.url);
                    handleAnalyze();
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left backdrop-blur-sm transition hover:border-red-500/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/20 text-red-400">
                      🎬
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
