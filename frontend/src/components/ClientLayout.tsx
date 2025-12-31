"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import SystemAlert from "@/components/SystemAlert";
import ProModal from "@/components/ProModal";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [showProModal, setShowProModal] = useState(false);

  return (
    <>
      <Navbar onProClick={() => setShowProModal(true)} />
      <SystemAlert />
      <ProModal isOpen={showProModal} onClose={() => setShowProModal(false)} />
      <main className="pt-24">{children}</main>
    </>
  );
}
