const hints: Record<string, string> = {
  Match: "How closely this game matches the evidence Playfit has so far. Higher is better.",
  "Watch-outs": "Possible reasons this game could get in your way. Lower is better.",
  Confidence: "How much evidence sits behind this read.",
};

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-secondary p-3" title={hints[label] ?? ""}>
      <span className="block text-muted-foreground">{label}</span>
      <strong className="block truncate font-mono text-sm">{value}</strong>
    </div>
  );
}
