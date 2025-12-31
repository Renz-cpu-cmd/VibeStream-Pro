"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";
import type { LibrarySong } from "@/lib/libraryDB";

interface MiniPlayerProps {
  song: LibrarySong | null;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

export default function MiniPlayer({ song, onClose, onNext, onPrevious }: MiniPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Create object URL for audio blob or use direct URL
  useEffect(() => {
    // If song has a direct audioUrl, use it
    if (song?.audioUrl) {
      setAudioUrl(song.audioUrl);
      return;
    }
    // Otherwise create object URL from blob
    if (song?.audioBlob) {
      const url = URL.createObjectURL(song.audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [song]);

  // Initialize audio context and analyser for visualizer
  const initAudioContext = useCallback(() => {
    if (!audioRef.current || audioContextRef.current) return;

    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch (err) {
      console.error("Failed to initialize audio context:", err);
    }
  }, []);

  // Draw visualizer
  const drawVisualizer = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current || !showVisualizer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!showVisualizer) return;
      
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgba(10, 10, 15, 0.3)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        // Gradient colors
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, "rgba(147, 51, 234, 0.8)");
        gradient.addColorStop(0.5, "rgba(236, 72, 153, 0.8)");
        gradient.addColorStop(1, "rgba(6, 182, 212, 0.8)");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    draw();
  }, [showVisualizer]);

  // Toggle visualizer
  useEffect(() => {
    if (showVisualizer && isPlaying) {
      initAudioContext();
      drawVisualizer();
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [showVisualizer, isPlaying, initAudioContext, drawVisualizer]);

  // Update time display
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      if (onNext) onNext();
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [onNext]);

  // Auto-play when song changes
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [audioUrl]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      // Resume audio context if suspended
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!song) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", bounce: 0.2 }}
        className="fixed bottom-0 left-0 right-0 z-[100] border-t border-white/10 bg-black/80 backdrop-blur-xl"
        style={{ marginLeft: "72px" }}
      >
        {/* Visualizer Canvas */}
        <AnimatePresence>
          {showVisualizer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 80, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <canvas
                ref={canvasRef}
                width={1200}
                height={80}
                className="w-full h-20"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player Controls */}
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Song Info */}
          <div className="flex items-center gap-3 w-64 flex-shrink-0">
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
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{song.title}</div>
              <div className="truncate text-xs text-gray-400">{song.artist || "Unknown Artist"}</div>
            </div>
          </div>

          {/* Main Controls */}
          <div className="flex flex-1 flex-col items-center gap-1">
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onPrevious}
                className="text-gray-400 hover:text-white transition"
                disabled={!onPrevious}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={togglePlayPause}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black"
              >
                {isPlaying ? (
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onNext}
                className="text-gray-400 hover:text-white transition"
                disabled={!onNext}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6z" />
                </svg>
              </motion.button>
            </div>

            {/* Progress Bar */}
            <div className="flex w-full max-w-xl items-center gap-2">
              <span className="text-xs text-gray-400 w-10 text-right">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
              <span className="text-xs text-gray-400 w-10">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3 w-48 justify-end">
            {/* Visualizer Toggle */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowVisualizer(!showVisualizer)}
              className={`p-2 rounded-lg transition ${
                showVisualizer ? "bg-purple-500/30 text-purple-300" : "text-gray-400 hover:text-white"
              }`}
              title="Toggle Visualizer"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </motion.button>

            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>

            {/* Close Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </motion.button>
          </div>
        </div>

        {/* Hidden Audio Element */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            crossOrigin="anonymous"
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
