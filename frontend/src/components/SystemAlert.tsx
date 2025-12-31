"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

// Read from environment variable (set in .env.local or Vercel dashboard)
// NEXT_PUBLIC_MAINTENANCE_MODE=true|false
// NEXT_PUBLIC_MAINTENANCE_MESSAGE="Custom message here"

export default function SystemAlert() {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Check environment variable
    const maintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";
    const customMessage = process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE || 
      "YouTube downloads are temporarily unavailable due to platform restrictions. We're working on a solution.";
    
    setIsVisible(maintenanceMode);
    setMessage(customMessage);
  }, []);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed top-20 left-1/2 z-40 w-[90%] max-w-2xl -translate-x-1/2"
      >
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/90 to-orange-950/90 p-4 shadow-2xl backdrop-blur-xl">
          {/* Animated background glow */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(251, 191, 36, 0.3) 0%, transparent 70%)',
            }}
          />
          
          <div className="relative flex items-center gap-4">
            {/* Pulsing icon */}
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/30" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
                <span className="text-xl">🔧</span>
              </div>
            </div>
            
            <div className="flex-1">
              <h4 className="font-semibold text-amber-200">
                System Maintenance
              </h4>
              <p className="mt-0.5 text-sm text-amber-100/80">
                {message}
              </p>
            </div>
            
            {/* Close button */}
            <button
              onClick={() => setIsVisible(false)}
              className="flex-shrink-0 rounded-lg p-2 text-amber-300/60 transition hover:bg-amber-500/10 hover:text-amber-200"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Progress bar animation */}
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-amber-900/50">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
