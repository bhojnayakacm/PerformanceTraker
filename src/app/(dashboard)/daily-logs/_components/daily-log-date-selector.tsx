"use client";

/**
 * Lifted date selector for Daily Logs.
 *
 * Previously this UI lived inside DailyLogView (the 1100-line table
 * component). Date changes drove a `key={date}` remount on the view,
 * which wiped column-resize state, sort, DnD ordering, and forced
 * Suspense to re-fall back to the full skeleton — a heavy interaction
 * for a "navigate to yesterday" click.
 *
 * Pulling the selector out as a sibling of the Suspense boundary means:
 *  1. The selector itself never enters a fallback state — it stays
 *     visible and clickable through every fetch.
 *  2. The data view below remounts only on cold mount; every subsequent
 *     date change is a normal prop update on the same instance, so
 *     resize/sort/DnD state survives.
 *  3. `useTransition` wraps `router.push` so the click handler returns
 *     instantly while the RSC payload streams in the background.
 *
 * The unsaved-changes confirm has to bridge a tree split — the view
 * tracks `dirty` state internally and lives inside Suspense, while this
 * selector lives outside. `useDirtyCount()` reads from a small
 * module-level store the view publishes into. See ../_lib/dirty-store.ts.
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
import { useDirtyCount } from "../_lib/dirty-store";

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
};

export function DailyLogDateSelector({ date }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [calendarOpen, setCalendarOpen] = useState(false);
  // `mounted` gates the "Today" pill — Date.now() differs between server
  // render and client hydration if the user opens the page near midnight.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dirtyCount = useDirtyCount();

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

  // We deliberately do NOT disable buttons on isPending here — the whole
  // point of the lift is that the selector stays interactive while the
  // view dims. The view itself drops to opacity-60 and gains a spinner;
  // double-disabling here would make rapid Prev/Next clicks feel laggy.
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
