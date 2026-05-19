"use client";

/**
 * Date selector for Daily Logs — Prev / Date popover / Next / Today.
 *
 * Lives inside the table toolbar (a sibling of Search and Set Targets),
 * which keeps the unsaved-changes confirm fully synchronous and lets us
 * pass `dirtyCount` down through props instead of bridging a cross-tree
 * subscribable store. The toolbar sits OUTSIDE the dim/disable Card, so
 * the selector remains interactive while the table dims to 60% opacity
 * during a fetch — same UX guarantee the previous architecture provided.
 *
 * `useTransition` wraps `router.push` so the click handler returns
 * instantly while the RSC payload streams in the background. The Card's
 * `isFetching` overlay (driven by TanStack Query's `keepPreviousData`)
 * handles the visual dim.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { navigationPendingStore } from "@/lib/navigation-pending";

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toLocalDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + days);
  return toLocalDateString(shifted);
}

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${SHORT_DAYS[dow]}, ${d} ${LONG_MONTHS[m - 1]} ${y}`;
}

type Props = {
  date: string;
  /** Number of rows with unsaved edits. Drives the unsaved-changes
   *  confirm before navigating. Passed in as a prop now that the
   *  selector lives in the same tree as the view that tracks dirty
   *  state. */
  dirtyCount: number;
};

export function DailyLogDateSelector({ date, dirtyCount }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [calendarOpen, setCalendarOpen] = useState(false);
  // `mounted` gates the "Today" pill — Date.now() differs between server
  // render and client hydration if the user opens the page near midnight.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Mirror this hook-local isPending into the shared navigation store
  // so the data view below (which sits in a different tree branch and
  // has no other signal for in-flight RSC) can dim the moment the
  // user clicks Prev / Next / Today / a calendar day.
  useEffect(() => {
    if (isPending) {
      navigationPendingStore.start();
      return () => navigationPendingStore.end();
    }
  }, [isPending]);

  const selectedDate = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [date]);

  const today = useMemo(() => toLocalDateString(new Date()), []);

  const navigate = useCallback(
    (newDate: string) => {
      if (newDate === date) return;
      if (
        dirtyCount > 0 &&
        !window.confirm("You have unsaved changes. Discard?")
      ) {
        return;
      }
      // Merge with existing URL params so other filters (e.g. ?query=) survive.
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", newDate);
      startTransition(() => {
        router.push(`/daily-logs?${params.toString()}`);
      });
    },
    [date, dirtyCount, router, searchParams],
  );

  // We deliberately do NOT disable buttons on isPending here. The Card
  // below dims to opacity-60 during the fetch; double-disabling here
  // would make rapid Prev/Next clicks feel laggy.
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => navigate(shiftDate(date, -1))}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger
          render={
            <Button
              id="daily-logs-date-trigger"
              variant="outline"
              className="gap-2 px-3"
            />
          }
        >
          <CalendarDays className="h-4 w-4 text-primary/60" />
          <span className="font-medium">{formatShortDate(date)}</span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 shadow-lg" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(day) => {
              if (day) {
                setCalendarOpen(false);
                navigate(toLocalDateString(day));
              }
            }}
            defaultMonth={selectedDate}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => navigate(shiftDate(date, 1))}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {mounted && date !== today && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(today)}
        >
          Today
        </Button>
      )}
    </div>
  );
}
