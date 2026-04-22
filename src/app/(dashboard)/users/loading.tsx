import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function UsersLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Title */}
      <div className="shrink-0 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)]">
        <Skeleton className="h-9 w-64 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Table */}
      <Card className="flex-1 min-h-0 flex flex-col border-0 py-0 gap-0 rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_4px_24px_-12px_rgba(79,70,229,0.12)] overflow-hidden">
        <CardContent className="flex-1 min-h-0 flex flex-col p-0">
          {/* Header */}
          <div className="shrink-0 bg-slate-100 border-b-2 border-slate-200 px-4 py-3">
            <div className="flex items-center gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 flex-1 rounded bg-slate-200" />
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3 border-b border-border/40"
              >
                <Skeleton className="h-5 w-[30%] rounded" />
                <Skeleton className="h-5 w-[25%] rounded" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-5 w-[15%] rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
