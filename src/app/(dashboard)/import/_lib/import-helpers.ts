import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";

// ── Types ──

export type ImportType = "employees" | "targets" | "actuals";

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

const TEMPLATES: Record<ImportType, { headers: string[]; rows: string[][] }> = {
  employees: {
    headers: ["emp_id", "name", "location"],
    rows: [
      ["ACM01157", "John Doe", "Mumbai"],
      ["ACM01234", "Jane Smith", "Delhi"],
    ],
  },
  targets: {
    headers: [
      "emp_id",
      "month",
      "year",
      "target_total_meetings",
      "target_total_calls",
      "target_client_visits",
      "target_dispatched_sqft",
      "target_tour_days",
      "target_travelling_cities",
    ],
    rows: [["ACM01157", "3", "2026", "50", "100", "10", "500", "20", "5"]],
  },
  actuals: {
    headers: [
      "emp_id",
      "month",
      "year",
      "actual_calls",
      "actual_architect_meetings",
      "actual_client_meetings",
      "actual_site_visits",
      "actual_client_visits",
      "actual_dispatched_sqft",
      "actual_dispatched_amount",
      "actual_conversions",
      "actual_tour_days",
      "actual_travelling_cities",
      "salary",
      "tada",
      "incentive",
      "sales_promotion",
    ],
    rows: [
      [
        "ACM01157",
        "3",
        "2026",
        "92",
        "12",
        "35",
        "8",
        "8",
        "450",
        "250000",
        "5",
        "18",
        "Mumbai, Pune, Delhi",
        "50000",
        "10000",
        "5000",
        "3000",
      ],
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
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
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

// ── Validators ──

const employeeRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  location: z.string().trim().optional().or(z.literal("")),
});

const targetRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  month: z.coerce
    .number()
    .int()
    .min(1, "Month must be 1-12")
    .max(12, "Month must be 1-12"),
  year: z.coerce
    .number()
    .int()
    .min(2000, "Year must be 2000+")
    .max(2100),
  target_total_meetings: z.coerce.number().min(0),
  target_total_calls: z.coerce.number().min(0),
  target_client_visits: z.coerce.number().min(0),
  target_dispatched_sqft: z.coerce.number().min(0),
  target_tour_days: z.coerce.number().min(0),
  target_travelling_cities: z.coerce.number().min(0),
});

const actualRowSchema = z.object({
  emp_id: z.string().trim().min(1, "Emp ID is required"),
  month: z.coerce
    .number()
    .int()
    .min(1, "Month must be 1-12")
    .max(12, "Month must be 1-12"),
  year: z.coerce
    .number()
    .int()
    .min(2000, "Year must be 2000+")
    .max(2100),
  actual_calls: z.coerce.number().min(0),
  actual_architect_meetings: z.coerce.number().min(0),
  actual_client_meetings: z.coerce.number().min(0),
  actual_site_visits: z.coerce.number().min(0),
  actual_client_visits: z.coerce.number().min(0),
  actual_dispatched_sqft: z.coerce.number().min(0),
  actual_dispatched_amount: z.coerce.number().min(0),
  actual_conversions: z.coerce.number().min(0),
  actual_tour_days: z.coerce.number().min(0),
  actual_travelling_cities: z.string().default(""),
  salary: z.coerce.number().min(0),
  tada: z.coerce.number().min(0),
  incentive: z.coerce.number().min(0),
  sales_promotion: z.coerce.number().min(0),
});

const schemas: Record<ImportType, z.ZodSchema> = {
  employees: employeeRowSchema,
  targets: targetRowSchema,
  actuals: actualRowSchema,
};

export type EmployeeImportRow = z.infer<typeof employeeRowSchema>;
export type TargetImportRow = z.infer<typeof targetRowSchema>;
export type ActualImportRow = z.infer<typeof actualRowSchema>;

export function validateRows(
  rows: Record<string, string>[],
  type: ImportType
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
        (e) => `${e.path.join(".")}: ${e.message}`
      ),
      isValid: false,
    };
  });
}
