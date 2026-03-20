import { z } from "zod";

export const monthlyDataSchema = z.object({
  // Targets
  target_total_meetings: z.coerce.number().min(0),
  target_total_calls: z.coerce.number().min(0),
  target_client_visits: z.coerce.number().min(0),
  target_dispatched_sqft: z.coerce.number().min(0),
  target_tour_days: z.coerce.number().min(0),
  target_travelling_cities: z.coerce.number().min(0),

  // Actuals - Meetings & Calls
  actual_calls: z.coerce.number().min(0),
  actual_architect_meetings: z.coerce.number().min(0),
  actual_client_meetings: z.coerce.number().min(0),
  actual_site_visits: z.coerce.number().min(0),

  // Actuals - Performance
  actual_client_visits: z.coerce.number().min(0),
  actual_dispatched_sqft: z.coerce.number().min(0),
  actual_dispatched_amount: z.coerce.number().min(0),
  actual_conversions: z.coerce.number().min(0),
  actual_tour_days: z.coerce.number().min(0),
  actual_travelling_cities: z.string(),

  // Costing
  salary: z.coerce.number().min(0),
  tada: z.coerce.number().min(0),
  incentive: z.coerce.number().min(0),
  sales_promotion: z.coerce.number().min(0),
});

export type MonthlyDataInput = z.infer<typeof monthlyDataSchema>;
