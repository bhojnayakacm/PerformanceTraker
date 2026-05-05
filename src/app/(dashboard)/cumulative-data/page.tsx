import { Suspense } from "react";
import { CumulativeDataContent } from "./_components/cumulative-data-content";
import { CumulativeDataSkeleton } from "./_components/cumulative-data-skeleton";

/** Default range: the current Indian fiscal year (Apr → Mar). When the
 *  user lands on the page without URL params, we want a meaningful YTD
 *  view rather than an empty single month. */
function defaultFY(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const fyStart = m >= 4 ? y : y - 1;
  return {
    fromMonth: 4,
    fromYear: fyStart,
    toMonth: 3,
    toYear: fyStart + 1,
  };
}

/** Clamp the URL-provided range to a valid window: every value finite, and
 *  to ≥ from. If the user ever lands on an inverted/garbage range we fall
 *  back to the default rather than blowing up the server query. */
function parseRange(params: {
  fromMonth?: string;
  fromYear?: string;
  toMonth?: string;
  toYear?: string;
}) {
  const def = defaultFY(new Date());

  const safe = (raw: string | undefined, fallback: number, lo: number, hi: number) => {
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
  };

  const fromMonth = safe(params.fromMonth, def.fromMonth, 1, 12);
  const fromYear = safe(params.fromYear, def.fromYear, 2000, 2100);
  const toMonth = safe(params.toMonth, def.toMonth, 1, 12);
  const toYear = safe(params.toYear, def.toYear, 2000, 2100);

  const fromOrd = fromYear * 12 + fromMonth;
  const toOrd = toYear * 12 + toMonth;
  if (toOrd < fromOrd) return def;
  return { fromMonth, fromYear, toMonth, toYear };
}

export default async function CumulativeDataPage({
  searchParams,
}: {
  searchParams: Promise<{
    fromMonth?: string;
    fromYear?: string;
    toMonth?: string;
    toYear?: string;
    query?: string;
  }>;
}) {
  const params = await searchParams;
  const { fromMonth, fromYear, toMonth, toYear } = parseRange(params);
  const query = params.query?.trim() ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Cumulative Data</h1>
        <p className="text-muted-foreground mt-1">
          Aggregate performance across a custom month range — totals and
          monthly averages per employee.
        </p>
      </div>

      {/* Suspense key on the full range so any boundary change shows a
          skeleton; search changes use startTransition (old UI stays). */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense
          key={`${fromMonth}-${fromYear}-${toMonth}-${toYear}`}
          fallback={<CumulativeDataSkeleton />}
        >
          <CumulativeDataContent
            fromMonth={fromMonth}
            fromYear={fromYear}
            toMonth={toMonth}
            toYear={toYear}
            query={query}
          />
        </Suspense>
      </div>
    </div>
  );
}
