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
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // GCash/Maya number - update with your actual number
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
      // Fallback for older browsers
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

        {/* Glassmorphism Footer */}
        <div className="mt-8 w-full rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
          <div className="text-center">
            <p className="text-sm text-gray-300/90 sm:text-base">
              Built with ☕ and 💻 by an IT Student.
            </p>
            <p className="mt-1 text-xs text-gray-400 sm:text-sm">
              If this helped you, consider supporting my tuition!
            </p>

            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {/* Buy Me a Coffee Button */}
              <a
                href="https://buymeacoffee.com/alvarezrenv"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 px-5 py-2.5 font-medium text-white shadow-lg shadow-orange-500/20 transition hover:shadow-orange-500/40 hover:brightness-110"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364z" />
                </svg>
                Buy Me a Coffee
              </a>

              {/* GCash/Maya Button */}
              <button
                onClick={() => setShowDonationModal(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 font-medium text-white shadow-lg shadow-cyan-500/20 transition hover:shadow-cyan-500/40 hover:brightness-110"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                GCash / Maya
              </button>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Built with Next.js, Tailwind & FastAPI
        </p>
      </div>

      {/* Donation Modal */}
      {showDonationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDonationModal(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />

          {/* Modal */}
          <div
            className="relative w-full max-w-sm animate-[popIn_0.2s_ease-out] rounded-2xl border border-white/20 bg-gray-900/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowDonationModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
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

              {/* QR Code */}
              <div className="mx-auto mt-6 w-40 max-w-[70vw] overflow-hidden rounded-xl border border-white/20 bg-white p-3 sm:w-48">
                <img
                  src="/qr-code.jpg"
                  alt="GCash/Maya QR Code"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    // Fallback if QR image doesn't exist
                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect fill='%23f3f4f6' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='sans-serif' font-size='14'%3EQR Code%3C/text%3E%3C/svg%3E";
                  }}
                />
              </div>

              {/* Payment Number */}
              <div className="mt-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Account Number</p>
                <p className="mt-1 text-2xl font-bold tracking-wider text-white">{PAYMENT_NUMBER}</p>
              </div>

              {/* Copy Button */}
              <button
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
              </button>

              <p className="mt-4 text-xs text-gray-500">
                Thank you for your support! 💜
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
