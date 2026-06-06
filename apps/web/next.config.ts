import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@playfit/core"],
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
