"use client";

import { useTransition, useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  employeeCreateSchema,
  type EmployeeCreateInput,
} from "@/lib/validators/employee";
import { cn, getAvatarColor, getInitials } from "@/lib/utils";
import { createEmployee, updateEmployee } from "../actions";
import type { Employee } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
  /** Full employee roster — drives the reporting-manager combobox.
   *  Filtered on render to active Tier-1 candidates only. */
  allEmployees: Employee[];
};

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  allEmployees,
}: Props) {
  const isEditing = !!employee;
  const [isPending, startTransition] = useTransition();

  const form = useForm<EmployeeCreateInput>({
    resolver: zodResolver(employeeCreateSchema),
    defaultValues: {
      emp_id: "",
      name: "",
      location: "",
      state: "",
      date_of_joining: "",
      reporting_manager_id: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        emp_id: employee?.emp_id ?? "",
        name: employee?.name ?? "",
        location: employee?.location ?? "",
        state: employee?.state ?? "",
        // Postgres DATE comes back as YYYY-MM-DD; <input type="date">
        // takes the same shape, so it's a 1:1 hand-off.
        date_of_joining: employee?.date_of_joining ?? "",
        reporting_manager_id: employee?.reporting_manager_id ?? "",
      });
    }
  }, [open, employee, form]);

  /* Eligible reporting managers — strict 2-tier rule:
   *   • Must themselves be Tier-1 (reporting_manager_id IS NULL).
   *   • Cannot be the employee currently being edited (no self-report —
   *     also enforced by the employees_no_self_report CHECK).
   *   • Active-only: an inactive senior employee shouldn't be the *new*
   *     manager assignment (existing assignments stay valid).
   *
   * The Postgres trigger from migration 0016 is the source of truth; this
   * filter is just to keep the picker honest. If `employee` itself has
   * direct reports, the server will (correctly) reject any attempt to
   * assign them a manager — we surface that error via toast. */
  const candidates = useMemo(() => {
    return allEmployees
      .filter((e) => e.reporting_manager_id == null && e.is_active)
      .filter((e) => !employee || e.id !== employee.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees, employee]);

  function onSubmit(values: EmployeeCreateInput) {
    startTransition(async () => {
      const result = isEditing
        ? await updateEmployee({ ...values, id: employee!.id })
        : await createEmployee(values);

      if ("error" in result) {
        if ("field" in result && result.field) {
          form.setError(result.field as keyof EmployeeCreateInput, {
            message: result.error,
          });
        } else {
          toast.error(result.error);
        }
        return;
      }

      toast.success(
        isEditing ? "Employee updated successfully" : "Employee added successfully"
      );
      form.reset();
      onOpenChange(false);
    });
  }

  const selectedManagerId = form.watch("reporting_manager_id");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Employee" : "Add Employee"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the employee record."
              : "Fill in the details to add a new employee."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="emp_id">Employee ID</Label>
            <Input
              id="emp_id"
              placeholder="e.g. ACM01157"
              {...form.register("emp_id")}
            />
            {form.formState.errors.emp_id && (
              <p className="text-sm text-destructive">
                {form.formState.errors.emp_id.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="e.g. John Doe"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g. Mumbai"
                {...form.register("location")}
              />
              {form.formState.errors.location && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.location.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                placeholder="e.g. Maharashtra"
                {...form.register("state")}
              />
              {form.formState.errors.state && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.state.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date_of_joining">Date of Joining</Label>
            <Input
              id="date_of_joining"
              type="date"
              {...form.register("date_of_joining")}
            />
            {form.formState.errors.date_of_joining && (
              <p className="text-sm text-destructive">
                {form.formState.errors.date_of_joining.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reporting_manager">Reporting Manager</Label>
            <ReportingManagerCombobox
              value={selectedManagerId ?? ""}
              onChange={(v) =>
                form.setValue("reporting_manager_id", v, {
                  shouldDirty: true,
                  shouldValidate: false,
                })
              }
              candidates={candidates}
            />
            {form.formState.errors.reporting_manager_id && (
              <p className="text-sm text-destructive">
                {form.formState.errors.reporting_manager_id.message}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground leading-snug">
              Leave empty to keep the employee at the top level. Only Tier-1
              employees (those with no manager themselves) are listed.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing
                  ? "Saving..."
                  : "Adding..."
                : isEditing
                  ? "Save Changes"
                  : "Add Employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Reporting Manager combobox ──────────────────────────────────────────────
 *
 * Single-select combobox with built-in search. Built bespoke (rather than
 * reaching for the base-ui Select) because the candidate list can grow into
 * the dozens — a plain Select with no filtering scrolls the user's eyes off
 * the page. The pattern mirrors the existing manager-assignment-dialog
 * combobox so the dialog feels familiar; this one is single-select and
 * holds its own selected-value rendering.
 *
 * No portal — the panel is inside the dialog and dialog already provides
 * the focus trap; the dropdown trapping its own focus would conflict.
 * z-50 keeps it above the form fields below it.
 * ──────────────────────────────────────────────────────────────────────── */
function ReportingManagerCombobox({
  value,
  onChange,
  candidates,
}: {
  value: string;
  onChange: (v: string) => void;
  candidates: Employee[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click — same pattern as ManagerAssignmentDialog.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Stop Escape from bubbling to the Dialog (which would close the whole form).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return candidates;
    const s = search.toLowerCase();
    return candidates.filter(
      (e) =>
        e.name.toLowerCase().includes(s) ||
        e.emp_id.toLowerCase().includes(s),
    );
  }, [candidates, search]);

  const selected = useMemo(
    () => candidates.find((c) => c.id === value),
    [candidates, value],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
    },
    [onChange],
  );

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        id="reporting_manager"
        role="combobox"
        aria-expanded={open}
        aria-controls="reporting-manager-listbox"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex w-full h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer transition-colors",
          "hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "ring-2 ring-ring",
        )}
      >
        {selected ? (
          <>
            <div
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold ${getAvatarColor(selected.name)}`}
            >
              {getInitials(selected.name)}
            </div>
            <span className="truncate">{selected.name}</span>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {selected.emp_id}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-sm opacity-60 hover:opacity-100 hover:text-destructive transition-colors"
              aria-label="Clear reporting manager"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">No reporting manager</span>
        )}
        {!selected && (
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 top-[calc(100%+4px)] left-0 w-full flex flex-col rounded-lg border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ maxHeight: 280 }}
        >
          <div className="shrink-0 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Search managers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="shrink-0 border-t" />
          <div
            id="reporting-manager-listbox"
            role="listbox"
            className="flex-1 min-h-0 overflow-y-auto py-1"
          >
            {/* Explicit "No reporting manager" option — clears the selection
                without forcing the user to find a clear-button. */}
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors",
                value === "" && "bg-muted/30",
              )}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <div
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                  value === ""
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-input",
                )}
              >
                {value === "" && <Check className="h-3 w-3" />}
              </div>
              <span className="text-muted-foreground italic">
                No reporting manager
              </span>
            </button>

            {filtered.map((emp) => {
              const checked = value === emp.id;
              return (
                <button
                  key={emp.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors",
                    checked && "bg-muted/30",
                  )}
                  onClick={() => {
                    onChange(emp.id);
                    setOpen(false);
                  }}
                >
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                      checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <div
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold ${getAvatarColor(emp.name)}`}
                  >
                    {getInitials(emp.name)}
                  </div>
                  <span className="truncate">{emp.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {emp.emp_id}
                  </span>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {search
                  ? "No managers match"
                  : "No eligible managers found — promote a Tier-1 employee first."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
