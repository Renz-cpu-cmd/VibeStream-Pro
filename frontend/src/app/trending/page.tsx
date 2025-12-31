"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTrendingSongs, type TrendingSong } from "@/lib/supabase";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export default function TrendingPage() {
  const [songs, setSongs] = useState<TrendingSong[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrending() {
      setLoading(true);
      try {
        const trending = await getTrendingSongs(20);
        setSongs(trending);
      } catch (err) {
        console.error("Failed to fetch trending:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrending();
  }, []);

  const handleSongClick = (url: string) => {
    // Navigate to home with URL pre-filled
    window.location.href = `/?url=${encodeURIComponent(url)}`;
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950" />
        <div 
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-70"
          style={{
            background: 'radial-gradient(circle, rgba(249, 115, 22, 0.5) 0%, rgba(249, 115, 22, 0) 70%)',
            animation: 'float 8s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, rgba(239, 68, 68, 0) 70%)',
            animation: 'floatReverse 10s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full opacity-50"
          style={{
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.35) 0%, rgba(251, 191, 36, 0) 70%)',
            animation: 'float 12s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto min-h-screen w-full max-w-4xl px-6 py-8">
        {/* Header */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="mb-8 text-center"
        >
          <motion.div variants={fadeInUp} className="mb-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-medium text-orange-300 backdrop-blur-sm">
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                🔥
              </motion.span>
              Updated in real-time
            </span>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="mt-6 bg-gradient-to-r from-white via-orange-200 to-amber-200 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl"
          >
            Trending Songs
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-4 max-w-md text-gray-400"
          >
            See what the community is downloading right now
          </motion.p>
        </motion.div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-white/10" />
                <div className="h-14 w-14 rounded-lg bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-white/10" />
                  <div className="h-3 w-1/2 rounded bg-white/5" />
                </div>
                <div className="h-6 w-20 rounded bg-white/10" />
              </div>
            ))}
          </div>
        )}

        {/* Songs List */}
        {!loading && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-2"
          >
            {songs.map((song, index) => (
              <motion.button
                key={song.id}
                variants={fadeInUp}
                whileHover={{ scale: 1.01, x: 8 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleSongClick(song.url)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur-md transition-all hover:border-orange-500/30 hover:bg-white/10"
              >
                {/* Rank */}
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
                  index === 0 
                    ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/30" 
                    : index === 1 
                      ? "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800"
                      : index === 2
                        ? "bg-gradient-to-br from-amber-600 to-amber-700 text-white"
                        : "bg-white/10 text-gray-400"
                }`}>
                  {index + 1}
                </div>

                {/* Thumbnail */}
                {song.thumbnail ? (
                  <img
                    src={song.thumbnail}
                    alt={song.title}
                    className="h-14 w-14 rounded-xl object-cover shadow-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src.includes('maxresdefault')) {
                        target.src = target.src.replace('maxresdefault', 'hqdefault');
                      } else if (target.src.includes('hqdefault')) {
                        target.src = target.src.replace('hqdefault', 'mqdefault');
                      }
                    }}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/30 to-red-500/30 text-2xl">
                    🎵
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-white group-hover:text-orange-300 transition-colors">
                    {song.title}
                  </h3>
                  <p className="truncate text-sm text-gray-400 mt-0.5">
                    {song.artist || "Unknown Artist"}
                  </p>
                </div>

                {/* Stats */}
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 text-orange-400">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="font-semibold">
                      {song.download_count.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">downloads</p>
                </div>

                {/* Download Arrow */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* Empty State */}
        {!loading && songs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="mb-4 text-6xl">📊</div>
            <h2 className="text-2xl font-bold text-white">No trending data yet</h2>
            <p className="mt-2 text-gray-400">Be the first to start a trend!</p>
            <a href="/" className="mt-6 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 px-6 py-3 font-semibold text-white">
              Download a Song
            </a>
          </motion.div>
        )}

        {/* Bottom Padding */}
        <div className="h-24" />
      </div>
    </main>
  );
}
