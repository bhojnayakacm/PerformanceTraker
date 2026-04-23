"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const MONTHS = [
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

type Props = {
  month: number;
  year: number;
  basePath: string;
  /**
   * Optional extras to merge into the URL at navigation time.
   * Callers use this to inject client-held values (e.g. a pending
   * debounced search) that may not yet be in the URL when the user
   * clicks a month control — prevents filter loss when a sibling
   * Suspense boundary remounts on month/year change.
   * Key with empty-string value means "delete this param".
   */
  getExtraParams?: () => Record<string, string>;
};

export function MonthSelector({
  month,
  year,
  basePath,
  getExtraParams,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = (m: number, y: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    const extras = getExtraParams?.();
    if (extras) {
      for (const [k, v] of Object.entries(extras)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
    }
    router.push(`${basePath}?${params.toString()}`);
  };

  const goPrev = () => {
    if (month === 1) navigate(12, year - 1);
    else navigate(month - 1, year);
  };

  const goNext = () => {
    if (month === 12) navigate(1, year + 1);
    else navigate(month + 1, year);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon-sm" onClick={goPrev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 px-1">
        <CalendarDays className="h-4 w-4 text-primary/60" />

        <Select
          value={String(month)}
          onValueChange={(val) => navigate(Number(val), year)}
        >
          <SelectTrigger className="w-[130px] bg-card">
            <span className="flex-1 text-left">{MONTHS[month - 1]}</span>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {MONTHS.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(year)}
          onValueChange={(val) => navigate(month, Number(val))}
        >
          <SelectTrigger className="w-[85px] bg-card">
            <span className="flex-1 text-left">{year}</span>
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

      <Button variant="outline" size="icon-sm" onClick={goNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
