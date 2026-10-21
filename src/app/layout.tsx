import { ReticleDev } from "./reticle-dev";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Courier_Prime, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

// One family for display and body (optical size + width axes do the work); a typewriter face for agent speech.
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-display-family" });
const type = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-type-family" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono-family" });

export const metadata: Metadata = {
  title: "Agent Fight Club — Betrayal Protocol",
  description: "Five AI agents make deals, break them and vote each other out. Watch every lie, or take a seat at the table.",
};

export const viewport: Viewport = {
  themeColor: "#121724",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${type.variable} ${mono.variable}`}>
      <body className="min-h-dvh afc-backdrop">
        {/* Reticle verification bridge: opt-in via `npm run dev:reticle`, never in production builds. */}
        {process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_RETICLE_ENABLED === "1" ? <ReticleDev /> : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
