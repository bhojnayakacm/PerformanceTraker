import { Skeleton } from "@/components/ui/skeleton";

export default function EmployeesLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="rounded-lg border">
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-5 w-[25%]" />
              <Skeleton className="h-5 w-[15%]" />
              <Skeleton className="h-5 w-[20%]" />
              <Skeleton className="h-5 w-[15%]" />
              <Skeleton className="h-5 w-[10%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
