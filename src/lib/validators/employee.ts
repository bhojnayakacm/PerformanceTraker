import { z } from "zod";

export const employeeCreateSchema = z.object({
  emp_id: z
    .string()
    .trim()
    .min(1, "Employee ID is required")
    .max(20, "Employee ID must be 20 characters or fewer"),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be 100 characters or fewer"),
  location: z.string().trim().max(100).optional().or(z.literal("")),
});

export const employeeUpdateSchema = employeeCreateSchema.extend({
  id: z.string().uuid(),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
