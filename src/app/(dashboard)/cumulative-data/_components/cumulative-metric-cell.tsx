/* ── CumulativeMetricCell ──────────────────────────────────────────────────
 *
 * Two-line dense cell. Top line is the period total (actual / target with
 * a bar + pill matching MetricCell's colour scale). Bottom line is the
 * monthly average — text-slate-500, smaller, lower visual weight, so the
 * eye lands on the total first and the average reads as supporting detail.
 *
 * Currency variant: skips the bar (no target → no achievement %), shows the
 * absolute total in slate-900 medium weight + the per-month average below.
 *
 * Visual rationale for the dense layout:
 *   • Achievement-bar lives on the top row only — adding a second bar
 *     for the average would double the vertical mass and bury the totals.
 *   • Numbers all use `tabular-nums` so columns align across rows even
 *     when digit counts vary (15 → 150 → 1,500).
 *   • Avg prefix is a small all-caps pill-style label (text-[10px],
 *     uppercase, slate-400) to mark it semantically without drawing
 *     attention away from the digits.
 * ────────────────────────────────────────────────────────────────────────── */

const formatNumber = (n: number) => n.toLocaleString("en-IN");

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

/** Avg formatter: tighter than total formatter — drops decimals so the row
 *  reads "Avg 15 / mo" rather than "Avg 15.42 / mo". For currency we still
 *  round to whole rupees. */
const formatAvg = (n: number, currency: boolean) => {
  const rounded = Math.round(n);
  return currency ? formatCurrency(rounded) : formatNumber(rounded);
};

type CumulativeCellProps = {
  actual: number;
  target?: number;
  numberOfMonths: number;
  /** Pure-number display (no target, no bar). Currency formatting on. */
  currency?: boolean;
};

export function CumulativeMetricCell({
  actual,
  target,
  numberOfMonths,
  currency = false,
}: CumulativeCellProps) {
  const monthsSafe = numberOfMonths > 0 ? numberOfMonths : 1;
  const avg = actual / monthsSafe;

  // Currency-only variant — Total Costing column. No target, just two
  // stacked numbers with the avg muted.
  if (currency) {
    if (!actual) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }
    return (
      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {formatCurrency(actual)}
        </span>
        <span className="text-[11px] tabular-nums text-slate-500">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Avg
          </span>
          {formatAvg(avg, true)}
          <span className="text-slate-400"> / mo</span>
        </span>
      </div>
    );
  }

  const targetVal = target ?? 0;

  // No target set anywhere in the period — show actual + avg only,
  // matching MetricCell's "missing target" affordance with a muted look.
  if (!targetVal) {
    if (!actual) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }
    return (
      <div className="flex flex-col gap-0.5 min-w-[110px]">
        <span className="text-sm font-semibold tabular-nums text-slate-700">
          {formatNumber(actual)}
        </span>
        <span className="text-[11px] tabular-nums text-slate-500">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Avg
          </span>
          {formatAvg(avg, false)}
          <span className="text-slate-400"> / mo</span>
        </span>
      </div>
    );
  }

  const pct = Math.round((actual / targetVal) * 100);
  const barColor =
    pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500";
  const pillStyle =
    pct >= 90
      ? "bg-emerald-100 text-emerald-700"
      : pct >= 70
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";

  return (
    <div className="space-y-1.5 min-w-[120px]">
      {/* Total line — bold actual, muted target, no bar yet */}
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold tabular-nums text-slate-900">
          {formatNumber(actual)}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          / {formatNumber(targetVal)}
        </span>
      </div>
      {/* Bar + pill */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span
          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums ${pillStyle}`}
        >
          {pct}%
        </span>
      </div>
      {/* Avg line */}
      <div className="text-[11px] tabular-nums text-slate-500">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Avg
        </span>
        {formatAvg(avg, false)}
        <span className="text-slate-400"> / mo</span>
      </div>
    </div>
  );
}
