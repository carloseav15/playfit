import { Spinner } from "@/components/ui/spinner";

export default function AppLoading() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="grid gap-3">
        <Spinner size="lg" className="mx-auto" />
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Playfit
        </p>
        <h1 className="font-display text-3xl font-extrabold">Loading Playfit</h1>
        <p className="text-muted-foreground">Reading game catalog and your saved profile.</p>
      </div>
    </main>
  );
}
