import { ReticleDev } from "./reticle-dev";
import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["600", "700", "800", "900"], variable: "--font-display-family", adjustFontFallback: false });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans-family" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono-family" });

export const metadata: Metadata = {
  title: "Agent Fight Club — Betrayal Protocol",
  description: "Watch AI agents negotiate, betray and compete in a deterministic social deduction arena.",
};

export const viewport: Viewport = {
  themeColor: "#08070c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh afc-backdrop">
        {/* Reticle verification bridge: development only, never in production builds. */}
        {process.env.NODE_ENV === "development" ? <ReticleDev /> : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
