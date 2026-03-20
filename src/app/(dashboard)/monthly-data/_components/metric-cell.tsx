type MetricCellProps = {
  target?: number | null;
  actual?: number | null;
};

export function MetricCell({ target, actual }: MetricCellProps) {
  const actualVal = actual ?? 0;

  if (!target || target === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {actualVal > 0 ? actualVal.toLocaleString("en-IN") : "—"}
      </span>
    );
  }

  const pct = Math.round((actualVal / target) * 100);
  const barColor =
    pct >= 90
      ? "bg-emerald-500"
      : pct >= 70
        ? "bg-amber-500"
        : "bg-red-500";
  const textColor =
    pct >= 90
      ? "text-emerald-700 dark:text-emerald-400"
      : pct >= 70
        ? "text-amber-700 dark:text-amber-400"
        : "text-red-700 dark:text-red-400";

  return (
    <div className="space-y-1 min-w-[80px]">
      <div className="flex items-baseline gap-1 text-sm">
        <span className="font-medium">
          {actualVal.toLocaleString("en-IN")}
        </span>
        <span className="text-muted-foreground text-xs">
          / {target.toLocaleString("en-IN")}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-medium tabular-nums ${textColor}`}>
          {pct}%
        </span>
      </div>
    </div>
  );
}
