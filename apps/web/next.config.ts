import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  transpilePackages: ["@playfit/core"],
  allowedDevOrigins: ["localhost", "127.0.0.1"],
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
    ],
  },
};

export default nextConfig;
