import { Skeleton } from "@/components/ui/skeleton";

export default function PlayLoading() {
  return (
    <main className="mx-auto grid min-h-screen w-[min(1100px,calc(100%-2rem))] content-start gap-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="size-10 rounded-full" />
      </div>
      <Skeleton className="h-12 w-full max-w-2xl" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </main>
  );
}
