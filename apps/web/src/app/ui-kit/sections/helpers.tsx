import type React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function TokenSwatch({
  token,
}: {
  token: { name: string; var: string; light: string; dark: string };
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div
        className="mb-2 h-10 rounded-md border border-border"
        style={{ background: `var(${token.var})` }}
      />
      <p className="text-xs font-bold">{token.name}</p>
      <p className="font-mono text-[11px] text-muted-foreground">{token.var}</p>
      <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground break-all">
        <span>L: {token.light}</span>
        <span>D: {token.dark}</span>
      </div>
    </div>
  );
}

export function SectionHeader({ title, id }: { title: string; id: string }) {
  return (
    <h2
      id={id}
      className="mb-6 mt-10 scroll-mt-20 font-display text-3xl font-extrabold tracking-tight first:mt-0"
    >
      {title}
      <Separator className="mt-2" />
    </h2>
  );
}

export function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary p-3">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
        active
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/60",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
