import { Skeleton } from "@/components/ui/skeleton";
import { DailyLogsSkeleton } from "./_components/daily-logs-skeleton";

export default function DailyLogsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <DailyLogsSkeleton />
      </div>
    </div>
  );
}
