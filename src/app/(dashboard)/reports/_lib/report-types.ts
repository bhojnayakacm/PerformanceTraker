export type ReportFilters = {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  employeeId: string; // "all" or a specific UUID
};

export type ReportRow = {
  employeeName: string;
  empId: string;
  location: string;
  month: number;
  year: number;
  targetMeetings: number;
  actualMeetings: number;
  targetCalls: number;
  actualCalls: number;
  targetClientVisits: number;
  actualClientVisits: number;
  targetDispatchSqft: number;
  actualDispatchSqft: number;
  actualDispatchAmount: number;
  targetTourDays: number;
  actualTourDays: number;
  actualConversions: number;
  salary: number;
  tada: number;
  incentive: number;
  salesPromotion: number;
  totalCosting: number;
};

const MONTH_NAMES = [
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

export function formatMonthYear(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
