import { Skeleton } from "@/components/ui/skeleton";

export default function UsersLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="rounded-lg border">
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-5 w-[30%]" />
              <Skeleton className="h-5 w-[25%]" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-5 w-[15%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
