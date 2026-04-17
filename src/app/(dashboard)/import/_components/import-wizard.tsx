"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  MapPin,
  RotateCcw,
  Sparkles,
  Target,
  Upload,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  type ImportType,
  type ValidatedRow,
  downloadTemplate,
  parseFile,
  validateRows,
} from "../_lib/import-helpers";
import {
  importActuals,
  importCityTours,
  importDailyLogs,
  importEmployees,
  importTargets,
} from "../actions";
import { FileDropzone } from "./file-dropzone";
import { PreviewTable } from "./preview-table";

/* ── Types ── */

type Step = "upload" | "preview" | "result";

type ImportResult = {
  imported: number;
  failed: number;
  errors: string[];
  notices?: string[];
};

type ModuleCategory = "master" | "monthly" | "daily";

type ModuleConfig = {
  value: ImportType;
  label: string;
  description: string;
  Icon: typeof Users;
  hint: string;
  category: ModuleCategory;
  columns: { name: string; required: boolean }[];
};

/* ── Module Definitions ──
   Monthly modules deliberately exclude:
     • daily-grain metrics (calls, meetings, site visits) — synced by
       trg_sync_daily_to_monthly from daily_metrics.
     • GENERATED columns (actual_net_sale, actual_dispatched_sqft).
     • target_travelling_cities — owned by the City Tours module.
   Use the "Daily Logs" module for per-day calls/meetings, and
   the "City Tours" module for per-city travel days.                  */

const MODULES: ModuleConfig[] = [
  {
    value: "employees",
    label: "Employees",
    description: "Bulk create or update employee records",
    Icon: Users,
    category: "master",
    hint: "Matched by emp_id — existing employees are updated, new ones inserted.",
    columns: [
      { name: "emp_id", required: true },
      { name: "name", required: true },
      { name: "location", required: false },
      { name: "state", required: false },
    ],
  },
  {
    value: "targets",
    label: "Monthly Targets",
    description: "Macro targets only — no daily metrics",
    Icon: Target,
    category: "monthly",
    hint: "Matched by emp_id + month + year. Daily-level targets (calls, meetings) are auto-synced from Daily Logs and must NOT appear here.",
    columns: [
      { name: "emp_id", required: true },
      { name: "month", required: true },
      { name: "year", required: true },
      { name: "target_client_visits", required: true },
      { name: "target_dispatched_sqft", required: true },
    ],
  },
  {
    value: "actuals",
    label: "Monthly Actuals",
    description: "Sales, costing & financial actuals",
    Icon: BarChart3,
    category: "monthly",
    hint: "Matched by emp_id + month + year. Daily metrics are auto-rolled-up. actual_net_sale and actual_dispatched_sqft are computed automatically.",
    columns: [
      { name: "emp_id", required: true },
      { name: "month", required: true },
      { name: "year", required: true },
      { name: "actual_client_visits", required: true },
      { name: "actual_conversions", required: true },
      { name: "actual_project", required: true },
      { name: "actual_project_2", required: true },
      { name: "actual_tile", required: true },
      { name: "actual_retail", required: true },
      { name: "actual_return", required: true },
      { name: "salary", required: true },
      { name: "tada", required: true },
      { name: "incentive", required: true },
      { name: "sales_promotion", required: true },
      { name: "total_costing", required: true },
    ],
  },
  {
    value: "daily_logs",
    label: "Daily Logs",
    description: "Per-day calls, meetings & site visits",
    Icon: CalendarDays,
    category: "daily",
    hint: "Matched by emp_id + date. Skip non-working days by simply omitting them from the CSV. Monthly totals are auto-calculated by the rollup trigger.",
    columns: [
      { name: "emp_id", required: true },
      { name: "date", required: true },
      { name: "target_calls", required: true },
      { name: "target_total_meetings", required: true },
      { name: "actual_calls", required: true },
      { name: "actual_architect_meetings", required: true },
      { name: "actual_client_meetings", required: true },
      { name: "actual_site_visits", required: true },
      { name: "remarks", required: false },
    ],
  },
  {
    value: "city_tours",
    label: "City Tours",
    description: "Per-city target & actual travel days",
    Icon: MapPin,
    category: "daily",
    hint: "Matched by emp_id + month + year + city. Unknown cities are auto-created and surfaced in the result panel.",
    columns: [
      { name: "emp_id", required: true },
      { name: "month", required: true },
      { name: "year", required: true },
      { name: "city_name", required: true },
      { name: "target_days", required: true },
      { name: "actual_days", required: true },
    ],
  },
];

const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  master: "Master Data",
  monthly: "Monthly Macro Data",
  daily: "Daily & Granular Data",
};

const CATEGORY_ORDER: ModuleCategory[] = ["master", "monthly", "daily"];

// Which module categories show in the wizard. Remove entries to hide a group.
const VISIBLE_CATEGORIES: ModuleCategory[] = ["master", "monthly", "daily"];

/* ── Component ── */

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [selectedModule, setSelectedModule] = useState<ImportType | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const validCount = validatedRows.filter((r) => r.isValid).length;
  const errorCount = validatedRows.filter((r) => !r.isValid).length;
  const activeModule = MODULES.find((m) => m.value === selectedModule);

  function selectModule(type: ImportType) {
    if (step !== "upload") return;
    setSelectedModule(type);
  }

  async function handleFileAccepted(file: File) {
    if (!selectedModule) return;
    try {
      const parsed = await parseFile(file);
      if (parsed.rows.length === 0) {
        toast.error("The file is empty or has no data rows.");
        return;
      }
      const validated = validateRows(parsed.rows, selectedModule);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setValidatedRows(validated);
      setStep("preview");
    } catch (err) {
      toast.error(`Failed to parse file: ${(err as Error).message}`);
    }
  }

  function handleImport() {
    if (!selectedModule) return;
    const validRows = validatedRows
      .filter((r) => r.isValid)
      .map((r) => r.data);

    startTransition(async () => {
      const actions = {
        employees: importEmployees,
        targets: importTargets,
        actuals: importActuals,
        daily_logs: importDailyLogs,
        city_tours: importCityTours,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await actions[selectedModule](validRows as any);

      if ("error" in res) {
        toast.error(res.error);
        return;
      }

      setResult(res);
      setStep("result");

      if (res.failed === 0) {
        toast.success(`Successfully imported ${res.imported} records.`);
      } else {
        toast.warning(
          `Imported ${res.imported} records. ${res.failed} failed.`,
        );
      }
    });
  }

  function resetToUpload() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setValidatedRows([]);
    setResult(null);
  }

  return (
    <div className="space-y-6">
      {/* ── Step Indicator ── */}
      <div className="flex items-center gap-2 text-sm">
        <StepPill
          label="1. Select & Upload"
          active={step === "upload"}
          done={step !== "upload"}
        />
        <Separator className="flex-1 max-w-8" />
        <StepPill
          label="2. Review"
          active={step === "preview"}
          done={step === "result"}
        />
        <Separator className="flex-1 max-w-8" />
        <StepPill label="3. Complete" active={step === "result"} done={false} />
      </div>

      {/* ── Module Selector (grouped by category) ── */}
      <div className="space-y-5">
        {CATEGORY_ORDER.filter((c) => VISIBLE_CATEGORIES.includes(c)).map((category) => {
          const modulesInCategory = MODULES.filter(
            (m) => m.category === category,
          );
          if (modulesInCategory.length === 0) return null;

          return (
            <div key={category} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1">
                {CATEGORY_LABELS[category]}
              </p>
              <div
                className={cn(
                  "grid gap-3",
                  modulesInCategory.length === 1 && "sm:grid-cols-1",
                  modulesInCategory.length === 2 && "sm:grid-cols-2",
                  modulesInCategory.length >= 3 &&
                    "sm:grid-cols-2 lg:grid-cols-3",
                )}
              >
                {modulesInCategory.map(
                  ({ value, label, description, Icon }) => {
                    const isSelected = selectedModule === value;
                    const isLocked = step !== "upload" && !isSelected;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={isLocked}
                        onClick={() => selectModule(value)}
                        className={cn(
                          "rounded-xl border p-4 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : isLocked
                              ? "opacity-40 cursor-not-allowed"
                              : "hover:border-muted-foreground/50 cursor-pointer",
                        )}
                      >
                        <div className="flex items-center gap-2 font-medium text-sm">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {label}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {description}
                        </p>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Upload Step ── */}
      {selectedModule && activeModule && step === "upload" && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  Import {activeModule.label}
                </CardTitle>
                <CardDescription>{activeModule.hint}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => downloadTemplate(selectedModule)}
              >
                <Download className="h-4 w-4 mr-1.5" />
                CSV Template
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Expected columns */}
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Expected Columns
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeModule.columns.map((col) => (
                  <Badge
                    key={col.name}
                    variant={col.required ? "default" : "secondary"}
                    className="text-xs font-mono"
                  >
                    {col.name}
                    {!col.required && (
                      <span className="ml-1 opacity-60">optional</span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            <FileDropzone onFileAccepted={handleFileAccepted} />
          </CardContent>
        </Card>
      )}

      {/* ── Preview Step ── */}
      {step === "preview" && activeModule && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName}
                </CardTitle>
                <CardDescription>
                  {validatedRows.length} rows parsed
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default">{validCount} valid</Badge>
                {errorCount > 0 && (
                  <Badge variant="destructive">{errorCount} errors</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorCount > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {errorCount} row{errorCount !== 1 ? "s" : ""} with validation
                  errors will be skipped during import.
                </p>
              </div>
            )}

            <PreviewTable rows={validatedRows} headers={headers} />

            <div className="flex justify-between">
              <Button variant="outline" onClick={resetToUpload}>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={validCount === 0 || isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import {validCount} Record{validCount !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Result Step ── */}
      {step === "result" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {result.imported}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500">
                  Imported
                </p>
              </div>
              {result.failed > 0 && (
                <div className="flex-1 rounded-lg bg-red-50 dark:bg-red-500/10 p-4 text-center">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {result.failed}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-500">
                    Failed
                  </p>
                </div>
              )}
            </div>

            {result.notices && result.notices.length > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10 p-3 space-y-1">
                <p className="text-sm font-medium text-sky-800 dark:text-sky-200 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Notices
                </p>
                {result.notices.map((note, i) => (
                  <p
                    key={i}
                    className="text-xs text-sky-700/80 dark:text-sky-200/80"
                  >
                    {note}
                  </p>
                ))}
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/20 p-3 space-y-1">
                <p className="text-sm font-medium text-destructive">Errors:</p>
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive/80">
                    {err}
                  </p>
                ))}
              </div>
            )}

            <Button onClick={resetToUpload}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Import More
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Helpers ── */

function StepPill({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <Badge
      variant={active ? "default" : done ? "secondary" : "outline"}
      className="text-xs"
    >
      {label}
    </Badge>
  );
}
