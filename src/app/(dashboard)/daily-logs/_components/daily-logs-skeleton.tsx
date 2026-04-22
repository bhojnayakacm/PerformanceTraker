import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Skeleton that matches the actual Daily Logs toolbar + table structure. */
export function DailyLogsSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-44 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>

      {/* Table */}
      <Card className="flex-1 min-h-0 flex flex-col border-0 py-0 gap-0 shadow-sm ring-1 ring-border/50 overflow-hidden">
        <CardContent className="flex-1 min-h-0 flex flex-col p-0">
          {/* Header */}
          <div className="bg-slate-100 dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-600 shrink-0">
            <div className="flex gap-4 p-3">
              <Skeleton className="h-5 w-32 bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1 flex gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-5 flex-1 rounded bg-slate-200 dark:bg-slate-700"
                  />
                ))}
              </div>
              <Skeleton className="h-5 w-28 bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3 border-b border-border/40"
              >
                <div className="flex items-center gap-2.5 w-32 shrink-0">
                  <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3.5 w-20 rounded" />
                    <Skeleton className="h-2.5 w-14 rounded" />
                  </div>
                </div>
                {Array.from({ length: 6 }).map((_, j) => (
                  <Skeleton
                    key={j}
                    className="h-8 w-16 rounded-md shrink-0"
                  />
                ))}
                <Skeleton className="h-8 w-32 rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
