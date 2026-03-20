"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Loader2,
  Target,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import { importEmployees, importTargets, importActuals } from "../actions";
import { FileDropzone } from "./file-dropzone";
import { PreviewTable } from "./preview-table";

type Step = "upload" | "preview" | "result";

type ImportResult = {
  imported: number;
  failed: number;
  errors: string[];
};

const TYPE_META: {
  value: ImportType;
  label: string;
  description: string;
  Icon: typeof Users;
}[] = [
  {
    value: "employees",
    label: "Employees",
    description: "Import employee records (Emp ID, Name, Location)",
    Icon: Users,
  },
  {
    value: "targets",
    label: "Monthly Targets",
    description: "Import monthly performance targets by employee",
    Icon: Target,
  },
  {
    value: "actuals",
    label: "Monthly Actuals",
    description: "Import monthly actuals, costing, and city data",
    Icon: BarChart3,
  },
];

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [importType, setImportType] = useState<ImportType | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const validCount = validatedRows.filter((r) => r.isValid).length;
  const errorCount = validatedRows.filter((r) => !r.isValid).length;

  async function handleFileAccepted(file: File) {
    if (!importType) return;

    try {
      const parsed = await parseFile(file);
      if (parsed.rows.length === 0) {
        toast.error("The file is empty or has no data rows.");
        return;
      }
      const validated = validateRows(parsed.rows, importType);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setValidatedRows(validated);
      setStep("preview");
    } catch (err) {
      toast.error(`Failed to parse file: ${(err as Error).message}`);
    }
  }

  function handleImport() {
    if (!importType) return;

    const validRows = validatedRows
      .filter((r) => r.isValid)
      .map((r) => r.data);

    startTransition(async () => {
      const actions = {
        employees: importEmployees,
        targets: importTargets,
        actuals: importActuals,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await actions[importType](validRows as any);

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
          `Imported ${res.imported} records. ${res.failed} failed.`
        );
      }
    });
  }

  function reset() {
    setStep("upload");
    setImportType(null);
    setFileName("");
    setHeaders([]);
    setValidatedRows([]);
    setResult(null);
  }

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 text-sm">
        <StepBadge
          label="1. Upload"
          active={step === "upload"}
          done={step !== "upload"}
        />
        <Separator className="flex-1 max-w-8" />
        <StepBadge
          label="2. Review"
          active={step === "preview"}
          done={step === "result"}
        />
        <Separator className="flex-1 max-w-8" />
        <StepBadge
          label="3. Import"
          active={step === "result"}
          done={false}
        />
      </div>

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {TYPE_META.map(({ value, label, description, Icon }) => {
              const isSelected = importType === value;
              return (
                <Card
                  key={value}
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20"
                      : "hover:border-muted-foreground/50"
                  }`}
                  onClick={() => setImportType(value)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      {label}
                    </CardTitle>
                    <CardAction>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadTemplate(value);
                        }}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Template
                      </Button>
                    </CardAction>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>

          {importType && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">
                Upload your{" "}
                {TYPE_META.find((t) => t.value === importType)?.label} file
              </h3>
              <FileDropzone onFileAccepted={handleFileAccepted} />
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {validatedRows.length} rows parsed
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="default">{validCount} valid</Badge>
              {errorCount > 0 && (
                <Badge variant="destructive">{errorCount} errors</Badge>
              )}
            </div>
          </div>

          <PreviewTable rows={validatedRows} headers={headers} />

          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>
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
                  Import {validCount} Records
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === "result" && result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import Complete</CardTitle>
              <CardDescription>
                Here&apos;s a summary of the import operation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {result.imported}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500">
                    Successfully imported
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

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/20 p-3 space-y-1">
                  <p className="text-sm font-medium text-destructive">
                    Errors:
                  </p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive/80">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Button onClick={reset}>Import More Data</Button>
        </div>
      )}
    </div>
  );
}

function StepBadge({
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
