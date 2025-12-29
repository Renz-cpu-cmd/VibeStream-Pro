"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface VideoInfo {
  title: string;
  thumbnail: string | null;
  duration: number | null;
  duration_str: string;
}

type HistoryItem = {
  url: string;
  title: string;
  at: number; // epoch ms
};

const HISTORY_KEY = "vibestream_history_v1";
const HISTORY_LIMIT = 5;

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

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
    setDownloadStatus("Connecting to server...");
    setError(null);

    try {
      setDownloadStatus("Converting to MP3... This may take a moment.");

      const res = await fetch(
        `${API_BASE}/download?url=${encodeURIComponent(url)}`
      );

      if (!res.ok) {
        let errorMessage = "Download failed";
        try {
          const data = await res.json();
          errorMessage = data.detail || errorMessage;
        } catch {
          // Response might not be JSON
          errorMessage = `Server error (${res.status}): ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      setDownloadStatus("Download complete! Saving file...");

      const blob = await res.blob();
      const filename =
        videoInfo?.title?.replace(/[\\/*?:"<>|]/g, "") || "audio";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.mp3`;
      link.click();
      URL.revokeObjectURL(link.href);

      // History: store last 5 successful conversions
      addToHistory({
        url: url.trim(),
        title: videoInfo?.title || filename,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Download failed";
      setError(errorMsg);
      // Show alert for critical errors (500 errors)
      if (errorMsg.includes("ffmpeg") || errorMsg.includes("500") || errorMsg.includes("conversion")) {
        alert(`Download Error:\n\n${errorMsg}\n\nPlease make sure ffmpeg.exe and ffprobe.exe are in the backend folder.`);
      }
    } finally {
      setDownloading(false);
      setDownloadStatus("");
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 px-6 py-12">
      {/* Decorative glow blobs */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-purple-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-pink-500/10 blur-3xl" />

      <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
        {/* Glassmorphism Card */}
        <div className="w-full rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-4xl font-extrabold tracking-tight text-transparent drop-shadow-sm bg-clip-text bg-gradient-to-r from-purple-300 via-pink-400 to-purple-300 sm:text-5xl">
                VibeStream Pro
              </h1>
              <p className="mt-2 text-sm text-gray-300/80 sm:text-base">
                Paste a link, preview it, then download a clean MP3.
              </p>
            </div>

            {/* Input Area */}
            <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste video URL here..."
                  className="w-full rounded-xl border border-white/10 bg-gray-950/40 px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
                />
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5" />
              </div>
              <button
                onClick={handleAnalyze}
                disabled={loading || !url.trim()}
                className="rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white shadow-lg shadow-purple-500/20 transition hover:bg-purple-700 hover:shadow-purple-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Analyzing..." : "Analyze"}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-5 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-center text-sm text-red-200">
                {error}
              </div>
            )}

            {/* Loading Spinner */}
            {loading && (
              <div className="mt-6 flex items-center justify-center gap-3 text-gray-300/80">
                <svg
                  className="h-5 w-5 animate-spin text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                <span>Fetching video info...</span>
              </div>
            )}

            {/* Video Card */}
            {videoInfo && !loading && (
              <div className="mt-7 overflow-hidden rounded-2xl border border-white/10 bg-gray-950/30">
                {videoInfo.thumbnail && (
                  <div className="relative">
                    <img
                      src={videoInfo.thumbnail}
                      alt={videoInfo.title}
                      className="h-56 w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-gray-950/20 to-transparent" />
                  </div>
                )}
                <div className="p-5 sm:p-6">
                  <h2 className="text-base font-bold text-white sm:text-lg line-clamp-2">
                    {videoInfo.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-300/80">
                    Duration: {videoInfo.duration_str}
                  </p>

                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 py-3 font-semibold text-white ring-1 ring-emerald-300/30 shadow-lg shadow-emerald-500/20 transition hover:shadow-emerald-400/30 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {downloading ? (
                      <>
                        <svg
                          className="h-5 w-5 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          />
                        </svg>
                        Converting to MP3...
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                          />
                        </svg>
                        Download MP3
                      </>
                    )}
                  </button>

                  {/* Download Status Message */}
                  {downloading && downloadStatus && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-sm text-emerald-200">
                      <div className="flex space-x-1">
                        <div
                          className="h-2 w-2 animate-bounce rounded-full bg-emerald-300"
                          style={{ animationDelay: "0ms" }}
                        />
                        <div
                          className="h-2 w-2 animate-bounce rounded-full bg-emerald-300"
                          style={{ animationDelay: "150ms" }}
                        />
                        <div
                          className="h-2 w-2 animate-bounce rounded-full bg-emerald-300"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                      <span>{downloadStatus}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* History */}
            <div className="mt-8 border-t border-white/10 pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-wide text-gray-100">
                  History
                </h3>
                <span className="text-xs text-gray-400">Last {HISTORY_LIMIT} conversions</span>
              </div>

              {history.length === 0 ? (
                <p className="mt-3 text-sm text-gray-400">
                  No history yet. Download an MP3 to see it here.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {history.map((item) => (
                    <button
                      key={item.at}
                      type="button"
                      onClick={() => setUrl(item.url)}
                      className="w-full rounded-xl border border-white/10 bg-gray-950/30 px-4 py-3 text-left transition hover:bg-gray-950/40"
                      title={item.url}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-100">
                            {item.title}
                          </div>
                          <div className="truncate text-xs text-gray-400">{item.url}</div>
                        </div>
                        <div className="shrink-0 text-xs text-gray-500">
                          {new Date(item.at).toLocaleString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Built with Next.js, Tailwind & FastAPI
        </p>
      </div>
    </main>
  );
}
