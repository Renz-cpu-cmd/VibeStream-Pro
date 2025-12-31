"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { LibrarySong } from "@/lib/libraryDB";

interface PlayerContextType {
  currentSong: LibrarySong | null;
  playlist: LibrarySong[];
  isPlayerVisible: boolean;
  playSong: (song: LibrarySong, playlist?: LibrarySong[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  closePlayer: () => void;
  addToPlaylist: (song: LibrarySong) => void;
  clearPlaylist: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<LibrarySong | null>(null);
  const [playlist, setPlaylist] = useState<LibrarySong[]>([]);
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);

  const playSong = useCallback((song: LibrarySong, newPlaylist?: LibrarySong[]) => {
    setCurrentSong(song);
    setIsPlayerVisible(true);
    if (newPlaylist) {
      setPlaylist(newPlaylist);
    }
  }, []);

  const playNext = useCallback(() => {
    if (!currentSong || playlist.length === 0) return;
    
    const currentIndex = playlist.findIndex(s => s.id === currentSong.id);
    const nextIndex = (currentIndex + 1) % playlist.length;
    setCurrentSong(playlist[nextIndex]);
  }, [currentSong, playlist]);

  const playPrevious = useCallback(() => {
    if (!currentSong || playlist.length === 0) return;
    
    const currentIndex = playlist.findIndex(s => s.id === currentSong.id);
    const prevIndex = currentIndex - 1 < 0 ? playlist.length - 1 : currentIndex - 1;
    setCurrentSong(playlist[prevIndex]);
  }, [currentSong, playlist]);

  const closePlayer = useCallback(() => {
    setIsPlayerVisible(false);
    setCurrentSong(null);
  }, []);

  const addToPlaylist = useCallback((song: LibrarySong) => {
    setPlaylist(prev => {
      if (prev.some(s => s.id === song.id)) return prev;
      return [...prev, song];
    });
  }, []);

  const clearPlaylist = useCallback(() => {
    setPlaylist([]);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentSong,
        playlist,
        isPlayerVisible,
        playSong,
        playNext,
        playPrevious,
        closePlayer,
        addToPlaylist,
        clearPlaylist,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
