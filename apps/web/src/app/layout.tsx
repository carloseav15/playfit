import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import type React from "react";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#070a12" },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Playfit",
  url: "https://playfit-gold.vercel.app",
  description:
    "Playfit helps you decide what to play next with precise, explainable recommendations built from your taste, library, and platform access.",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://playfit-gold.vercel.app"),
  title: {
    default: "Playfit | Find what to play next",
    template: "%s | Playfit",
  },
  description:
    "Playfit helps you decide what to play next with precise, explainable recommendations built from your taste, library, and platform access.",
  icons: {
    icon: [
      {
        url: "/playfit_logo_light.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/playfit_logo_dark.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
  openGraph: {
    title: "Playfit | Find what to play next",
    description:
      "Precise, explainable game recommendations for deciding what to start, resume, save, or skip.",
    type: "website",
    url: "https://playfit-gold.vercel.app",
    images: [
      {
        url: "/og.webp",
        width: 1920,
        height: 1200,
        alt: "Playfit product screens showing play-next recommendations, game analysis, saved picks, taste mapping, and affinity map.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Playfit | Find what to play next",
    description:
      "Precise, explainable game recommendations for deciding what to start, resume, save, or skip.",
    images: ["/og.webp"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head />
      <body>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#main-content"
            className="fixed -top-full left-4 z-[100] rounded-b-md bg-accent px-4 py-2 text-sm font-bold text-accent-foreground shadow-md transition-all focus:top-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Skip to content
          </a>
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
