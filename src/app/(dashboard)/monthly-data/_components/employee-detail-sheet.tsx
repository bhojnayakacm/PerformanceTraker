"use client";

import { useEffect, useTransition } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { EmployeeMonthlyData, UserRole } from "@/lib/types";
import {
  monthlyDataSchema,
  type MonthlyDataInput,
} from "@/lib/validators/monthly-data";
import { saveMonthlyData } from "../actions";

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: EmployeeMonthlyData | null;
  month: number;
  year: number;
  userRole: UserRole;
};

function getDefaultValues(
  data: EmployeeMonthlyData | null
): MonthlyDataInput {
  return {
    target_client_visits: data?.target?.target_client_visits ?? 0,
    target_dispatched_sqft: data?.target?.target_dispatched_sqft ?? 0,
    target_tour_days: data?.target?.target_tour_days ?? 0,
    target_travelling_cities: data?.target?.target_travelling_cities ?? 0,
    actual_client_visits: data?.actual?.actual_client_visits ?? 0,
    actual_dispatched_sqft: data?.actual?.actual_dispatched_sqft ?? 0,
    actual_dispatched_amount: data?.actual?.actual_dispatched_amount ?? 0,
    actual_conversions: data?.actual?.actual_conversions ?? 0,
    actual_tour_days: data?.actual?.actual_tour_days ?? 0,
    actual_travelling_cities:
      data?.actual?.actual_travelling_cities?.join(", ") ?? "",
    salary: data?.actual?.salary ?? 0,
    tada: data?.actual?.tada ?? 0,
    incentive: data?.actual?.incentive ?? 0,
    sales_promotion: data?.actual?.sales_promotion ?? 0,
  };
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export function EmployeeDetailSheet({
  open,
  onOpenChange,
  data,
  month,
  year,
  userRole,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const canEditTargets = userRole === "super_admin";
  const canEdit = userRole !== "viewer";

  const form = useForm<MonthlyDataInput>({
    resolver: zodResolver(monthlyDataSchema),
    defaultValues: getDefaultValues(data),
  });

  // Reset form when data changes (different employee selected)
  useEffect(() => {
    if (data) {
      form.reset(getDefaultValues(data));
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: MonthlyDataInput) {
    if (!data) return;

    startTransition(async () => {
      const result = await saveMonthlyData({
        employeeId: data.employee.id,
        month,
        year,
        ...values,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(`Data saved for ${data.employee.name}`);
      onOpenChange(false);
    });
  }

  const totalCosting = data?.actual?.total_costing;
  const isCurrentMonth =
    month === new Date().getMonth() + 1 && year === new Date().getFullYear();

  // Read-only daily-synced values
  const meetingsTarget = data?.target?.target_total_meetings ?? 0;
  const callsTarget = data?.target?.target_total_calls ?? 0;
  const actualCalls = data?.actual?.actual_calls ?? 0;
  const actualArchitect = data?.actual?.actual_architect_meetings ?? 0;
  const actualClient = data?.actual?.actual_client_meetings ?? 0;
  const actualSiteVisits = data?.actual?.actual_site_visits ?? 0;
  const totalMeetingsActual = actualArchitect + actualClient + actualSiteVisits;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-xl overflow-y-auto">
        {data && (
          <>
            <SheetHeader>
              <SheetTitle>{data.employee.name}</SheetTitle>
              <SheetDescription>
                {data.employee.emp_id} &middot; {MONTH_NAMES[month]} {year}
                {data.employee.location &&
                  ` \u00B7 ${data.employee.location}`}
              </SheetDescription>
            </SheetHeader>

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 px-4 pb-4"
            >
              {/* ── Meetings & Calls (read-only, synced from Daily Logs) ── */}
              <section>
                <SectionHeader title="Meetings & Calls" />
                <div className="rounded-md border border-dashed border-muted-foreground/30 p-3 mb-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    These values are auto-calculated from{" "}
                    <span className="font-medium text-foreground">Daily Logs</span>.
                    {isCurrentMonth && " Targets show month-to-date pacing."}
                    {" "}Edit them on the Daily Logs page.
                  </p>
                  <div className="grid grid-cols-[1fr_80px_80px] gap-2 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Metric</span>
                    <span className="text-xs font-medium text-muted-foreground text-right">Target</span>
                    <span className="text-xs font-medium text-muted-foreground text-right">Actual</span>

                    <span>Total Meetings</span>
                    <span className="text-right font-medium">{meetingsTarget || "—"}</span>
                    <span className="text-right font-medium">{totalMeetingsActual || "—"}</span>

                    <span>Total Calls</span>
                    <span className="text-right font-medium">{callsTarget || "—"}</span>
                    <span className="text-right font-medium">{actualCalls || "—"}</span>

                    <span className="text-muted-foreground pl-3">Architect Meetings</span>
                    <span className="text-right text-muted-foreground">—</span>
                    <span className="text-right">{actualArchitect || "—"}</span>

                    <span className="text-muted-foreground pl-3">Client Meetings</span>
                    <span className="text-right text-muted-foreground">—</span>
                    <span className="text-right">{actualClient || "—"}</span>

                    <span className="text-muted-foreground pl-3">Site Visits</span>
                    <span className="text-right text-muted-foreground">—</span>
                    <span className="text-right">{actualSiteVisits || "—"}</span>
                  </div>
                </div>
              </section>

              {/* ── Performance ── */}
              <section>
                <SectionHeader title="Performance" />
                <ColumnHeaders />
                <div className="space-y-2">
                  <FieldRow
                    label="Client Visits"
                    targetField="target_client_visits"
                    actualField="actual_client_visits"
                    form={form}
                    canEditTargets={canEditTargets}
                    canEdit={canEdit}
                  />
                  <FieldRow
                    label="Dispatched SQFT"
                    targetField="target_dispatched_sqft"
                    actualField="actual_dispatched_sqft"
                    form={form}
                    canEditTargets={canEditTargets}
                    canEdit={canEdit}
                  />
                  <FieldRow
                    label="Dispatched Amount"
                    actualField="actual_dispatched_amount"
                    form={form}
                    canEditTargets={canEditTargets}
                    canEdit={canEdit}
                  />
                  <FieldRow
                    label="Conversions"
                    actualField="actual_conversions"
                    form={form}
                    canEditTargets={canEditTargets}
                    canEdit={canEdit}
                  />
                  <FieldRow
                    label="Tour Days"
                    targetField="target_tour_days"
                    actualField="actual_tour_days"
                    form={form}
                    canEditTargets={canEditTargets}
                    canEdit={canEdit}
                  />
                  <div className="grid grid-cols-[1fr_100px_100px] items-center gap-3 px-1">
                    <Label className="text-sm">Travelling Cities</Label>
                    <Input
                      type="number"
                      {...form.register("target_travelling_cities")}
                      disabled={!canEditTargets}
                      className="text-right text-sm"
                    />
                    <span className="text-center text-muted-foreground text-xs">
                      —
                    </span>
                  </div>
                  <div className="px-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Actual Cities (comma-separated)
                    </Label>
                    <Input
                      {...form.register("actual_travelling_cities")}
                      disabled={!canEdit}
                      placeholder="Mumbai, Pune, Delhi"
                      className="text-sm"
                    />
                  </div>
                </div>
              </section>

              {/* ── Costing ── */}
              <section>
                <SectionHeader title="Costing" />
                <div className="space-y-2">
                  <CostingRow
                    label="Salary"
                    field="salary"
                    form={form}
                    canEdit={canEdit}
                  />
                  <CostingRow
                    label="TADA"
                    field="tada"
                    form={form}
                    canEdit={canEdit}
                  />
                  <CostingRow
                    label="Incentive"
                    field="incentive"
                    form={form}
                    canEdit={canEdit}
                  />
                  <CostingRow
                    label="Sales Promotion"
                    field="sales_promotion"
                    form={form}
                    canEdit={canEdit}
                  />

                  <Separator />
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm font-semibold">Total Costing</span>
                    <span className="text-sm font-semibold">
                      {totalCosting != null
                        ? formatCurrency(totalCosting)
                        : "Auto-calculated on save"}
                    </span>
                  </div>
                </div>
              </section>

              {/* Submit */}
              {canEdit && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ── Helper Components ── */

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <Separator className="flex-1" />
    </div>
  );
}

function ColumnHeaders() {
  return (
    <div className="grid grid-cols-[1fr_100px_100px] gap-3 mb-2 px-1">
      <span className="text-xs font-medium text-muted-foreground">Metric</span>
      <span className="text-xs font-medium text-muted-foreground text-right">
        Target
      </span>
      <span className="text-xs font-medium text-muted-foreground text-right">
        Actual
      </span>
    </div>
  );
}

function FieldRow({
  label,
  targetField,
  actualField,
  form,
  canEditTargets,
  canEdit,
}: {
  label: string;
  targetField?: keyof MonthlyDataInput;
  actualField?: keyof MonthlyDataInput;
  form: UseFormReturn<MonthlyDataInput>;
  canEditTargets: boolean;
  canEdit: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_100px_100px] items-center gap-3 px-1">
      <Label className="text-sm">{label}</Label>
      {targetField ? (
        <Input
          type="number"
          {...form.register(targetField)}
          disabled={!canEditTargets}
          className="text-right text-sm"
        />
      ) : (
        <span className="text-center text-muted-foreground text-xs">—</span>
      )}
      {actualField ? (
        <Input
          type="number"
          {...form.register(actualField)}
          disabled={!canEdit}
          className="text-right text-sm"
        />
      ) : (
        <span className="text-center text-muted-foreground text-xs">—</span>
      )}
    </div>
  );
}

function CostingRow({
  label,
  field,
  form,
  canEdit,
}: {
  label: string;
  field: keyof MonthlyDataInput;
  form: UseFormReturn<MonthlyDataInput>;
  canEdit: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-1">
      <Label className="text-sm flex-1">{label}</Label>
      <div className="relative w-[150px]">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
          ₹
        </span>
        <Input
          type="number"
          {...form.register(field)}
          disabled={!canEdit}
          className="text-right text-sm pl-6"
        />
      </div>
    </div>
  );
}
