"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MagnifyingGlassIcon, 
  MusicalNoteIcon,
  MicrophoneIcon,
  ClockIcon,
  XMarkIcon,
  ArrowPathIcon
} from "@heroicons/react/24/outline";

interface SearchResult {
  id: number;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
}

interface LyricsData {
  title: string;
  artist: string;
  lyrics: string;
  album?: string;
  thumbnail?: string;
}

export default function LyricsPage() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedSong, setSelectedSong] = useState<LyricsData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingLyrics, setIsFetchingLyrics] = useState(false);
  const [error, setError] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("vibestream_recent_lyrics");
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  // Save to recent searches
  const addToRecent = (search: string) => {
    const updated = [search, ...recentSearches.filter(s => s !== search)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("vibestream_recent_lyrics", JSON.stringify(updated));
  };

  // Search for songs
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError("");
    setSearchResults([]);
    setSelectedSong(null);

    try {
      // Use Genius API via our backend proxy
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/lyrics/search?q=${encodeURIComponent(query)}`
      );
      
      if (!response.ok) throw new Error("Search failed");
      
      const data = await response.json();
      setSearchResults(data.results || []);
      addToRecent(query);
      
      if (data.results?.length === 0) {
        setError("No songs found. Try a different search.");
      }
    } catch (err) {
      console.error("Search error:", err);
      setError("Could not search for songs. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  // Fetch lyrics for a selected song
  const fetchLyrics = async (song: SearchResult) => {
    setIsFetchingLyrics(true);
    setError("");

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/lyrics/get?artist=${encodeURIComponent(song.artist)}&title=${encodeURIComponent(song.title)}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Could not fetch lyrics");
      }
      
      const data = await response.json();
      setSelectedSong({
        title: song.title,
        artist: song.artist,
        lyrics: data.lyrics,
        album: song.album,
        thumbnail: song.thumbnail,
      });
    } catch (err) {
      console.error("Lyrics error:", err);
      const message = err instanceof Error ? err.message : "Could not fetch lyrics for this song.";
      setError(message + " Try searching with format: Artist - Song Title");
    } finally {
      setIsFetchingLyrics(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/30 to-gray-950">
      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
              <MicrophoneIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Lyrics Finder
            </h1>
            <p className="text-gray-400">
              Search for any song and find the lyrics instantly
            </p>
          </motion.div>

          {/* Search Form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleSearch}
            className="mb-8"
          >
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by song name or artist..."
                className="w-full px-6 py-4 pl-14 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-lg"
                suppressHydrationWarning
                autoComplete="off"
                data-form-type="other"
              />
              <MagnifyingGlassIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-20 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              )}
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                suppressHydrationWarning
              >
                {isSearching ? (
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                ) : (
                  "Search"
                )}
              </button>
            </div>
          </motion.form>

          {/* Recent Searches */}
          {recentSearches.length > 0 && !searchResults.length && !selectedSong && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 text-gray-400 mb-3">
                <ClockIcon className="w-4 h-4" />
                <span className="text-sm">Recent searches</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((search, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuery(search);
                      // Trigger search
                      setTimeout(() => {
                        document.querySelector("form")?.dispatchEvent(
                          new Event("submit", { bubbles: true })
                        );
                      }, 100);
                    }}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search Results */}
          <AnimatePresence mode="popLayout">
            {searchResults.length > 0 && !selectedSong && !isFetchingLyrics && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <h2 className="text-lg font-semibold text-white mb-4">
                  Select a song ({searchResults.length} results)
                </h2>
                {searchResults.map((song, index) => (
                  <motion.button
                    key={song.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => fetchLyrics(song)}
                    className="w-full flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-purple-500/30 transition-all group text-left"
                  >
                    {song.thumbnail ? (
                      <img
                        src={song.thumbnail}
                        alt={song.title}
                        className="w-14 h-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        <MusicalNoteIcon className="w-6 h-6 text-purple-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate group-hover:text-purple-300 transition-colors">
                        {song.title}
                      </h3>
                      <p className="text-gray-400 text-sm truncate">
                        {song.artist}
                      </p>
                      {song.album && (
                        <p className="text-gray-500 text-xs truncate">
                          {song.album}
                        </p>
                      )}
                    </div>
                    <div className="text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MicrophoneIcon className="w-5 h-5" />
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            )}

            {/* Lyrics Display */}
            {selectedSong && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
              >
                {/* Song Header */}
                <div className="p-6 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-b border-white/10">
                  <div className="flex items-start gap-4">
                    {selectedSong.thumbnail ? (
                      <img
                        src={selectedSong.thumbnail}
                        alt={selectedSong.title}
                        className="w-20 h-20 rounded-xl object-cover shadow-lg"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                        <MusicalNoteIcon className="w-10 h-10 text-white" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-white mb-1">
                        {selectedSong.title}
                      </h2>
                      <p className="text-purple-300 text-lg">
                        {selectedSong.artist}
                      </p>
                      {selectedSong.album && (
                        <p className="text-gray-400 text-sm mt-1">
                          {selectedSong.album}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedSong(null);
                        setSearchResults([]);
                        setQuery("");
                      }}
                      className="p-2 text-gray-400 hover:text-white transition-colors"
                    >
                      <XMarkIcon className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                {/* Lyrics Content */}
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                  <pre className="text-gray-300 whitespace-pre-wrap font-sans leading-relaxed text-lg">
                    {selectedSong.lyrics}
                  </pre>
                </div>

                {/* Back Button */}
                <div className="p-4 border-t border-white/10">
                  <button
                    onClick={() => setSelectedSong(null)}
                    className="w-full py-3 bg-white/5 rounded-xl text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                  >
                    ← Back to search results
                  </button>
                </div>
              </motion.div>
            )}

            {/* Loading State */}
            {isFetchingLyrics && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <ArrowPathIcon className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Fetching lyrics...</p>
              </motion.div>
            )}

            {/* Empty State */}
            {!isSearching && !isFetchingLyrics && !searchResults.length && !selectedSong && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center">
                  <MicrophoneIcon className="w-12 h-12 text-purple-400/50" />
                </div>
                <h3 className="text-xl font-medium text-gray-400 mb-2">
                  Search for song lyrics
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  Enter a song name, artist, or both to find lyrics. 
                  We&apos;ll show you matching songs to choose from.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
