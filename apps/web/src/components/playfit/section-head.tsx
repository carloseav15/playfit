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
    <div className="mb-6 grid gap-2">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">{title}</h1>
      <p className="max-w-2xl text-muted-foreground">{copy}</p>
    </div>
  );
}
