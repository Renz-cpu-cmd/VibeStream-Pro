"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useState } from "react";

interface SidebarProps {
  onProClick?: () => void;
}

const navItems = [
  { 
    href: "/", 
    label: "Home", 
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  },
  { 
    href: "/library", 
    label: "Library", 
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )
  },
  { 
    href: "/trending", 
    label: "Trending", 
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    )
  },
  { 
    href: "/mp3", 
    label: "MP3", 
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    )
  },
  { 
    href: "/video", 
    label: "Video", 
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    )
  },
  { 
    href: "/lyrics", 
    label: "Lyrics", 
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    )
  },
  { 
    href: "/status", 
    label: "Status", 
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  },
];

export default function Sidebar({ onProClick }: SidebarProps) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      className="fixed left-0 top-0 z-50 flex h-screen flex-col items-center border-r border-white/10 bg-black/40 backdrop-blur-xl transition-all duration-300"
      style={{ width: isExpanded ? "200px" : "72px" }}
    >
      {/* Logo */}
      <div className="flex h-20 w-full items-center justify-center border-b border-white/10 px-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
          className="flex items-center gap-2"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-lg font-bold text-white shadow-lg shadow-purple-500/30">
            V
          </div>
          <motion.span 
            animate={{ opacity: isExpanded ? 1 : 0, width: isExpanded ? "auto" : 0 }}
            className="overflow-hidden whitespace-nowrap text-lg font-bold text-white"
          >
            VibeStream
          </motion.span>
        </motion.div>
      </div>

      {/* Navigation Items */}
      <nav className="flex flex-1 flex-col gap-2 p-3 pt-6 w-full">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                className={`relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-pill"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600/80 to-pink-600/80"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <motion.span 
                  className="relative z-10 flex-shrink-0"
                  whileHover={{ rotate: 10, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {item.icon}
                </motion.span>
                <motion.span 
                  className="relative z-10 overflow-hidden whitespace-nowrap"
                  animate={{ 
                    opacity: isExpanded ? 1 : 0, 
                    width: isExpanded ? "auto" : 0 
                  }}
                >
                  {item.label}
                </motion.span>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Pro Button */}
      <div className="w-full border-t border-white/10 p-3">
        <motion.button
          onClick={onProClick}
          whileHover={{ scale: 1.02, x: 4 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-3 py-3 border border-amber-500/30 transition-all hover:from-amber-500/30 hover:to-orange-500/30 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/20"
          suppressHydrationWarning
        >
          <motion.span 
            className="flex-shrink-0 text-lg"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", type: "tween" }}
          >
            ✨
          </motion.span>
          <motion.span 
            className="text-sm font-semibold text-amber-300 overflow-hidden whitespace-nowrap"
            animate={{ 
              opacity: isExpanded ? 1 : 0, 
              width: isExpanded ? "auto" : 0 
            }}
          >
            Upgrade to Pro
          </motion.span>
        </motion.button>
      </div>

      {/* User Section */}
      <div className="w-full border-t border-white/10 p-3">
        <motion.div 
          className="flex items-center gap-3 rounded-xl px-3 py-2"
          whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-sm font-bold text-white">
            G
          </div>
          <motion.div 
            className="overflow-hidden"
            animate={{ 
              opacity: isExpanded ? 1 : 0, 
              width: isExpanded ? "auto" : 0 
            }}
          >
            <div className="text-sm font-medium text-white whitespace-nowrap">Guest User</div>
            <div className="text-xs text-gray-500 whitespace-nowrap">Free Plan</div>
          </motion.div>
        </motion.div>
      </div>
    </motion.aside>
  );
}
