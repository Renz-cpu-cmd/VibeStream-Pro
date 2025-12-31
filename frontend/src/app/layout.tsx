import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import SystemAlert from "@/components/SystemAlert";

export const metadata: Metadata = {
  title: "VibeStream Pro",
  description: "Premium audio & video conversion platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        <Navbar />
        <SystemAlert />
        {children}
      </body>
    </html>
  );
}
