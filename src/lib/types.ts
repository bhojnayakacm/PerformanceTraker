import type { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";

export type Employee = Tables<"employees">;
export type EmployeeInsert = TablesInsert<"employees">;
export type EmployeeUpdate = TablesUpdate<"employees">;

export type MonthlyTarget = Tables<"monthly_targets">;
export type MonthlyActual = Tables<"monthly_actuals">;
export type DailyMetric = Tables<"daily_metrics">;
export type City = Tables<"cities">;
export type MonthlyCityTour = Tables<"monthly_city_tours">;

/**
 * A per-city tour row with its city metadata joined in.
 * Used when loading the employee detail sheet so we can render the city name.
 */
export type CityTourWithCity = MonthlyCityTour & {
  city: Pick<City, "id" | "name">;
};

export type EmployeeMonthlyData = {
  employee: Employee;
  target: MonthlyTarget | null;
  actual: MonthlyActual | null;
  cityTours: CityTourWithCity[];
};

/** Pair of cumulative actual + target totals for a single metric over a
 *  multi-month period. Avg-per-month is derived at render time from the
 *  enclosing row's `numberOfMonths` so the type stays scalar-only. */
export type CumulativeMetric = {
  actual: number;
  target: number;
};

/** One row of the Cumulative Data view. `numberOfMonths` is the inclusive
 *  count of calendar months in the selected range (used as the divisor for
 *  every monthly-average display in the row). `totalCosting` has no target,
 *  so it stays a bare number rather than a `CumulativeMetric`. */
export type EmployeeCumulativeData = {
  employee: Employee;
  numberOfMonths: number;
  clientVisits: CumulativeMetric;
  dispatchedSqft: CumulativeMetric;
  tourDays: CumulativeMetric;
  totalCosting: number;
};

export type Profile = Tables<"profiles">;

export type UserRole = "super_admin" | "manager" | "editor" | "viewer";
