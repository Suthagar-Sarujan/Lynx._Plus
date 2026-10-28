/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a test build run without touching the folder a running dev server uses.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // These ship native bindings; keep them external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas', 'sharp', '@prisma/client']
  },
  // BullMQ lazily imports this optional dependency; we don't use Valkey.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), '@valkey/valkey-glide'];
    }
    return config;
  }
};

module.exports = nextConfig;
