import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/auth/"],
    },
    sitemap: "https://playfit-gold.vercel.app/sitemap.xml",
  };
}
