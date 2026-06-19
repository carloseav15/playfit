import { Eyebrow } from "@/components/ui/eyebrow";

export function SectionHead({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="mb-4 md:mb-6 grid gap-1.5 md:gap-2">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="font-display text-xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
        {title}
      </h1>
      <p className="max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">{copy}</p>
    </div>
  );
}
