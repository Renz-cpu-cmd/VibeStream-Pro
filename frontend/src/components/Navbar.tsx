"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const navItems = [
  { href: "/", label: "Audio", icon: "🎵" },
  { href: "/video", label: "Video", icon: "🎬" },
  { href: "/status", label: "Status", icon: "📊" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="fixed top-4 left-1/2 z-50 -translate-x-1/2"
    >
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1.5 shadow-2xl shadow-black/20 backdrop-blur-xl">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="navbar-pill"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600/80 to-pink-600/80"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10">{item.icon}</span>
                <span className="relative z-10">{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
        
        {/* Pro Badge */}
        <div className="ml-2 flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-2.5 py-1.5 border border-amber-500/30">
          <span className="text-xs">✨</span>
          <span className="text-xs font-semibold text-amber-300">PRO</span>
        </div>
      </div>
    </motion.nav>
  );
}
