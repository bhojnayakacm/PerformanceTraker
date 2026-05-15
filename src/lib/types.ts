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
 *  count of *elapsed* calendar months in the selected range — the range is
 *  clamped to the current month, so a "whole fiscal year" filter opened in
 *  May yields 2, not 12. It's the divisor behind every monthly-average cell,
 *  and dividing realized actuals by months that haven't happened yet would
 *  understate performance. `totalCosting` has no target, so it stays a bare
 *  number rather than a `CumulativeMetric`. */
export type EmployeeCumulativeData = {
  employee: Employee;
  numberOfMonths: number;
  clientVisits: CumulativeMetric;
  dispatchedSqft: CumulativeMetric;
  tourDays: CumulativeMetric;
  totalCosting: number;
};

export type Profile = Tables<"profiles">;

/** Profile enriched with the count of `manager_assignments` rows pointing at
 *  it (i.e. how many employees this user is responsible for as a Custom
 *  Admin). Always 0 for non-custom_admin roles. Populated by the User
 *  Management page only; the bare `Profile` type remains the canonical wire
 *  representation everywhere else. */
export type ProfileWithCount = Profile & {
  assignmentCount: number;
};

/** A single (employee → Custom Admin) claim, joined with the manager's
 *  display name for use in UI hints. Threaded through the Users page so the
 *  assignment dialog can lock employees already owned by a different Custom
 *  Admin and surface a "Assigned to {name}" affordance, preventing silent
 *  reassignment at the source. */
export type EmployeeAssignment = {
  employee_id: string;
  manager_id: string;
  manager_name: string;
};

export type UserRole = "super_admin" | "custom_admin" | "editor" | "viewer";
