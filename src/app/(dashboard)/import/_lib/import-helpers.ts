import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";

// ── Types ──

export type ImportType =
  | "employees"
  | "targets"
  | "actuals"
  | "daily_logs"
  | "city_tours";

export type ValidatedRow<T = Record<string, unknown>> = {
  rowNumber: number;
  data: T;
  errors: string[];
  isValid: boolean;
};

export type ParsedData = {
  headers: string[];
  rows: Record<string, string>[];
};

// ── Templates ──
//
// Monthly Targets/Actuals templates EXCLUDE all fields that are auto-synced
// from daily_metrics by the `trg_sync_daily_to_monthly` trigger:
//   targets:  target_total_calls, target_total_meetings
//   actuals:  actual_calls, actual_architect_meetings,
//             actual_client_meetings, actual_site_visits
// They also exclude GENERATED columns (actual_net_sale, actual_dispatched_sqft)
// and target_travelling_cities (now driven by the City Tours module).

const TEMPLATES: Record<ImportType, { headers: string[]; rows: string[][] }> = {
  employees: {
    headers: ["emp_id", "name", "location", "state"],
    rows: [
      ["ACM01157", "John Doe", "Mumbai", "Maharashtra"],
      ["ACM01234", "Jane Smith", "Delhi", "Delhi"],
    ],
  },
  targets: {
    headers: [
      "emp_id",
      "month",
      "year",
      "target_client_visits",
      "target_dispatched_sqft",
    ],
    rows: [["ACM01157", "3", "2026", "10", "500"]],
  },
  actuals: {
    headers: [
      "emp_id",
      "month",
      "year",
      "actual_client_visits",
      "actual_conversions",
      "actual_project",
      "actual_project_2",
      "actual_tile",
      "actual_retail",
      "actual_return",
      "salary",
      "tada",
      "incentive",
      "sales_promotion",
      "total_costing",
    ],
    rows: [
      [
        "ACM01157",
        "3",
        "2026",
        "8",
        "5",
        "150",
        "100",
        "120",
        "80",
        "50",
        "50000",
        "10000",
        "5000",
        "3000",
        "180000",
      ],
    ],
  },
  daily_logs: {
    headers: [
      "emp_id",
      "date",
      "target_calls",
      "target_total_meetings",
      "actual_calls",
      "actual_architect_meetings",
      "actual_client_meetings",
      "actual_site_visits",
      "remarks",
    ],
    rows: [
      ["ACM01157", "2026-03-02", "5", "3", "5", "1", "1", "1", ""],
      ["ACM01157", "2026-03-03", "5", "3", "0", "0", "0", "0", "Public holiday"],
      ["ACM01157", "2026-03-04", "5", "3", "6", "2", "0", "1", ""],
    ],
  },
  city_tours: {
    headers: [
      "emp_id",
      "month",
      "year",
      "city_name",
      "target_days",
      "actual_days",
    ],
    rows: [
      ["ACM01157", "3", "2026", "Delhi", "3", "2"],
      ["ACM01157", "3", "2026", "Mumbai", "2", "2"],
      ["ACM01157", "3", "2026", "Bangalore", "1", "0"],
    ],
  },
};

export function downloadTemplate(type: ImportType) {
  const { headers, rows } = TEMPLATES[type];
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type}_template.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Parsers ──

export function parseFile(file: File): Promise<ParsedData> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return parseCSV(file);
  if (ext === "xlsx" || ext === "xls") return parseExcel(file);
  throw new Error(`Unsupported file type: .${ext}`);
}

function parseCSV(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data as Record<string, string>[],
        });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

function parseExcel(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
          raw: false,
        });

        // Normalize headers to lowercase with underscores
        const normalized = json.map((row) => {
          const newRow: Record<string, string> = {};
          for (const [key, val] of Object.entries(row)) {
            newRow[key.trim().toLowerCase().replace(/\s+/g, "_")] = String(
              val ?? ""
            );
          }
          return newRow;
        });

        const headers =
          normalized.length > 0 ? Object.keys(normalized[0]) : [];
        resolve({ headers, rows: normalized });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

// ── Schemas ──

const monthYear = {
  month: z.coerce
    .number()
    .int()
    .min(1, "Month must be 1-12")
    .max(12, "Month must be 1-12"),
  year: z.coerce
    .number()
    .int()
    .min(2000, "Year must be 2000+")
    .max(2100, "Year must be ≤ 2100"),
};

// Coerces strings → 0 when blank, accepts whole-number metrics ≥ 0.
const metric = z.coerce.number().min(0).default(0);

// Accepts YYYY-MM-DD directly, or any value parseable by `new Date(...)`
// (handles Excel dates that XLSX surfaces as ISO timestamps with cellDates).
const dateField = z.preprocess(
  (val) => {
    if (val == null || val === "") return val;
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return str;
  },
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
);

const employeeRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  location: z.string().trim().optional().or(z.literal("")),
  state: z.string().trim().optional().or(z.literal("")),
});

// Stripped: trigger-managed fields removed; target_travelling_cities moved to City Tours.
const targetRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  ...monthYear,
  target_client_visits: metric,
  target_dispatched_sqft: metric,
});

// Stripped: actual_calls / *_meetings / actual_site_visits are trigger-managed.
// actual_net_sale + actual_dispatched_sqft are GENERATED columns — never included.
const actualRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  ...monthYear,
  actual_client_visits: metric,
  actual_conversions: metric,
  actual_project: metric,
  actual_project_2: metric,
  actual_tile: metric,
  actual_retail: metric,
  actual_return: metric,
  salary: metric,
  tada: metric,
  incentive: metric,
  sales_promotion: metric,
  total_costing: metric,
});

// Daily grain — feeds the trigger that rolls up to monthly_actuals/targets.
const dailyLogRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  date: dateField,
  target_calls: metric,
  target_total_meetings: metric,
  actual_calls: metric,
  actual_architect_meetings: metric,
  actual_client_meetings: metric,
  actual_site_visits: metric,
  remarks: z
    .string()
    .trim()
    .max(500, "Remarks must be ≤ 500 characters")
    .optional()
    .or(z.literal("")),
});

// City names are normalized server-side; here we just enforce non-empty.
const cityTourRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  ...monthYear,
  city_name: z
    .string()
    .trim()
    .min(2, "City name must be at least 2 characters")
    .max(80, "City name must be ≤ 80 characters"),
  target_days: z.coerce
    .number()
    .int("target_days must be a whole number")
    .min(0)
    .max(31, "target_days must be ≤ 31")
    .default(0),
  actual_days: z.coerce
    .number()
    .int("actual_days must be a whole number")
    .min(0)
    .max(31, "actual_days must be ≤ 31")
    .default(0),
});

const schemas: Record<ImportType, z.ZodSchema> = {
  employees: employeeRowSchema,
  targets: targetRowSchema,
  actuals: actualRowSchema,
  daily_logs: dailyLogRowSchema,
  city_tours: cityTourRowSchema,
};

export type EmployeeImportRow = z.infer<typeof employeeRowSchema>;
export type TargetImportRow = z.infer<typeof targetRowSchema>;
export type ActualImportRow = z.infer<typeof actualRowSchema>;
export type DailyLogImportRow = z.infer<typeof dailyLogRowSchema>;
export type CityTourImportRow = z.infer<typeof cityTourRowSchema>;

export function validateRows(
  rows: Record<string, string>[],
  type: ImportType,
): ValidatedRow[] {
  const schema = schemas[type];

  return rows.map((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) {
      return {
        rowNumber: index + 1,
        data: result.data,
        errors: [],
        isValid: true,
      };
    }
    return {
      rowNumber: index + 1,
      data: row,
      errors: result.error.errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`,
      ),
      isValid: false,
    };
  });
}
