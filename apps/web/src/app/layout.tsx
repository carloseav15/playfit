import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import type React from "react";
import "./globals.css";

import { ThemeToggle } from "../components/theme-toggle";

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
  url: "https://playfit.app",
  description:
    "Playfit turns your library into calm, honest reads for what to play, skip, or come back to.",
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
  metadataBase: new URL("https://playfit.app"),
  title: {
    default: "Playfit | Game decisions you can trust",
    template: "%s | Playfit",
  },
  description:
    "Playfit turns your library into calm, honest reads for what to play, skip, or come back to.",
  openGraph: {
    title: "Playfit | Game decisions you can trust",
    description:
      "Playfit turns your library into calm, honest reads for what to play, skip, or come back to.",
    type: "website",
    images: ["/screenshots/dashboard.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Playfit | Game decisions you can trust",
    description:
      "Playfit turns your library into calm, honest reads for what to play, skip, or come back to.",
    images: ["/screenshots/dashboard.jpg"],
  },
  other: {
    "application/ld+json": JSON.stringify(jsonLd),
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#main-content"
            className="fixed -top-full left-4 z-[100] rounded-b-md bg-accent px-4 py-2 text-sm font-bold text-accent-foreground shadow-md transition-all focus:top-0 focus:outline-none"
          >
            Skip to content
          </a>
          <ThemeToggle />
          <div id="main-content">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
