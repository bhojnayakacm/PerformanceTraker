"use client";

/**
 * Client wrapper for DailyLogView — same shape as
 * PerformanceGridContainer (Monthly Data) and CumulativeGridContainer
 * (Cumulative Data). Owns the data lifecycle (useQuery +
 * keepPreviousData + browser Supabase); leaves presentation entirely
 * to DailyLogView.
 *
 * On a date change the URL flips, `date` prop changes, the queryKey
 * changes, and TanStack returns the previous result (via
 * placeholderData) until the new fetch resolves. `isFetching` flows
 * through to the view to drive the 60% dim + toolbar spinner. DailyLogView
 * itself stays mounted across date changes — the old `key={date}`
 * remount that wiped column-resize / sort / DnD state is gone.
 */

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";
import {
  fetchDailyLogs,
  dailyLogsQueryKey,
  type DailyLogsParams,
} from "../_lib/fetch-daily-logs";
import { DailyLogView } from "./daily-log-view";

type Props = {
  date: string;
  userId: string;
  userRole: UserRole;
};

export function DailyLogViewContainer({ date, userId, userRole }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const fetchParams: DailyLogsParams = useMemo(
    () => ({ date, userId, userRole }),
    [date, userId, userRole],
  );

  const { data, isFetching } = useQuery({
    queryKey: dailyLogsQueryKey(fetchParams),
    queryFn: () => fetchDailyLogs(supabase, fetchParams),
    placeholderData: keepPreviousData,
  });

  return (
    <DailyLogView
      employees={data?.employees ?? []}
      initialData={data?.dataMap ?? {}}
      date={date}
      userId={userId}
      userRole={userRole}
      isFetching={isFetching}
    />
  );
}
