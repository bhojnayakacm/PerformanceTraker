import { Skeleton } from "@/components/ui/skeleton";

export default function MonthlyDataLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-56 rounded-md" />
      </div>
      <div className="rounded-lg border">
        <div className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-5 w-[20%]" />
              <Skeleton className="h-5 w-[12%]" />
              <Skeleton className="h-5 w-[12%]" />
              <Skeleton className="h-5 w-[12%]" />
              <Skeleton className="h-5 w-[12%]" />
              <Skeleton className="h-5 w-[12%]" />
              <Skeleton className="h-5 w-[12%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
