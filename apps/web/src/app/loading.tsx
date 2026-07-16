import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto grid min-h-screen w-[min(1100px,calc(100%-2rem))] content-start gap-6 py-10">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-12 w-full max-w-xl" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </main>
  );
}
