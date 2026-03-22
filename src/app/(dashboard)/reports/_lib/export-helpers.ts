import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { ReportRow } from "./report-types";
import { formatMonthYear } from "./report-types";

type ExportRow = Record<string, string | number>;

function toExportRows(rows: ReportRow[]): ExportRow[] {
  return rows.map((r) => ({
    "Employee Name": r.employeeName,
    "Emp ID": r.empId,
    Location: r.location,
    Period: formatMonthYear(r.month, r.year),
    "Meetings (Target)": r.targetMeetings,
    "Meetings (Actual)": r.actualMeetings,
    "Calls (Target)": r.targetCalls,
    "Calls (Actual)": r.actualCalls,
    "Client Visits (Target)": r.targetClientVisits,
    "Client Visits (Actual)": r.actualClientVisits,
    "Dispatch SQFT (Target)": r.targetDispatchSqft,
    "Dispatch SQFT (Actual)": r.actualDispatchSqft,
    "Dispatch Amount": r.actualDispatchAmount,
    "Tour Days (Target)": r.targetTourDays,
    "Tour Days (Actual)": r.actualTourDays,
    Conversions: r.actualConversions,
    Salary: r.salary,
    "TA/DA": r.tada,
    Incentive: r.incentive,
    "Sales Promotion": r.salesPromotion,
    "Total Costing": r.totalCosting,
  }));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToExcel(rows: ReportRow[], filename: string) {
  const data = toExportRows(rows);
  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-size columns
  const colWidths = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(
      key.length,
      ...data.map((row) => String(row[key] ?? "").length)
    ),
  }));
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename);
}

export function exportToCSV(rows: ReportRow[], filename: string) {
  const data = toExportRows(rows);
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}
