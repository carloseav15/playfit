import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto grid w-[min(720px,calc(100%-2rem))] gap-6 py-12 md:py-20">
        <Button asChild variant="ghost" className="w-fit">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to Playfit
          </Link>
        </Button>

        <h1 className="font-display text-4xl font-black tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: June 2026</p>

        <div className="grid gap-4 text-muted-foreground">
          <section className="grid gap-2">
            <h2 className="font-display text-xl font-extrabold text-foreground">Data we collect</h2>
            <p>
              Playfit collects the minimum data needed to provide personalized game recommendations:
              your email address (if you create an account), the games you add to your library, your
              ratings and play statuses, and your selected platforms.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-xl font-extrabold text-foreground">How we use it</h2>
            <p>
              Your data is used exclusively to generate your taste profile and recommendations. We
              do not sell, share, or use your data for advertising or training third-party models.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-xl font-extrabold text-foreground">Data storage</h2>
            <p>
              Your profile and game data are stored securely via Supabase. You can delete all your
              data at any time from the Profile section of the app.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-xl font-extrabold text-foreground">Contact</h2>
            <p>
              If you have questions about this policy, please open an issue on the Playfit
              repository.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
