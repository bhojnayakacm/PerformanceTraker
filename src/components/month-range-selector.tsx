"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type MonthYear = { month: number; year: number };

type Props = {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  basePath: string;
  /** Same contract as MonthSelector — extras to merge into the URL,
   *  empty-string values delete the param. */
  getExtraParams?: () => Record<string, string>;
};

/** Helpers to convert (month, year) ↔ ordinal so we can compare ranges
 *  without repeating the y*12+m incantation. */
const ord = ({ month, year }: MonthYear) => year * 12 + (month - 1);
const fromOrd = (n: number): MonthYear => ({
  year: Math.floor(n / 12),
  month: (n % 12) + 1,
});

/** Indian fiscal year (April → March) anchored to a reference date. */
function currentFY(now: Date): { from: MonthYear; to: MonthYear } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const fyStart = m >= 4 ? y : y - 1;
  return {
    from: { month: 4, year: fyStart },
    to: { month: 3, year: fyStart + 1 },
  };
}

function lastNMonths(now: Date, n: number): { from: MonthYear; to: MonthYear } {
  const to: MonthYear = { month: now.getMonth() + 1, year: now.getFullYear() };
  const from = fromOrd(ord(to) - (n - 1));
  return { from, to };
}

function calendarYTD(now: Date): { from: MonthYear; to: MonthYear } {
  const y = now.getFullYear();
  return {
    from: { month: 1, year: y },
    to: { month: now.getMonth() + 1, year: y },
  };
}

export function MonthRangeSelector({
  fromMonth,
  fromYear,
  toMonth,
  toYear,
  basePath,
  getExtraParams,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Draft state — local to the popover. Reset to the applied range each
  // time the popover opens so a "Cancel" really does discard.
  const [draftFrom, setDraftFrom] = useState<MonthYear>({
    month: fromMonth,
    year: fromYear,
  });
  const [draftTo, setDraftTo] = useState<MonthYear>({
    month: toMonth,
    year: toYear,
  });

  useEffect(() => {
    if (open) {
      setDraftFrom({ month: fromMonth, year: fromYear });
      setDraftTo({ month: toMonth, year: toYear });
    }
  }, [open, fromMonth, fromYear, toMonth, toYear]);

  const years = useMemo(() => {
    const cy = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => cy - 4 + i);
  }, []);

  const isInverted = ord(draftFrom) > ord(draftTo);

  const apply = (from: MonthYear, to: MonthYear) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("fromMonth", String(from.month));
    params.set("fromYear", String(from.year));
    params.set("toMonth", String(to.month));
    params.set("toYear", String(to.year));
    const extras = getExtraParams?.();
    if (extras) {
      for (const [k, v] of Object.entries(extras)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
    }
    router.push(`${basePath}?${params.toString()}`);
    setOpen(false);
  };

  const handleApply = () => {
    if (isInverted) return;
    apply(draftFrom, draftTo);
  };

  /** Quick presets — apply directly (no draft round-trip), since clicking
   *  one is an explicit choice and a second click for "Apply" would feel
   *  redundant. */
  const presets = useMemo(() => {
    const now = new Date();
    const fy = currentFY(now);
    const lastFy = currentFY(new Date(now.getFullYear() - 1, now.getMonth(), 1));
    return [
      { label: "This FY", range: fy },
      { label: "Last FY", range: lastFy },
      { label: "Last 6 months", range: lastNMonths(now, 6) },
      { label: "Last 12 months", range: lastNMonths(now, 12) },
      { label: "Calendar YTD", range: calendarYTD(now) },
    ] as const;
  }, []);

  // Recognise whether the currently-applied range matches one of the
  // presets, so we can highlight it in the popover for orientation.
  const activePresetIndex = useMemo(() => {
    return presets.findIndex(
      (p) =>
        p.range.from.month === fromMonth &&
        p.range.from.year === fromYear &&
        p.range.to.month === toMonth &&
        p.range.to.year === toYear,
    );
  }, [presets, fromMonth, fromYear, toMonth, toYear]);

  const triggerLabel = `${MONTHS_SHORT[fromMonth - 1]} ${fromYear} — ${MONTHS_SHORT[toMonth - 1]} ${toYear}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-9 gap-2 px-3">
            <CalendarRange className="h-4 w-4 text-primary/60" />
            <span className="font-medium tracking-tight">{triggerLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[420px] p-0 ring-slate-200"
      >
        <div className="flex flex-col">
          {/* Presets rail */}
          <div className="border-b border-slate-100 px-3 pt-3 pb-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-1.5">
              Quick Ranges
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p, i) => {
                const isActive = i === activePresetIndex;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => apply(p.range.from, p.range.to)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700",
                    )}
                  >
                    {isActive && <Check className="h-3 w-3" />}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* From / To pickers */}
          <div className="grid grid-cols-2 gap-3 px-3 py-3">
            <RangePanel
              label="From"
              value={draftFrom}
              onChange={setDraftFrom}
              years={years}
            />
            <RangePanel
              label="To"
              value={draftTo}
              onChange={setDraftTo}
              years={years}
            />
          </div>

          {isInverted && (
            <div className="-mt-1 px-3 pb-2 text-xs text-rose-600">
              &ldquo;From&rdquo; must be earlier than or equal to &ldquo;To&rdquo;.
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
            <span className="text-xs text-slate-500">
              {!isInverted &&
                `${ord(draftTo) - ord(draftFrom) + 1} month${
                  ord(draftTo) - ord(draftFrom) + 1 === 1 ? "" : "s"
                } selected`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={isInverted}
                className="h-8 bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RangePanel({
  label,
  value,
  onChange,
  years,
}: {
  label: string;
  value: MonthYear;
  onChange: (v: MonthYear) => void;
  years: number[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        <Select
          value={String(value.month)}
          onValueChange={(v) => onChange({ ...value, month: Number(v) })}
        >
          <SelectTrigger className="flex-1 bg-white">
            <span className="flex-1 text-left">
              {MONTHS_FULL[value.month - 1]}
            </span>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {MONTHS_FULL.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(value.year)}
          onValueChange={(v) => onChange({ ...value, year: Number(v) })}
        >
          <SelectTrigger className="w-[88px] bg-white">
            <span className="flex-1 text-left">{value.year}</span>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
