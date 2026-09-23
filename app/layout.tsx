import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const sans = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

/** Smale tall (DIN-aktig) for klokke, nedtelling og tider. */
const num = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-num",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Magien 2026 · Kjøreplan",
  description: "Kjøreplan for crew – hva skjer nå, hva skjer neste, og hvem gjør hva.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kjøreplan", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0e0e10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={`${sans.variable} ${num.variable}`}>
      <body>{children}</body>
    </html>
  );
}
