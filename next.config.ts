import { withReticle } from "@reticlehq/next";
import type { NextConfig } from "next";

// Reticle verification instrumentation is opt-in (`npm run dev:reticle`): it stamps every JSX
// element at compile time and hooks the runtime, which slows down everyday development.
const reticleEnabled = process.env.RETICLE === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_RETICLE_ENABLED: reticleEnabled ? "1" : "0" },
};

export default reticleEnabled ? withReticle(nextConfig) : nextConfig;
