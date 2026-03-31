type MetricCellProps = {
  target?: number | null;
  actual?: number | null;
};

export function MetricCell({ target, actual }: MetricCellProps) {
  const actualVal = actual ?? 0;

  if (!target || target === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {actualVal > 0 ? actualVal.toLocaleString("en-IN") : "\u2014"}
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
  const pillStyle =
    pct >= 90
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
      : pct >= 70
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";

  return (
    <div className="space-y-1.5 min-w-[100px]">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold tabular-nums">
          {actualVal.toLocaleString("en-IN")}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          / {target.toLocaleString("en-IN")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span
          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none ${pillStyle}`}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}
