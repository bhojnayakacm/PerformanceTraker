import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function CumulativeDataLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Title */}
      <div className="shrink-0 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)]">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-64 rounded-md" />
      </div>

      {/* Table */}
      <Card className="flex-1 min-h-0 flex flex-col border-0 py-0 gap-0 rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_4px_24px_-12px_rgba(79,70,229,0.12)] overflow-hidden">
        <CardContent className="flex-1 min-h-0 flex flex-col p-0">
          <div className="shrink-0 border-b-2 border-slate-200 bg-slate-100 px-4 py-3">
            <div className="flex gap-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 flex-1 rounded bg-slate-200" />
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-6 px-4 py-3 border-b border-border/40"
              >
                <div className="flex items-center gap-3 w-[18%]">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3.5 w-24 rounded" />
                    <Skeleton className="h-2.5 w-16 rounded" />
                  </div>
                </div>
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 flex-1 rounded" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
