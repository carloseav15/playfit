export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-secondary p-3">
      <span className="block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <strong className="mt-1 block truncate font-mono text-sm">{value}</strong>
    </div>
  );
}
