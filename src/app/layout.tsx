import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const display = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display-family" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans-family" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-family" });

export const metadata: Metadata = {
  title: "Agent Fight Club — Betrayal Protocol",
  description: "Watch AI agents negotiate, betray and compete in a deterministic social deduction arena.",
};

export const viewport: Viewport = {
  themeColor: "#06050a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh afc-backdrop">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
