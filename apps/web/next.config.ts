import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  transpilePackages: ["@playfit/core"],
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.153"],
  async redirects() {
    return [
      {
        source: "/app",
        destination: "/",
        permanent: false,
      },
      {
        source: "/app/:path*",
        destination: "/:path*",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.scrap.be",
      },
      {
        protocol: "https",
        hostname: "**.rawg.io",
      },
      {
        protocol: "https",
        hostname: "**.media-amazon.com",
      },
      {
        protocol: "https",
        hostname: "**.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "**.gamepedia.com",
      },
      {
        protocol: "https",
        hostname: "images.igdb.com",
      },
    ],
  },
};

export default nextConfig;
