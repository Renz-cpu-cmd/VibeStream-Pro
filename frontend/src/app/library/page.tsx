"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { libraryDB, formatBytes, type LibrarySong } from "@/lib/libraryDB";
import { usePlayer } from "@/context/PlayerContext";

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

const getModeLabel = (mode: string) => {
  const labels: Record<string, { label: string; color: string }> = {
    standard: { label: "Standard", color: "bg-gray-500/30 text-gray-300" },
    minus_one: { label: "Karaoke", color: "bg-pink-500/30 text-pink-300" },
    bass_boost: { label: "Bass+", color: "bg-orange-500/30 text-orange-300" },
    nightcore: { label: "Nightcore", color: "bg-cyan-500/30 text-cyan-300" },
  };
  return labels[mode] || labels.standard;
};

export default function LibraryPage() {
  const [songs, setSongs] = useState<LibrarySong[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageUsed, setStorageUsed] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { playSong, currentSong } = usePlayer();

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const allSongs = await libraryDB.getAllSongs();
      setSongs(allSongs);
      const storage = await libraryDB.getStorageUsed();
      setStorageUsed(storage);
    } catch (err) {
      console.error("Failed to load library:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await libraryDB.deleteSong(id);
      setSongs(songs.filter(s => s.id !== id));
      setDeleteConfirm(null);
      const storage = await libraryDB.getStorageUsed();
      setStorageUsed(storage);
    } catch (err) {
      console.error("Failed to delete song:", err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear your entire library?")) return;
    try {
      await libraryDB.clearLibrary();
      setSongs([]);
      setStorageUsed(0);
    } catch (err) {
      console.error("Failed to clear library:", err);
    }
  };

  const handlePlaySong = (song: LibrarySong) => {
    playSong(song, songs);
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950" />
        <div 
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(16, 185, 129, 0) 70%)',
            animation: 'float 8s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full opacity-50"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(59, 130, 246, 0) 70%)',
            animation: 'floatReverse 10s ease-in-out infinite',
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
          className="mb-8"
        >
          <motion.div variants={fadeInUp} className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-black text-white">Your Library</h1>
              <p className="mt-1 text-gray-400">
                {songs.length} songs • {formatBytes(storageUsed)} stored locally
              </p>
            </div>
            
            {songs.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleClearAll}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
              >
                Clear All
              </motion.button>
            )}
          </motion.div>
        </motion.div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <p className="text-gray-400">Loading your library...</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && songs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="mb-4 text-6xl">📚</div>
            <h2 className="text-2xl font-bold text-white">Your library is empty</h2>
            <p className="mt-2 text-gray-400">Downloaded songs will appear here</p>
            <a href="/" className="mt-6 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white">
              Start Downloading
            </a>
          </motion.div>
        )}

        {/* Songs List */}
        {!loading && songs.length > 0 && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-2"
          >
            {songs.map((song, index) => {
              const modeInfo = getModeLabel(song.mode);
              const isPlaying = currentSong?.id === song.id;

              return (
                <motion.div
                  key={song.id}
                  variants={fadeInUp}
                  className={`group relative overflow-hidden rounded-2xl border backdrop-blur-md transition-all ${
                    isPlaying
                      ? "border-purple-500/50 bg-purple-500/10"
                      : "border-white/10 bg-white/5 hover:border-purple-500/30 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Track Number / Play Button */}
                    <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center">
                      <span className="text-lg font-medium text-gray-500 group-hover:hidden">
                        {index + 1}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handlePlaySong(song)}
                        className="absolute inset-0 hidden items-center justify-center rounded-lg bg-purple-500 text-white group-hover:flex"
                      >
                        {isPlaying ? (
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </motion.button>
                    </div>

                    {/* Thumbnail */}
                    {song.thumbnail ? (
                      <img
                        src={song.thumbnail}
                        alt={song.title}
                        className="h-12 w-12 rounded-lg object-cover"
                        onError={(e) => {
                          // Fallback to lower res thumbnail or placeholder
                          const target = e.target as HTMLImageElement;
                          if (target.src.includes('maxresdefault')) {
                            target.src = target.src.replace('maxresdefault', 'hqdefault');
                          } else if (target.src.includes('hqdefault')) {
                            target.src = target.src.replace('hqdefault', 'mqdefault');
                          } else {
                            target.style.display = 'none';
                            target.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                          }
                        }}
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/30 to-pink-500/30">
                        🎵
                      </div>
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold text-white">{song.title}</h3>
                        {isPlaying && (
                          <div className="flex items-end gap-0.5">
                            {[1, 2, 3].map((i) => (
                              <motion.div
                                key={i}
                                className="w-1 bg-purple-500 rounded-full"
                                animate={{ height: [4, 12, 4] }}
                                transition={{
                                  duration: 0.5,
                                  repeat: Infinity,
                                  delay: i * 0.1,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-gray-400">{song.artist || "Unknown"}</span>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${modeInfo.color}`}>
                          {modeInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Duration & Size */}
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-300">{song.durationStr}</div>
                      <div className="text-xs text-gray-500">{formatBytes(song.fileSize)}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <AnimatePresence>
                        {deleteConfirm === song.id ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center gap-2"
                          >
                            <button
                              onClick={() => handleDelete(song.id)}
                              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-300"
                            >
                              Cancel
                            </button>
                          </motion.div>
                        ) : (
                          <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            onClick={() => setDeleteConfirm(song.id)}
                            className="rounded-lg p-2 text-gray-400 transition hover:bg-red-500/20 hover:text-red-400"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Bottom Padding for Mini Player */}
        <div className="h-24" />
      </div>
    </main>
  );
}
