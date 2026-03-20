"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
};

export function MonthSelector({ month, year }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = (m: number, y: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    router.push(`/monthly-data?${params.toString()}`);
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
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" onClick={goPrev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 px-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <select
          value={month}
          onChange={(e) => navigate(parseInt(e.target.value), year)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {MONTHS.map((name, i) => (
            <option key={i + 1} value={i + 1}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => navigate(month, parseInt(e.target.value))}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <Button variant="outline" size="icon-sm" onClick={goNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
