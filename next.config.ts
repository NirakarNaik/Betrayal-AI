import { withReticle } from '@reticlehq/next';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withReticle(nextConfig);
