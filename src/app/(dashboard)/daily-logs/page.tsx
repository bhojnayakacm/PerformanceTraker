import { Suspense } from "react";
import { redirect } from "next/navigation";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getAuthUser } from "@/lib/queries/auth";
import { getQueryClient } from "@/lib/query-client";
import {
  fetchDailyLogs,
  dailyLogsQueryKey,
  type DailyLogsParams,
} from "./_lib/fetch-daily-logs";
import { DailyLogViewContainer } from "./_components/daily-log-view-container";
import { DailyLogsSkeleton } from "./_components/daily-logs-skeleton";

export default async function DailyLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; query?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = params.date ?? today;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Header — title + color legend. The date selector now lives in the
       *  table's toolbar (a sibling of Search and Set Targets) so all
       *  filter controls cluster together; the legend stays here as
       *  ambient page context. */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Logs</h1>
          <p className="text-muted-foreground mt-1">
            Record daily targets and actuals for meetings and calls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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

      {/* No `key` on Suspense — date changes must NOT unmount the table,
       *  otherwise `placeholderData: keepPreviousData` has nothing to fall
       *  back to and the user sees a fresh skeleton on every interaction. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<DailyLogsSkeleton />}>
          <DailyLogsLoader date={date} />
        </Suspense>
      </div>
    </div>
  );
}

async function DailyLogsLoader({ date }: { date: string }) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const fetchParams: DailyLogsParams = {
    date,
    userId: auth.id,
    userRole: auth.role,
  };

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: dailyLogsQueryKey(fetchParams),
    queryFn: () => fetchDailyLogs(auth.supabase, fetchParams),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DailyLogViewContainer
        date={date}
        userId={auth.id}
        userRole={auth.role}
      />
    </HydrationBoundary>
  );
}
