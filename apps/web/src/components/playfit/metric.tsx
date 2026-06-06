const hints: Record<string, string> = {
  Fit: "How well this game matches your taste (0–100). Higher is better.",
  Friction: "How much might annoy you based on past dislikes (0–100). Lower is better.",
  Signal: "Confidence in this recommendation based on how many games you've rated.",
};

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-secondary p-3" title={hints[label] ?? ""}>
      <span className="block text-muted-foreground">{label}</span>
      <strong className="block truncate font-mono text-sm">{value}</strong>
    </div>
  );
}
