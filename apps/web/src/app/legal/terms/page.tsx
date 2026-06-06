import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto grid w-[min(720px,calc(100%-2rem))] gap-6 py-12 md:py-20">
        <Button asChild variant="ghost" className="w-fit">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to Playfit
          </Link>
        </Button>

        <h1 className="font-display text-4xl font-black tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: June 2026</p>

        <div className="grid gap-4 text-muted-foreground">
          <section className="grid gap-2">
            <h2 className="font-display text-xl font-extrabold text-foreground">Use of service</h2>
            <p>
              Playfit is provided as a personal game recommendation tool. You agree to use it for
              its intended purpose and not to abuse the service, including but not limited to
              excessive API calls or automated scraping.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-xl font-extrabold text-foreground">Account</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials.
              You may delete your account and all associated data at any time from the Profile
              section.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-xl font-extrabold text-foreground">Disclaimer</h2>
            <p>
              Playfit is provided &quot;as is&quot; without warranty of any kind. Recommendations
              are generated algorithmically and may not always match your preferences.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-xl font-extrabold text-foreground">Changes</h2>
            <p>
              These terms may be updated from time to time. Continued use of Playfit after changes
              constitutes acceptance of the new terms.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
