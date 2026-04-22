import { Suspense } from "react";
import { DailyLogsData } from "./_components/daily-logs-data";
import { DailyLogsSkeleton } from "./_components/daily-logs-skeleton";

export default async function DailyLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = params.date ?? today;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Logs</h1>
          <p className="text-muted-foreground mt-1">
            Record daily targets and actuals for meetings and calls.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300 dark:bg-amber-950/40 dark:border-amber-800" />
            Unsaved
          </span>
          <span aria-hidden className="text-muted-foreground/40">
            &middot;
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-emerald-100 border border-emerald-500" />
            &ge;&nbsp;90%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-yellow-100 border border-yellow-400" />
            70&ndash;89%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-red-100 border border-red-500" />
            &lt;&nbsp;70%
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<DailyLogsSkeleton />}>
          <DailyLogsData date={date} />
        </Suspense>
      </div>
    </div>
  );
}
