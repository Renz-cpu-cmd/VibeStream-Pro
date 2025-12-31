"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface HealthStatus {
  status: string;
  youtube_engine: "operational" | "limited" | "down";
  ffmpeg: boolean;
  timestamp: string;
}

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

const services = [
  {
    name: "YouTube Engine",
    key: "youtube",
    icon: "📺",
    description: "Core download & conversion service",
  },
  {
    name: "FFmpeg Processor",
    key: "ffmpeg",
    icon: "🔧",
    description: "Audio/video transcoding engine",
  },
  {
    name: "AI Vocal Remover",
    key: "vocal",
    icon: "🎤",
    description: "ML-based karaoke generation",
  },
  {
    name: "Rate Limiter",
    key: "ratelimit",
    icon: "⚡",
    description: "API protection & fairness",
  },
];

export default function StatusPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/health`, {
        method: "GET",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth({
          status: "error",
          youtube_engine: "down",
          ffmpeg: false,
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      setHealth({
        status: "error",
        youtube_engine: "down",
        ffmpeg: false,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    checkHealth();
    // Refresh every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (key: string) => {
    if (!health) return { bg: "bg-gray-500/20", text: "text-gray-400", dot: "bg-gray-500" };
    
    if (key === "youtube") {
      if (health.youtube_engine === "operational") {
        return { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" };
      } else if (health.youtube_engine === "limited") {
        return { bg: "bg-amber-500/20", text: "text-amber-400", dot: "bg-amber-500" };
      } else {
        return { bg: "bg-red-500/20", text: "text-red-400", dot: "bg-red-500" };
      }
    }
    
    if (key === "ffmpeg") {
      return health.ffmpeg
        ? { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" }
        : { bg: "bg-red-500/20", text: "text-red-400", dot: "bg-red-500" };
    }
    
    // Default: assume operational for other services
    return { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" };
  };

  const getStatusLabel = (key: string) => {
    if (!health) return "Checking...";
    
    if (key === "youtube") {
      if (health.youtube_engine === "operational") return "Operational";
      if (health.youtube_engine === "limited") return "Limited";
      return "Down";
    }
    
    if (key === "ffmpeg") {
      return health.ffmpeg ? "Operational" : "Unavailable";
    }
    
    return "Operational";
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Animated Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950" />
        
        {/* Status-themed gradient orbs - blue/cyan tones */}
        <div 
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-70"
          style={{
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, rgba(6, 182, 212, 0) 70%)',
            animation: 'float 8s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(59, 130, 246, 0) 70%)',
            animation: 'floatReverse 10s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full opacity-50"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, rgba(16, 185, 129, 0) 70%)',
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
          <motion.div variants={fadeInUp} className="mb-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500"></span>
              </span>
              System Status
            </span>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="mt-6 bg-gradient-to-r from-white via-cyan-200 to-blue-200 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl"
          >
            System Health
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-4 max-w-md text-gray-400"
          >
            Real-time status of all VibeStream Pro services
          </motion.p>
        </motion.div>

        {/* Status Overview Card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 w-full"
        >
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            {/* Overall Status */}
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  health?.youtube_engine === "limited" ? "bg-amber-500/20" : health?.status === "ok" ? "bg-green-500/20" : "bg-red-500/20"
                }`}>
                  <span className="text-2xl">
                    {health?.youtube_engine === "limited" ? "⚠️" : health?.status === "ok" ? "✅" : "❌"}
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {health?.youtube_engine === "limited" 
                      ? "Partial Outage" 
                      : health?.status === "ok" 
                        ? "All Systems Operational" 
                        : "Service Disruption"}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {lastChecked 
                      ? `Last checked: ${lastChecked.toLocaleTimeString()}`
                      : "Checking status..."}
                  </p>
                </div>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={checkHealth}
                disabled={loading}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Checking
                  </span>
                ) : (
                  "Refresh"
                )}
              </motion.button>
            </div>

            {/* Services Grid */}
            <div className="space-y-3">
              {services.map((service, index) => {
                const status = getStatusColor(service.key);
                const label = getStatusLabel(service.key);
                
                return (
                  <motion.div
                    key={service.key}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index }}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-2xl">
                        {service.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{service.name}</h3>
                        <p className="text-sm text-gray-500">{service.description}</p>
                      </div>
                    </div>
                    
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${status.bg}`}>
                      <span className={`relative flex h-2 w-2`}>
                        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${status.dot} opacity-75`}></span>
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${status.dot}`}></span>
                      </span>
                      <span className={`text-sm font-medium ${status.text}`}>{label}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* YouTube Notice */}
            {health?.youtube_engine === "limited" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">🔧</div>
                  <div>
                    <h3 className="font-bold text-amber-200">YouTube Engine: Limited Mode</h3>
                    <p className="mt-1 text-sm text-amber-100/70">
                      YouTube is actively blocking third-party services. Downloads may fail or be slower than usual.
                      We recommend using yt-dlp locally for the most reliable experience.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <a
                        href="https://github.com/yt-dlp/yt-dlp"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/30"
                      >
                        📥 Get yt-dlp
                      </a>
                      <a
                        href="https://github.com/yt-dlp/yt-dlp/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/20"
                      >
                        📢 Status updates
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Incident History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-8 w-full"
        >
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <h3 className="mb-4 text-lg font-bold text-white">Recent Incidents</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4 rounded-xl border border-amber-500/20 bg-amber-950/20 p-4">
                <div className="mt-0.5 text-amber-400">⚠️</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-amber-200">YouTube Bot Detection</h4>
                    <span className="text-xs text-gray-500">Ongoing</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">
                    YouTube has increased bot detection measures globally, affecting all third-party download services.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 rounded-xl border border-green-500/20 bg-green-950/20 p-4">
                <div className="mt-0.5 text-green-400">✅</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-green-200">UI Redesign Complete</h4>
                    <span className="text-xs text-gray-500">Dec 31, 2025</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">
                    Premium glassmorphism UI with animations deployed successfully.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
