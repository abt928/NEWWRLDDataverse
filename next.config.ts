import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@simplewebauthn/server'],
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
