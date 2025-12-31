"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import SystemAlert from "@/components/SystemAlert";
import ProModal from "@/components/ProModal";
import MiniPlayer from "@/components/MiniPlayer";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";

interface ClientLayoutProps {
  children: React.ReactNode;
}

function LayoutContent({ children }: ClientLayoutProps) {
  const [showProModal, setShowProModal] = useState(false);
  const { currentSong, isPlayerVisible, closePlayer, playNext, playPrevious } = usePlayer();

  return (
    <>
      <Sidebar onProClick={() => setShowProModal(true)} />
      <SystemAlert />
      <ProModal isOpen={showProModal} onClose={() => setShowProModal(false)} />
      
      {/* Main content with left margin for sidebar */}
      <main 
        className="min-h-screen transition-all duration-300"
        style={{ marginLeft: "72px", paddingBottom: isPlayerVisible ? "100px" : "0" }}
      >
        {children}
      </main>
      
      {/* Persistent Mini Player */}
      {isPlayerVisible && (
        <MiniPlayer
          song={currentSong}
          onClose={closePlayer}
          onNext={playNext}
          onPrevious={playPrevious}
        />
      )}
    </>
  );
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <PlayerProvider>
      <LayoutContent>{children}</LayoutContent>
    </PlayerProvider>
  );
}
