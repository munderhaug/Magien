import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magien 2026 · Kjøreplan",
  description: "Kjøreplan for crew – hva skjer nå, hva skjer neste, og hvem gjør hva.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kjøreplan", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
