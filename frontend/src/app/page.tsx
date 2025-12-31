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

const HISTORY_KEY = "vibestream_history_v1";
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

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
};

const slideInFromLeft = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0 },
};

// Equalizer Loading Component
const EqualizerLoader = () => (
  <div className="flex items-end justify-center gap-1 h-12">
    {[1, 2, 3, 4, 5].map((i) => (
      <motion.div
        key={i}
        className={`w-2 bg-gradient-to-t from-purple-500 to-pink-500 rounded-full equalizer-bar-${i}`}
        style={{ minHeight: "4px" }}
      />
    ))}
  </div>
);

// Maintenance Mode Card Component
const MaintenanceCard = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/40 to-orange-950/40 p-6 backdrop-blur-xl animate-maintenance-pulse"
  >
    {/* Animated background glow */}
    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 animate-gradient" />
    
    <div className="relative flex items-center gap-4">
      <div className="flex-shrink-0">
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-4xl"
        >
          🔧
        </motion.div>
      </div>
      <div>
        <h3 className="text-lg font-bold text-amber-200">
          YouTube Engine: Under Maintenance
        </h3>
        <p className="mt-1 text-sm text-amber-100/70">
          YouTube is blocking all third-party services globally. We&apos;re monitoring for solutions.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="https://github.com/yt-dlp/yt-dlp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/30"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Use yt-dlp locally
          </a>
          <a
            href="https://github.com/yt-dlp/yt-dlp/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/20"
          >
            📢 Follow updates
          </a>
        </div>
      </div>
    </div>
  </motion.div>
);

// Music History Card Component
const HistoryCard = ({ item, onClick }: { item: HistoryItem; onClick: () => void }) => (
  <motion.button
    variants={slideInFromLeft}
    whileHover={{ scale: 1.02, y: -4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="group relative w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r from-white/5 to-white/[0.02] p-4 text-left backdrop-blur-md transition-all duration-300 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/10"
    title={item.url}
  >
    {/* Hover glow effect */}
    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-pink-500/0 opacity-0 transition-opacity group-hover:opacity-100" />
    
    <div className="relative flex items-center gap-4">
      {/* Music icon */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-400">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white group-hover:text-purple-200 transition-colors">
          {item.title}
        </div>
        <div className="mt-0.5 truncate text-xs text-gray-500">{item.url}</div>
      </div>
      
      <div className="flex-shrink-0 text-xs text-gray-600">
        {new Date(item.at).toLocaleDateString()}
      </div>
      
      {/* Play icon on hover */}
      <div className="absolute right-4 flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 text-white opacity-0 transition-all group-hover:opacity-100">
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>
    </div>
  </motion.button>
);

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audioMode, setAudioMode] = useState<"standard" | "minus_one" | "bass_boost" | "nightcore">("standard");
  const [enableTrim, setEnableTrim] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [showFallback, setShowFallback] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  // New: Tab switcher state (audio vs video)
  const [activeTab, setActiveTab] = useState<"audio" | "video">("audio");
  const [videoResolution, setVideoResolution] = useState<"360" | "480" | "720" | "1080" | "best">("720");

  const PAYMENT_NUMBER = "09543718983";

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

  const copyPaymentNumber = async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT_NUMBER.replace(/-/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = PAYMENT_NUMBER.replace(/-/g, "");
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setVideoInfo(null);
    setShowFallback(false);
    setEnableTrim(false);
    setStartTime(0);
    setEndTime(0);

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
      if (data.duration) {
        setEndTime(data.duration);
      }
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

    // Different handling for audio vs video
    if (activeTab === "video") {
      // VIDEO DOWNLOAD
      setDownloadStatus(`📹 Downloading ${videoResolution}p video...`);
      
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
      return;
    }

    // AUDIO DOWNLOAD (existing logic)
    const modeMessages: Record<string, string> = {
      standard: enableTrim ? "✂️ Trimming & converting..." : "Converting to MP3...",
      minus_one: "🎤 AI is removing vocals... This may take 1-2 minutes.",
      bass_boost: "🔊 Boosting the bass...",
      nightcore: "⚡ Creating nightcore version...",
    };
    setDownloadStatus(modeMessages[audioMode] || "Processing...");

    try {
      const downloadUrl = videoInfo?.url || url;
      let queryParams = `url=${encodeURIComponent(downloadUrl)}&mode=${audioMode}`;
      if (enableTrim && startTime < endTime) {
        queryParams += `&start_time=${startTime}&end_time=${endTime}`;
      }
      
      const res = await fetch(`${API_BASE}/download?${queryParams}`);

      if (!res.ok) {
        let errorMessage = "Download failed";
        try {
          const data = await res.json();
          errorMessage = data.detail || errorMessage;
        } catch {
          errorMessage = `Server error (${res.status}): ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      setDownloadStatus("Download complete! Saving file...");

      const blob = await res.blob();
      const filename = videoInfo?.title?.replace(/[\\/*?:"<>|]/g, "") || "audio";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.mp3`;
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
        {/* Base dark gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950" />
        
        {/* Animated gradient orbs - more vibrant colors */}
        <div 
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-70"
          style={{
            background: 'radial-gradient(circle, rgba(147, 51, 234, 0.5) 0%, rgba(147, 51, 234, 0) 70%)',
            animation: 'float 8s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, rgba(236, 72, 153, 0) 70%)',
            animation: 'floatReverse 10s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full opacity-50"
          style={{
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, rgba(6, 182, 212, 0) 70%)',
            animation: 'float 12s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute bottom-1/3 left-1/4 h-[350px] w-[350px] rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, rgba(16, 185, 129, 0) 70%)',
            animation: 'pulse-glow 3s ease-in-out infinite',
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
        
        {/* Gradient noise/grain overlay for texture */}
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
            <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-xs font-medium text-purple-300 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-500"></span>
              </span>
              Music Hub • Beta
            </span>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="mt-6 bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl lg:text-7xl"
          >
            VibeStream
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text"> Pro</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-4 max-w-md text-gray-400"
          >
            Premium audio conversion platform. Search, convert, and download your favorite music.
          </motion.p>
        </motion.div>

        {/* Main Glass Card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 w-full"
        >
          <div className="glass-card rounded-3xl p-6 sm:p-8">
            {/* Search Bar with Glow Effect */}
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              className="relative"
            >
              <div className={`relative transition-all duration-500 ${isSearchFocused ? 'animate-search-glow rounded-2xl' : ''}`}>
                <div className="flex w-full flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                      <svg className={`h-5 w-5 transition-colors ${isSearchFocused ? 'text-purple-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
                      placeholder="Search for any song or paste a URL..."
                      className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-white placeholder:text-gray-500 backdrop-blur-sm transition-all focus:border-purple-500/50 focus:bg-white/10 focus:outline-none"
                    />
                  </div>
                  <motion.button
                    suppressHydrationWarning
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAnalyze}
                    disabled={loading || !url.trim()}
                    className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-4 font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:shadow-purple-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="relative z-10">
                      {loading ? "Searching..." : "Search"}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 transition-opacity group-hover:opacity-100" />
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
                  <p className="text-sm text-gray-400">Fetching track info...</p>
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
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/50 to-transparent" />
                      {/* Duration badge */}
                      <div className="absolute bottom-4 right-4 rounded-lg bg-black/60 px-2 py-1 text-sm font-medium text-white backdrop-blur-sm">
                        {videoInfo.duration_str}
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

                    {/* Tab Switcher: Audio vs Video */}
                    <div className="mt-5">
                      <div className="relative flex rounded-xl border border-white/10 bg-white/5 p-1">
                        {/* Sliding background */}
                        <motion.div
                          className="absolute top-1 bottom-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600"
                          initial={false}
                          animate={{
                            left: activeTab === "audio" ? "4px" : "50%",
                            right: activeTab === "audio" ? "50%" : "4px",
                          }}
                          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                        />
                        <button
                          onClick={() => setActiveTab("audio")}
                          className={`relative z-10 flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                            activeTab === "audio" ? "text-white" : "text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          <span>🎵</span>
                          <span>Audio (MP3)</span>
                        </button>
                        <button
                          onClick={() => setActiveTab("video")}
                          className={`relative z-10 flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                            activeTab === "video" ? "text-white" : "text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          <span>🎬</span>
                          <span>Video (MP4)</span>
                        </button>
                      </div>
                    </div>

                    {/* Content based on active tab */}
                    <AnimatePresence mode="wait">
                      {activeTab === "audio" ? (
                        <motion.div
                          key="audio-options"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ duration: 0.3 }}
                        >
                          {/* Audio Processing Options */}
                          <motion.div
                            variants={staggerContainer}
                            initial="hidden"
                            animate="visible"
                            className="mt-5"
                          >
                            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                              🎛️ Audio Mode
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { value: "standard", label: "Standard", icon: "🎵", desc: "Original audio" },
                                { value: "minus_one", label: "Minus One", icon: "🎤", desc: "AI vocal removal" },
                                { value: "bass_boost", label: "Bass Boost", icon: "🔊", desc: "+10dB bass" },
                                { value: "nightcore", label: "Nightcore", icon: "⚡", desc: "1.25x + pitch" },
                              ].map((mode) => (
                                <motion.button
                                  key={mode.value}
                                  variants={scaleIn}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => setAudioMode(mode.value as typeof audioMode)}
                                  disabled={downloading}
                                  className={`flex flex-col items-center rounded-xl border p-3 text-center transition-all ${
                                    audioMode === mode.value
                                      ? "border-purple-500/50 bg-purple-500/20 text-white shadow-lg shadow-purple-500/20"
                                      : "border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10"
                                  } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                  <span className="text-xl">{mode.icon}</span>
                                  <span className="mt-1 text-xs font-semibold">{mode.label}</span>
                                  <span className="text-[10px] text-gray-500">{mode.desc}</span>
                                </motion.button>
                              ))}
                            </div>
                          </motion.div>

                          {/* Trim Controls */}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="mt-4"
                          >
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={enableTrim}
                                onChange={(e) => setEnableTrim(e.target.checked)}
                                disabled={downloading}
                                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                              />
                              <span className="text-xs font-medium text-gray-400">
                                ✂️ Trim Audio
                              </span>
                            </label>
                            
                            <AnimatePresence>
                              {enableTrim && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="mt-3 flex gap-3 overflow-hidden"
                                >
                                  <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">Start (sec)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={videoInfo.duration || 9999}
                                      value={startTime}
                                      onChange={(e) => setStartTime(Math.max(0, Number(e.target.value)))}
                                      disabled={downloading}
                                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">End (sec)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={videoInfo.duration || 9999}
                                      value={endTime}
                                      onChange={(e) => setEndTime(Math.min(videoInfo.duration || 9999, Number(e.target.value)))}
                                      disabled={downloading}
                                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
                                    />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="video-options"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.3 }}
                          className="mt-5"
                        >
                          {/* Video Resolution Options */}
                          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                            📺 Video Resolution
                          </p>
                          <div className="grid grid-cols-5 gap-2">
                            {[
                              { value: "360", label: "360p", desc: "Low" },
                              { value: "480", label: "480p", desc: "SD" },
                              { value: "720", label: "720p", desc: "HD" },
                              { value: "1080", label: "1080p", desc: "FHD" },
                              { value: "best", label: "Best", desc: "Max" },
                            ].map((res) => (
                              <motion.button
                                key={res.value}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setVideoResolution(res.value as typeof videoResolution)}
                                disabled={downloading}
                                className={`flex flex-col items-center rounded-xl border p-3 text-center transition-all ${
                                  videoResolution === res.value
                                    ? "border-pink-500/50 bg-pink-500/20 text-white shadow-lg shadow-pink-500/20"
                                    : "border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10"
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                              >
                                <span className="text-sm font-bold">{res.label}</span>
                                <span className="text-[10px] text-gray-500">{res.desc}</span>
                              </motion.button>
                            ))}
                          </div>
                          <p className="mt-3 text-xs text-gray-500 text-center">
                            Higher resolution = larger file size & longer download time
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Download Button */}
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleDownload}
                      disabled={downloading || (activeTab === "audio" && enableTrim && startTime >= endTime)}
                      className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-4 font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        activeTab === "audio" 
                          ? "bg-gradient-to-r from-emerald-500 to-green-500 shadow-emerald-500/25 hover:shadow-emerald-500/40"
                          : "bg-gradient-to-r from-pink-500 to-rose-500 shadow-pink-500/25 hover:shadow-pink-500/40"
                      }`}
                    >
                      {downloading ? (
                        <>
                          <EqualizerLoader />
                        </>
                      ) : (
                        <>
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                          </svg>
                          {activeTab === "audio" ? "Download MP3" : `Download MP4 (${videoResolution === "best" ? "Best" : videoResolution + "p"})`}
                        </>
                      )}
                    </motion.button>

                    {/* Download Status */}
                    <AnimatePresence>
                      {downloading && downloadStatus && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={`mt-3 text-center text-sm ${activeTab === "audio" ? "text-emerald-300" : "text-pink-300"}`}
                        >
                          {downloadStatus}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Maintenance Notice */}
                    <AnimatePresence>
                      {showFallback && !downloading && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="mt-5"
                        >
                          <MaintenanceCard />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* History Section */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 border-t border-white/10 pt-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                  <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recent Tracks
                </h3>
                <span className="text-xs text-gray-600">Last {HISTORY_LIMIT}</span>
              </div>

              {history.length === 0 ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 text-center text-sm text-gray-600"
                >
                  No tracks yet. Search and download to see history.
                </motion.p>
              ) : (
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="mt-4 space-y-2"
                >
                  {history.map((item) => (
                    <HistoryCard
                      key={item.at}
                      item={item}
                      onClick={() => setUrl(item.url)}
                    />
                  ))}
                </motion.div>
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* Footer Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-8 w-full"
        >
          <div className="glass rounded-2xl p-6 text-center">
            <p className="text-sm text-gray-300">
              Built with ☕ and 💻 by an IT Student
            </p>
            <p className="mt-1 text-xs text-gray-500">
              If this helped you, consider supporting my tuition!
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="https://buymeacoffee.com/alvarezrenv"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 px-5 py-2.5 font-medium text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/40"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364z" />
                </svg>
                Buy Me a Coffee
              </motion.a>

              <motion.button
                suppressHydrationWarning
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowDonationModal(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 font-medium text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/40"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                GCash / Maya
              </motion.button>
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-center text-xs text-gray-600"
        >
          Built with Next.js, Tailwind CSS & FastAPI
        </motion.p>
      </div>

      {/* Donation Modal */}
      <AnimatePresence>
        {showDonationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDonationModal(false)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="glass-card relative w-full max-w-sm rounded-3xl p-6 sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowDonationModal(false)}
                className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="text-center">
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  Support via GCash / Maya
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  Scan the QR code or copy the number below
                </p>

                <div className="mx-auto mt-6 w-40 max-w-[70vw] overflow-hidden rounded-xl border border-white/20 bg-white p-3 sm:w-48">
                  <img
                    src="/qr-code.jpg"
                    alt="GCash/Maya QR Code"
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect fill='%23f3f4f6' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='sans-serif' font-size='14'%3EQR Code%3C/text%3E%3C/svg%3E";
                    }}
                  />
                </div>

                <div className="mt-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Account Number</p>
                  <p className="mt-1 text-2xl font-bold tracking-wider text-white">{PAYMENT_NUMBER}</p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={copyPaymentNumber}
                  className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-medium text-white transition ${
                    copied
                      ? "bg-emerald-600"
                      : "bg-gradient-to-r from-blue-500 to-cyan-500 hover:brightness-110"
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Number
                    </>
                  )}
                </motion.button>

                <p className="mt-4 text-xs text-gray-500">
                  Thank you for your support! 💜
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
