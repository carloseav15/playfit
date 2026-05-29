import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type React from "react";
import "./globals.css";

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
    default: "Playfit | Find your next game",
    template: "%s | Playfit",
  },
  description:
    "A local-first game concierge that recommends what to play next based on personal fit, not hype.",
  openGraph: {
    title: "Playfit | Find your next game",
    description:
      "A local-first game concierge that recommends what to play next based on personal fit, not hype.",
    type: "website",
    images: ["/screenshots/dashboard.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Playfit | Find your next game",
    description:
      "A local-first game concierge that recommends what to play next based on personal fit, not hype.",
    images: ["/screenshots/dashboard.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
