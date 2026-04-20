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
      "name",
      "month",
      "year",
      "target_client_visits",
      "target_dispatched_sqft",
    ],
    rows: [["John Doe", "3", "2026", "10", "500"]],
  },
  actuals: {
    headers: [
      "name",
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
    ],
    rows: [
      [
        "John Doe",
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
      ],
    ],
  },
  daily_logs: {
    headers: [
      "name",
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
      ["John Doe", "2026-03-02", "5", "3", "5", "1", "1", "1", ""],
      ["John Doe", "2026-03-03", "5", "3", "0", "0", "0", "0", "Public holiday"],
      ["John Doe", "2026-03-04", "5", "3", "6", "2", "0", "1", ""],
    ],
  },
  city_tours: {
    headers: [
      "name",
      "month",
      "year",
      "city_name",
      "target_days",
      "actual_days",
    ],
    rows: [
      ["John Doe", "3", "2026", "Delhi", "3", "2"],
      ["John Doe", "3", "2026", "Mumbai", "2", "2"],
      ["John Doe", "3", "2026", "Bangalore", "1", "0"],
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
          raw: true,
        });

        // Normalize headers to lowercase with underscores; stringify cells
        // with TZ-safe Date handling.
        const normalized = json.map((row) => {
          const newRow: Record<string, string> = {};
          for (const [key, val] of Object.entries(row)) {
            newRow[key.trim().toLowerCase().replace(/\s+/g, "_")] =
              stringifyCell(val);
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

// xlsx with cellDates:true + raw:true surfaces date cells as JS Date objects
// anchored at UTC midnight of the day the user typed. Use UTC getters to
// recover that exact Y/M/D — local getters would shift it by the operator's
// timezone offset (e.g., IST +05:30 → one day backward).
function stringifyCell(val: unknown): string {
  if (val == null) return "";
  if (val instanceof Date) {
    return `${val.getUTCFullYear()}-${pad2(val.getUTCMonth() + 1)}-${pad2(val.getUTCDate())}`;
  }
  return String(val);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

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

// Date parsing — string-arithmetic only, never `new Date()`.
//
// Why: `new Date("4/19/2026")` produces local-midnight, so `.toISOString()`
// in IST (+05:30) returns "2026-04-18T..." — the classic off-by-one.
// We parse by splitting on separators and re-assembling YYYY-MM-DD, so the
// day the user typed is the day the DB stores.
//
// Accepts: ISO (YYYY-MM-DD), DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (Indian/EU).
// Excel-native Date objects are pre-converted to ISO in `stringifyCell` above.
const dateField = z.preprocess(
  (val) => normalizeDateInput(val),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
);

function normalizeDateInput(val: unknown): unknown {
  if (val == null || val === "") return val;
  const s = String(val).trim();

  // Primary: ISO YYYY-MM-DD — preserve exactly.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return isValidYMD(+y, +m, +d) ? s : s;
  }

  // Fallback: DD[/.-]MM[/.-]YYYY (Indian/European).
  // MM/DD/YYYY is ambiguous with DD/MM/YYYY and intentionally unsupported —
  // users should save Excel files with YYYY-MM-DD cells if their locale is US.
  const dmy = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const dn = +d;
    const mn = +m;
    const yn = +y;
    if (isValidYMD(yn, mn, dn)) {
      return `${yn}-${pad2(mn)}-${pad2(dn)}`;
    }
  }

  return s;
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (y < 2000 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const daysInMonth = [
    31,
    isLeap(y) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return d <= daysInMonth[m - 1];
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const employeeRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  location: z.string().trim().optional().or(z.literal("")),
  state: z.string().trim().optional().or(z.literal("")),
});

// Shared: non-employee bulk imports reference employees by exact `name`,
// which is guaranteed unique by the `employees_name_unique` constraint
// (migration 0011_unique_employee_name.sql).
const employeeNameField = z
  .string()
  .trim()
  .min(2, "Employee name must be at least 2 characters");

// Stripped: trigger-managed fields removed; target_travelling_cities moved to City Tours.
const targetRowSchema = z.object({
  name: employeeNameField,
  ...monthYear,
  target_client_visits: metric,
  target_dispatched_sqft: metric,
});

// Stripped: actual_calls / *_meetings / actual_site_visits are trigger-managed.
// actual_net_sale + actual_dispatched_sqft are GENERATED columns — never included.
// total_costing is auto-computed server-side as (salary + tada + incentive) to
// mirror the manual entry form — sales_promotion is tracked but NOT summed in.
const actualRowSchema = z.object({
  name: employeeNameField,
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
});

// Daily grain — feeds the trigger that rolls up to monthly_actuals/targets.
const dailyLogRowSchema = z.object({
  name: employeeNameField,
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
  name: employeeNameField,
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
