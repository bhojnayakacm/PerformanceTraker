import { Suspense } from "react";
import { MonthlyDataContent } from "./_components/monthly-data-content";
import { MonthlyDataTableSkeleton } from "./_components/monthly-data-skeleton";

export default async function MonthlyDataPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    year?: string;
    query?: string;
  }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1;
  const year = params.year ? parseInt(params.year) : now.getFullYear();
  const query = params.query?.trim() ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Monthly Data</h1>
        <p className="text-muted-foreground mt-1">
          Track monthly targets and actuals for all employees.
        </p>
      </div>

      {/* Suspense key on month+year so period changes show skeleton.
          Search changes use startTransition (old UI stays visible). */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense
          key={`${month}-${year}`}
          fallback={<MonthlyDataTableSkeleton />}
        >
          <MonthlyDataContent month={month} year={year} query={query} />
        </Suspense>
      </div>
    </div>
  );
}
