import type { Metadata } from "next";

import { ProductApp } from "@/components/playfit/product-app";

export const metadata: Metadata = {
  title: "App",
  description: "Open the local-first Playfit game concierge.",
};

export default function AppPage() {
  return <ProductApp />;
}
