import type { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";

export type Employee = Tables<"employees">;
export type EmployeeInsert = TablesInsert<"employees">;
export type EmployeeUpdate = TablesUpdate<"employees">;
export type UserRole = "super_admin" | "editor" | "viewer";
