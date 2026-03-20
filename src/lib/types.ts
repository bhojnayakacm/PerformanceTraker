import type { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";

export type Employee = Tables<"employees">;
export type EmployeeInsert = TablesInsert<"employees">;
export type EmployeeUpdate = TablesUpdate<"employees">;

export type MonthlyTarget = Tables<"monthly_targets">;
export type MonthlyActual = Tables<"monthly_actuals">;

export type EmployeeMonthlyData = {
  employee: Employee;
  target: MonthlyTarget | null;
  actual: MonthlyActual | null;
};

export type UserRole = "super_admin" | "editor" | "viewer";
