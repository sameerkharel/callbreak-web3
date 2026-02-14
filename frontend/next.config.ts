import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // ignore build errors
    ignoreBuildErrors: true,
  },
  eslint: {
    // ignore eslint build errors 
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;