"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTrendingSongs, type TrendingSong } from "@/lib/supabase";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

interface TrendingSectionProps {
  onSongClick?: (url: string) => void;
}

export default function TrendingSection({ onSongClick }: TrendingSectionProps) {
  const [songs, setSongs] = useState<TrendingSong[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrending() {
      setLoading(true);
      try {
        const trending = await getTrendingSongs(3);
        setSongs(trending);
      } catch (err) {
        console.error("Failed to fetch trending:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrending();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🔥</span>
          <h3 className="text-lg font-bold text-white">Trending Now</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-12 w-12 rounded-lg bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-white/10" />
                <div className="h-3 w-1/2 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (songs.length === 0) return null;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeInUp}
      className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
    >
      <div className="flex items-center gap-2 mb-4">
        <motion.span 
          className="text-xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          🔥
        </motion.span>
        <h3 className="text-lg font-bold text-white">Trending Now</h3>
      </div>

      <div className="space-y-2">
        {songs.map((song, index) => (
          <motion.button
            key={song.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02, x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSongClick?.(song.url)}
            className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-all hover:bg-white/5"
          >
            {/* Rank */}
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
              index === 0 
                ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white" 
                : index === 1 
                  ? "bg-gradient-to-br from-gray-400 to-gray-500 text-white"
                  : "bg-gradient-to-br from-amber-700 to-amber-800 text-white"
            }`}>
              {index + 1}
            </div>

            {/* Thumbnail */}
            {song.thumbnail ? (
              <img
                src={song.thumbnail}
                alt={song.title}
                className="h-12 w-12 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/30 to-pink-500/30">
                🎵
              </div>
            )}

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">
                {song.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="truncate text-xs text-gray-400">
                  {song.artist || "Unknown"}
                </span>
                <span className="text-xs text-gray-600">•</span>
                <span className="text-xs text-purple-400">
                  {song.download_count.toLocaleString()} downloads
                </span>
              </div>
            </div>

            {/* Play Icon */}
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 text-white">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* View All Link */}
      <a
        href="/trending"
        className="mt-4 flex items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 py-2 text-sm font-medium text-gray-400 transition hover:bg-white/10 hover:text-white"
      >
        View All Trending
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </a>
    </motion.div>
  );
}
