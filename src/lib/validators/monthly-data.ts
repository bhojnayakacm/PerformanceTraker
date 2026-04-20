import { z } from "zod";

/**
 * Per-city tour entry nested inside the monthly data form.
 * Submitted as an array matching the length of target_travelling_cities.
 */
// Days are NUMERIC(5,2) in the DB (migration 0012) — half-days are valid
// for both manual entry and bulk import.
export const cityTourEntrySchema = z.object({
  city_id: z.string().uuid("Please pick a city"),
  target_days: z.coerce
    .number()
    .min(0, "Cannot be negative")
    .max(31, "Cannot exceed 31 days"),
  actual_days: z.coerce
    .number()
    .min(0, "Cannot be negative")
    .max(31, "Cannot exceed 31 days"),
});

export type CityTourEntryInput = z.infer<typeof cityTourEntrySchema>;

export const monthlyDataSchema = z
  .object({
    // Targets (meetings & calls targets auto-sync from daily logs; tour_days gone)
    target_client_visits: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),
    target_dispatched_sqft: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),
    target_travelling_cities: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),

    // Actuals — performance (meetings/calls actuals auto-sync from daily logs)
    actual_client_visits: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),
    actual_conversions: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),

    // Actuals — dispatched quantity breakdown (drives net_sale & dispatched_sqft)
    actual_project_2: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),
    actual_project: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),
    actual_tile: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),
    actual_retail: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),
    actual_return: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative"),

    // Costing
    salary: z.coerce.number().min(0, "Cannot be negative"),
    tada: z.coerce.number().min(0, "Cannot be negative"),
    incentive: z.coerce.number().min(0, "Cannot be negative"),
    sales_promotion: z.coerce.number().min(0, "Cannot be negative"),

    // Nested city tours (must match target_travelling_cities length)
    city_tours: z.array(cityTourEntrySchema),
  })
  .refine(
    (v) => v.city_tours.length === v.target_travelling_cities,
    {
      message:
        "You must select a city for each travelling city target — counts must match.",
      path: ["city_tours"],
    }
  )
  .refine(
    (v) => {
      const ids = v.city_tours.map((t) => t.city_id);
      return new Set(ids).size === ids.length;
    },
    {
      message: "Each travelling city block must select a distinct city.",
      path: ["city_tours"],
    }
  );

export type MonthlyDataInput = z.infer<typeof monthlyDataSchema>;
