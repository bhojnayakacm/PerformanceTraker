"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentType,
} from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CalendarDays,
  Calculator,
  Check,
  ChevronsUpDown,
  Loader2,
  MapPin,
  Package,
  Route,
  Target,
  Trash2,
  Undo2,
  Users2,
  Wallet,
  X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, getAvatarColor, getInitials } from "@/lib/utils";
import type { City, EmployeeMonthlyData, UserRole } from "@/lib/types";
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

/* ────────────────────────────────────────────────────────────────
   Block typing "-", "+", "e", "E" on numeric inputs.
   Paired with Zod .min(0) for a double-lock on negatives.
   ──────────────────────────────────────────────────────────────── */
const NUM_INPUT_PROPS = {
  min: 0,
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") {
      e.preventDefault();
    }
  },
} as const;

/* Travelling-city day fields accept half-day granularity. monthly_city_tours
 * stores target_days/actual_days as NUMERIC(5,2) since migration 0012, but
 * the HTML5 <input type="number"> step defaults to 1 — typing 0.5 then
 * submitting triggers "Please enter a valid value. The two nearest valid
 * values are 0 and 1." Setting step explicitly fixes the validator.
 *
 * Use 0.5 (not "any") so the up/down spinners and validation still enforce
 * half-day business semantics; a stray 0.37 here would be a data-entry bug,
 * not a feature. */
const DAY_INPUT_PROPS = { ...NUM_INPUT_PROPS, step: 0.5 } as const;

/* ────────────────────────────────────────────────────────────────
   Color tints — literal class strings for Tailwind JIT.
   Only 3 tints now (one per pillar).
   ──────────────────────────────────────────────────────────────── */
const TINTS = {
  slate: {
    card: "border-slate-200/70 dark:border-slate-800/60 bg-gradient-to-br from-slate-50/70 via-background to-background dark:from-slate-900/30 dark:via-background dark:to-background",
    headerStrip:
      "border-slate-200/60 dark:border-slate-800/60 bg-slate-100/50 dark:bg-slate-900/30",
    iconPill:
      "bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700/60",
    footer:
      "border-slate-300/60 bg-slate-100/60 dark:border-slate-800/60 dark:bg-slate-900/40",
  },
  indigo: {
    card: "border-indigo-200/60 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/70 via-background to-background dark:from-indigo-950/25 dark:via-background dark:to-background",
    headerStrip:
      "border-indigo-200/50 dark:border-indigo-900/40 bg-indigo-100/40 dark:bg-indigo-950/30",
    iconPill:
      "bg-indigo-100 text-indigo-600 ring-indigo-200/60 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-900/60",
    footer:
      "border-indigo-300/60 bg-indigo-100/50 dark:border-indigo-800/60 dark:bg-indigo-950/40",
  },
  rose: {
    card: "border-rose-200/60 dark:border-rose-900/40 bg-gradient-to-br from-rose-50/70 via-background to-background dark:from-rose-950/25 dark:via-background dark:to-background",
    headerStrip:
      "border-rose-200/50 dark:border-rose-900/40 bg-rose-100/40 dark:bg-rose-950/30",
    iconPill:
      "bg-rose-100 text-rose-600 ring-rose-200/60 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900/60",
    footer:
      "border-rose-300/60 bg-rose-100/50 dark:border-rose-800/60 dark:bg-rose-950/40",
  },
} as const;

type TintName = keyof typeof TINTS;
type LucideIcon = ComponentType<{ className?: string }>;

type CityTourEntry = {
  _uid: string;
  city_id: string | null;
  target_days: number;
  actual_days: number;
};

// Stable per-row identity for React keys. Uses the DB row's id when the
// tour is already persisted, and a fresh UUID for padded/new blocks.
const newUid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `uid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: EmployeeMonthlyData | null;
  month: number;
  year: number;
  userRole: UserRole;
  cities: City[];
};

function getDefaultValues(data: EmployeeMonthlyData | null): MonthlyDataInput {
  const storedCount = data?.target?.target_travelling_cities ?? 0;
  const existingTours = (data?.cityTours ?? []).map((t) => ({
    city_id: t.city_id,
    target_days: t.target_days,
    actual_days: t.actual_days,
  }));

  // Reconcile: CSV bulk-import writes rows to monthly_city_tours but does not
  // update monthly_targets.target_travelling_cities. Old code did
  // `existing.slice(0, storedCount)` which silently dropped every tour when
  // storedCount was 0 — that was the "empty dialog after import" bug.
  // Take the larger of the two so persisted tours always survive.
  const targetCount = Math.max(storedCount, existingTours.length);

  const alignedTours =
    existingTours.length >= targetCount
      ? existingTours
      : [
          ...existingTours,
          ...Array.from({ length: targetCount - existingTours.length }, () => ({
            city_id: "" as string,
            target_days: 0,
            actual_days: 0,
          })),
        ];

  return {
    target_client_visits: data?.target?.target_client_visits ?? 0,
    target_dispatched_sqft: data?.target?.target_dispatched_sqft ?? 0,
    target_travelling_cities: targetCount,

    actual_client_visits: data?.actual?.actual_client_visits ?? 0,
    actual_conversions: data?.actual?.actual_conversions ?? 0,

    actual_project_2: data?.actual?.actual_project_2 ?? 0,
    actual_project: data?.actual?.actual_project ?? 0,
    actual_tile: data?.actual?.actual_tile ?? 0,
    actual_retail: data?.actual?.actual_retail ?? 0,
    actual_return: data?.actual?.actual_return ?? 0,

    salary: data?.actual?.salary ?? 0,
    tada: data?.actual?.tada ?? 0,
    incentive: data?.actual?.incentive ?? 0,
    sales_promotion: data?.actual?.sales_promotion ?? 0,

    city_tours: alignedTours,
  };
}

function getInitialCityTours(
  data: EmployeeMonthlyData | null
): CityTourEntry[] {
  const storedCount = data?.target?.target_travelling_cities ?? 0;
  const existing = (data?.cityTours ?? []).map<CityTourEntry>((t) => ({
    _uid: t.id,
    city_id: t.city_id,
    target_days: t.target_days,
    actual_days: t.actual_days,
  }));

  const targetCount = Math.max(storedCount, existing.length);

  if (existing.length >= targetCount) return existing;
  return [
    ...existing,
    ...Array.from({ length: targetCount - existing.length }, () => ({
      _uid: newUid(),
      city_id: null,
      target_days: 0,
      actual_days: 0,
    })),
  ];
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

/** Recursively walk RHF FieldErrors to find the first human-readable message. */
function extractFirstError(obj: Record<string, unknown>): string | null {
  for (const value of Object.values(obj)) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) {
      return record.message;
    }
    const nested = extractFirstError(record);
    if (nested) return nested;
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════
   Root component
   ════════════════════════════════════════════════════════════════ */

export function EmployeeDetailDialog({
  open,
  onOpenChange,
  data,
  month,
  year,
  userRole,
  cities,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const canEditTargets = userRole === "super_admin" || userRole === "custom_admin";
  const canEdit = userRole !== "viewer";

  const form = useForm<MonthlyDataInput>({
    resolver: zodResolver(monthlyDataSchema),
    defaultValues: getDefaultValues(data),
  });

  const [cityTours, setCityTours] = useState<CityTourEntry[]>(
    getInitialCityTours(data)
  );

  /* ── Inline save feedback (per-field pending state) ──
   *
   * When the user clicks Save, we want every field they actually
   * mutated to render a subtle "in-flight" treatment (indigo ring +
   * trailing spinner + disabled), while untouched fields keep their
   * normal look. The goal: localized feedback rather than a single
   * footer spinner.
   *
   *   • RHF fields (everything except city_tours) → read
   *     `form.formState.dirtyFields[field]` directly. RHF preserves
   *     dirty state through `handleSubmit`, so during isPending the
   *     set IS the touched-fields set.
   *
   *   • City tours live in local state (`cityTours`) outside RHF.
   *     `originalCityToursRef` captures the snapshot at dialog-open;
   *     onSubmit diffs the current tours against it and stores the set
   *     of changed `_uid`s in `pendingTourUids`. We freeze the set at
   *     submit time so the pending visual stays stable through the
   *     round-trip, and clear it on error so the next attempt
   *     re-derives. */
  const originalCityToursRef = useRef<CityTourEntry[]>(getInitialCityTours(data));
  const [pendingTourUids, setPendingTourUids] = useState<Set<string>>(
    () => new Set()
  );

  const dirtyFields = form.formState.dirtyFields;
  const isFieldPending = useCallback(
    (field: keyof MonthlyDataInput): boolean =>
      isPending && Boolean(dirtyFields[field]),
    [isPending, dirtyFields],
  );
  const isTourPending = useCallback(
    (uid: string): boolean => isPending && pendingTourUids.has(uid),
    [isPending, pendingTourUids],
  );

  /* Deferred body mount.
   *
   * The Performance pillar owns ~30+ controlled inputs, nested CitySelect
   * popovers, several form.watch() subscriptions, and live useMemo roll-ups.
   * Mounting all of that synchronously *during* Radix Dialog's open transform
   * drops frames — the row click visibly stutters before the dialog settles.
   *
   * Fix: gate the heavy body behind a `bodyReady` flag that flips true ~150ms
   * after `open` toggles on. While false we render a lightweight skeleton at
   * the same column-span widths, so the dialog can render the header and the
   * three card outlines on the very first paint, then commit the form once
   * the open animation has visibly settled. 150ms is the visual sweet spot:
   * the transform completes (Radix uses ~180-200ms), the skeleton holds
   * layout, and the inputs flash in without competing for paint budget.
   *
   * Form hooks (useForm, cityTours, watches) all live above this flag, so
   * the form's *state* exists immediately — only the *DOM tree* is deferred.
   * That keeps the watch subscriptions hot and the cityTours reset effect
   * running in the right order; only the cost of rendering inputs is moved. */
  const [bodyReady, setBodyReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setBodyReady(false);
      return;
    }
    const id = window.setTimeout(() => setBodyReady(true), 150);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (data) {
      form.reset(getDefaultValues(data));
      const initial = getInitialCityTours(data);
      setCityTours(initial);
      originalCityToursRef.current = initial;
      setPendingTourUids(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  /* ── Live-calculated roll-ups ── */
  const project2 = form.watch("actual_project_2") || 0;
  const project = form.watch("actual_project") || 0;
  const tile = form.watch("actual_tile") || 0;
  const retail = form.watch("actual_retail") || 0;
  const returnVal = form.watch("actual_return") || 0;

  const netSale = useMemo(
    () => Number(project2) + Number(project) + Number(tile) + Number(retail),
    [project2, project, tile, retail]
  );
  const dispatchedTotal = useMemo(
    () => netSale + Number(returnVal),
    [netSale, returnVal]
  );

  const totalTargetDays = useMemo(
    () => cityTours.reduce((sum, t) => sum + Number(t.target_days || 0), 0),
    [cityTours]
  );
  const totalActualDays = useMemo(
    () => cityTours.reduce((sum, t) => sum + Number(t.actual_days || 0), 0),
    [cityTours]
  );

  const salary = form.watch("salary") || 0;
  const tada = form.watch("tada") || 0;
  const incentive = form.watch("incentive") || 0;
  const salesPromotion = form.watch("sales_promotion") || 0;
  const costingPreview = useMemo(
    () =>
      Number(salary) + Number(tada) + Number(incentive) + Number(salesPromotion),
    [salary, tada, incentive, salesPromotion]
  );

  /* ── City tour handlers ── */
  const handleTargetCitiesChange = useCallback(
    (rawValue: string) => {
      const next = Math.max(0, parseInt(rawValue || "0", 10) || 0);
      // shouldDirty so the count input itself enters the pending visual
      // state when this field is what the user actually changed.
      form.setValue("target_travelling_cities", next, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setCityTours((prev) => {
        if (prev.length === next) return prev;
        if (prev.length < next) {
          return [
            ...prev,
            ...Array.from({ length: next - prev.length }, () => ({
              _uid: newUid(),
              city_id: null,
              target_days: 0,
              actual_days: 0,
            })),
          ];
        }
        return prev.slice(0, next);
      });
    },
    [form]
  );

  const updateCityTour = useCallback(
    (index: number, patch: Partial<CityTourEntry>) => {
      setCityTours((prev) =>
        prev.map((t, i) => (i === index ? { ...t, ...patch } : t))
      );
    },
    []
  );

  /* Remove a specific card by index. The master "Target Cities" counter is
   * derived from the new array length inside the same setState callback so the
   * two values can never desync — `cityTours.length` IS the truth, the form
   * field just mirrors it. The Zod refine `city_tours.length ===
   * target_travelling_cities` therefore continues to hold at submit time.
   *
   * Numeric badges on the remaining cards (1, 2, 3...) auto-recompute because
   * they read `index + 1` from .map() — after the filter, indices renumber
   * naturally. */
  const removeCityTour = useCallback(
    (index: number) => {
      setCityTours((prev) => {
        const next = prev.filter((_, i) => i !== index);
        form.setValue("target_travelling_cities", next.length, {
          shouldValidate: true,
          shouldDirty: true,
        });
        return next;
      });
    },
    [form]
  );

  /* ── Submit handler ──
     cityTours lives in local useState, NOT inside react-hook-form.
     We must sync it into the form before RHF validation runs,
     otherwise the Zod .refine() sees stale city_tours and silently
     rejects the form.
  */
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;

    // Pre-flight: catch unpicked cities with a clear toast
    const unpicked = cityTours.findIndex((t) => !t.city_id);
    if (unpicked !== -1) {
      toast.error(`Pick a city for block #${unpicked + 1}`);
      return;
    }

    // Pre-flight: catch duplicate cities
    const ids = cityTours.map((t) => t.city_id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      toast.error("Each travelling city block must select a distinct city");
      return;
    }

    // Sync local city tour state → form so Zod sees the real data
    form.setValue(
      "city_tours",
      cityTours.map((t) => ({
        city_id: t.city_id as string,
        target_days: Number(t.target_days || 0),
        actual_days: Number(t.actual_days || 0),
      }))
    );

    // Now let RHF validate all fields + call onSubmit (or surface errors)
    form.handleSubmit(onSubmit, onValidationError)();
  }

  function onSubmit(values: MonthlyDataInput) {
    if (!data) return;

    // Snapshot which city tours the user mutated against the
    // dialog-open baseline. Freezing here means the per-block
    // visual is stable through the network round-trip even if the
    // baseline ref is mutated by an unrelated re-render.
    const originalByUid = new Map(
      originalCityToursRef.current.map((t) => [t._uid, t]),
    );
    const changedUids = new Set<string>();
    for (const t of cityTours) {
      const orig = originalByUid.get(t._uid);
      if (
        !orig ||
        orig.city_id !== t.city_id ||
        orig.target_days !== t.target_days ||
        orig.actual_days !== t.actual_days
      ) {
        changedUids.add(t._uid);
      }
    }
    setPendingTourUids(changedUids);

    startTransition(async () => {
      const result = await saveMonthlyData({
        employeeId: data.employee.id,
        month,
        year,
        ...values,
      });

      if ("error" in result) {
        // Clear the pending visual so the user can retry without
        // leftover indigo highlights. RHF's dirtyFields persists, so
        // a retry will re-derive the same pending set.
        setPendingTourUids(new Set());
        toast.error(result.error);
        return;
      }

      toast.success(`Data saved for ${data.employee.name}`);
      onOpenChange(false);
    });
  }

  function onValidationError(errors: Record<string, unknown>) {
    const msg = extractFirstError(errors);
    toast.error(msg || "Please fix the form errors before saving.");
  }

  const isCurrentMonth =
    month === new Date().getMonth() + 1 && year === new Date().getFullYear();

  // Read-only daily-synced values
  const meetingsTarget = data?.target?.target_total_meetings ?? 0;
  const callsTarget = data?.target?.target_total_calls ?? 0;
  const actualCalls = data?.actual?.actual_calls ?? 0;
  const actualArchitect = data?.actual?.actual_architect_meetings ?? 0;
  const actualClient = data?.actual?.actual_client_meetings ?? 0;
  const actualSiteVisits = data?.actual?.actual_site_visits ?? 0;
  const totalMeetingsActual =
    actualArchitect + actualClient + actualSiteVisits;

  const targetTravelingCount = form.watch("target_travelling_cities") || 0;
  const persistedCosting = data?.actual?.total_costing ?? null;

  const selectedIds = useMemo(
    () =>
      new Set(
        cityTours
          .map((t) => t.city_id)
          .filter((id): id is string => Boolean(id))
      ),
    [cityTours]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "p-0 gap-0 overflow-hidden flex flex-col",
          "max-w-[96vw] sm:max-w-[min(1280px,96vw)]",
          "max-h-[92vh] w-full"
        )}
      >
        {data && (
          <form
            onSubmit={handleFormSubmit}
            className="flex flex-col min-h-0 flex-1"
          >
            {/* ══════════════ HEADER ══════════════ */}
            <header
              className={cn(
                "relative flex items-start gap-4 border-b px-6 py-5 shrink-0",
                "bg-gradient-to-br from-indigo-50/70 via-background to-violet-50/50",
                "dark:from-indigo-950/25 dark:via-background dark:to-violet-950/20"
              )}
            >
              <div
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-xl text-base font-bold shadow-sm ring-1 ring-border/60",
                  getAvatarColor(data.employee.name)
                )}
              >
                {getInitials(data.employee.name)}
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                <h2 className="text-xl font-bold tracking-tight truncate">
                  {data.employee.name}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground/70">
                    {data.employee.emp_id}
                  </span>
                  <span className="text-muted-foreground/40">&middot;</span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {MONTH_NAMES[month]} {year}
                  </span>
                  {data.employee.location && (
                    <>
                      <span className="text-muted-foreground/40">&middot;</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {data.employee.location}
                      </span>
                    </>
                  )}
                  {isCurrentMonth && (
                    <>
                      <span className="text-muted-foreground/40">&middot;</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        Live &middot; MTD
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* ══════════════ SCROLLABLE BODY — 3 PILLARS ══════════════ */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 bg-muted/20">
              {!bodyReady ? (
                <DialogBodySkeleton />
              ) : (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                {/* ─── PILLAR 1: Meetings & Calls (left, compact) ─── */}
                <SectionCard
                  tint="slate"
                  icon={Users2}
                  title="Meetings & Calls"
                  description="Auto-synced from Daily Logs"
                  className="xl:col-span-3"
                  rightSlot={
                    <span className="shrink-0 rounded-full bg-slate-200/80 dark:bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Read-only
                    </span>
                  }
                >
                  <div className="space-y-3">
                    {/* Total Meetings + indented children */}
                    <div className="space-y-1">
                      <ReadOnlyMetric
                        label="Total Meetings"
                        target={meetingsTarget}
                        actual={totalMeetingsActual}
                        bold
                      />
                      <div className="ml-1 pl-2.5 border-l-2 border-slate-300/70 dark:border-slate-700/70 space-y-0.5">
                        <ReadOnlySubMetric
                          label="Architect"
                          actual={actualArchitect}
                        />
                        <ReadOnlySubMetric
                          label="Client"
                          actual={actualClient}
                        />
                        <ReadOnlySubMetric
                          label="Site Visits"
                          actual={actualSiteVisits}
                        />
                      </div>
                    </div>

                    {/* Total Calls — standalone */}
                    <div className="border-t border-slate-200/60 dark:border-slate-800/60 pt-2">
                      <ReadOnlyMetric
                        label="Total Calls"
                        target={callsTarget}
                        actual={actualCalls}
                        bold
                      />
                    </div>

                    {isCurrentMonth && (
                      <p className="pt-1 text-[10px] italic text-muted-foreground">
                        Targets show Month-to-Date (MTD) pacing &middot; edit on Daily Logs.
                      </p>
                    )}
                  </div>
                </SectionCard>

                {/* ─── PILLAR 2: Performance (center, dominant) ─── */}
                <SectionCard
                  tint="indigo"
                  icon={Target}
                  title="Performance"
                  description="Targets, dispatched quantities & travelling cities"
                  className="xl:col-span-6"
                  contentClassName="p-0"
                >
                  {/* ── Sub-section: General metrics ── */}
                  <PerfSubSection
                    icon={Target}
                    title="General Metrics"
                    isFirst
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-indigo-200/40 dark:border-indigo-900/40 bg-background/50 p-2.5 space-y-2">
                        <Label className="text-xs font-semibold">
                          Client Visits
                        </Label>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Target
                            </span>
                            <PendingInput
                              type="number"
                              {...form.register("target_client_visits")}
                              {...NUM_INPUT_PROPS}
                              disabled={!canEditTargets}
                              pending={isFieldPending("target_client_visits")}
                              wrapperClassName="w-20"
                              className="h-7 w-20 text-right text-sm tabular-nums"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Actual
                            </span>
                            <PendingInput
                              type="number"
                              {...form.register("actual_client_visits")}
                              {...NUM_INPUT_PROPS}
                              disabled={!canEdit}
                              pending={isFieldPending("actual_client_visits")}
                              wrapperClassName="w-20"
                              className="h-7 w-20 text-right text-sm tabular-nums"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-indigo-200/40 dark:border-indigo-900/40 bg-background/50 p-2.5 space-y-2">
                        <Label className="text-xs font-semibold">
                          Conversions
                        </Label>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Actual
                          </span>
                          <PendingInput
                            type="number"
                            {...form.register("actual_conversions")}
                            {...NUM_INPUT_PROPS}
                            disabled={!canEdit}
                            pending={isFieldPending("actual_conversions")}
                            wrapperClassName="w-20"
                            className="h-7 w-20 text-right text-sm tabular-nums"
                          />
                        </div>
                      </div>
                    </div>
                  </PerfSubSection>

                  {/* ── Sub-section: Dispatched Quantity ── */}
                  <PerfSubSection icon={Package} title="Dispatched Quantity (sqft.)">
                    {/* Target row */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <Label className="text-xs font-semibold">
                          Target Quantity
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          Manually set goal
                        </p>
                      </div>
                      <PendingInput
                        type="number"
                        {...form.register("target_dispatched_sqft")}
                        {...NUM_INPUT_PROPS}
                        disabled={!canEditTargets}
                        pending={isFieldPending("target_dispatched_sqft")}
                        wrapperClassName="w-28"
                        className="h-7 w-28 text-right text-sm tabular-nums"
                      />
                    </div>

                    {/* Net Sale breakdown — 2×2 grid */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Calculator className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                          Net Sale Breakdown
                        </span>
                        <div className="flex-1 h-px bg-indigo-200/60 dark:bg-indigo-900/50" />
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <BreakdownInput
                          label="Project-2"
                          field="actual_project_2"
                          form={form}
                          canEdit={canEdit}
                          pending={isFieldPending("actual_project_2")}
                        />
                        <BreakdownInput
                          label="Project"
                          field="actual_project"
                          form={form}
                          canEdit={canEdit}
                          pending={isFieldPending("actual_project")}
                        />
                        <BreakdownInput
                          label="Tile"
                          field="actual_tile"
                          form={form}
                          canEdit={canEdit}
                          pending={isFieldPending("actual_tile")}
                        />
                        <BreakdownInput
                          label="Retail"
                          field="actual_retail"
                          form={form}
                          canEdit={canEdit}
                          pending={isFieldPending("actual_retail")}
                        />
                      </div>

                      {/* Net Sale sub-total */}
                      <div className="flex items-center justify-between rounded-lg border border-indigo-300/70 dark:border-indigo-800/70 bg-indigo-100/60 dark:bg-indigo-950/50 px-3 py-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                          Net Sale
                        </span>
                        <span className="text-base font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
                          {netSale.toLocaleString("en-IN")}
                        </span>
                      </div>

                      {/* Return — compact inline */}
                      <div className="flex items-center gap-2 pt-2 border-t border-indigo-200/50 dark:border-indigo-900/40">
                        <Undo2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <Label className="text-xs text-foreground/80 shrink-0">
                          Return
                        </Label>
                        <PendingInput
                          type="number"
                          {...form.register("actual_return")}
                          {...NUM_INPUT_PROPS}
                          disabled={!canEdit}
                          pending={isFieldPending("actual_return")}
                          wrapperClassName="ml-auto w-24"
                          className="h-7 w-24 text-right text-sm tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Dispatched total */}
                    <div className="mt-3 flex items-center justify-between rounded-xl border-2 border-indigo-300/80 dark:border-indigo-800/80 bg-gradient-to-r from-indigo-100/70 to-indigo-50/50 dark:from-indigo-950/50 dark:to-indigo-950/30 px-4 py-2.5">
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                          Actual Dispatched
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Net Sale + Return
                        </span>
                      </div>
                      <span className="text-xl font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
                        {dispatchedTotal.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </PerfSubSection>

                  {/* ── Sub-section: Travelling Cities ── */}
                  <PerfSubSection
                    icon={Route}
                    title="Travelling Cities"
                    rightSlot={
                      <div className="flex items-center gap-2 shrink-0">
                        <Label
                          htmlFor="target-cities"
                          className="text-[11px] font-medium text-muted-foreground whitespace-nowrap"
                        >
                          Target Cities
                        </Label>
                        <PendingInput
                          id="target-cities"
                          type="number"
                          {...NUM_INPUT_PROPS}
                          max={20}
                          value={targetTravelingCount}
                          onChange={(e) =>
                            handleTargetCitiesChange(e.target.value)
                          }
                          disabled={!canEditTargets}
                          pending={isFieldPending("target_travelling_cities")}
                          wrapperClassName="w-16"
                          className="h-8 w-16 text-right text-sm tabular-nums"
                        />
                      </div>
                    }
                  >
                    {targetTravelingCount === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                        <div className="flex size-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/50 ring-1 ring-indigo-200/60 dark:ring-indigo-900/60">
                          <MapPin className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-foreground/80">
                            No travelling cities set
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {canEditTargets
                              ? "Set a target above to start adding cities."
                              : "No cities logged for this month."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {cityTours.map((tour, i) => (
                            <CityBlock
                              key={tour._uid}
                              index={i}
                              cities={cities}
                              tour={tour}
                              disabledCityIds={selectedIds}
                              canEditTargets={canEditTargets}
                              canEdit={canEdit}
                              pending={isTourPending(tour._uid)}
                              onUpdate={(patch) => updateCityTour(i, patch)}
                              onRemove={() => removeCityTour(i)}
                            />
                          ))}
                        </div>

                        {/* Tour days total — prominent pill */}
                        <div className="mt-4 grid grid-cols-2 gap-6 rounded-xl border-2 border-indigo-300/80 dark:border-indigo-800/80 bg-gradient-to-r from-indigo-100/70 to-indigo-50/50 dark:from-indigo-950/50 dark:to-indigo-950/30 px-4 py-3">
                          <div>
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                              Total Target Days
                            </span>
                            <span className="text-xl font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
                              {totalTargetDays.toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                              Total Actual Days
                            </span>
                            <span className="text-xl font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
                              {totalActualDays.toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </PerfSubSection>
                </SectionCard>

                {/* ─── PILLAR 3: Costing (right, compact) ─── */}
                <SectionCard
                  tint="rose"
                  icon={Wallet}
                  title="Costing"
                  description="Monthly financial breakdown"
                  className="xl:col-span-3"
                  footer={
                    <SectionFooter tint="rose">
                      <div className="space-y-0.5">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                          Total Costing
                        </span>
                        <span className="text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-300">
                          {form.formState.isDirty
                            ? formatCurrency(costingPreview)
                            : persistedCosting != null
                              ? formatCurrency(persistedCosting)
                              : "—"}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {form.formState.isDirty
                            ? "Live preview"
                            : "Auto-calculated"}
                        </span>
                      </div>
                    </SectionFooter>
                  }
                >
                  <div className="space-y-3">
                    <CostingRow
                      label="Salary"
                      field="salary"
                      form={form}
                      canEdit={canEdit}
                      pending={isFieldPending("salary")}
                    />
                    <CostingRow
                      label="TADA"
                      field="tada"
                      form={form}
                      canEdit={canEdit}
                      pending={isFieldPending("tada")}
                    />
                    <CostingRow
                      label="Incentive"
                      field="incentive"
                      form={form}
                      canEdit={canEdit}
                      pending={isFieldPending("incentive")}
                    />
                    <CostingRow
                      label="Sales Promotion"
                      field="sales_promotion"
                      form={form}
                      canEdit={canEdit}
                      pending={isFieldPending("sales_promotion")}
                    />
                  </div>
                </SectionCard>
              </div>
              )}
            </div>

            {/* ══════════════ FOOTER ══════════════ */}
            <footer className="flex items-center justify-between gap-3 border-t bg-background/95 backdrop-blur px-6 py-3 shrink-0">
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                {canEdit
                  ? "Changes commit atomically to targets, actuals, and city tours."
                  : "You have read-only access to this record."}
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                {canEdit && (
                  <Button type="submit" disabled={isPending}>
                    {isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                )}
              </div>
            </footer>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════════════════════════════════════════════
   DialogBodySkeleton — held in front of the heavy form tree during the
   Radix Dialog open animation. Matches the column-spans of the real grid
   (3 / 6 / 3) and the per-pillar tints so the transition into the actual
   content is positional and chromatic, not just structural.
   ════════════════════════════════════════════════════════════════ */

function DialogBodySkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      <div className="xl:col-span-3 h-64 rounded-2xl border border-slate-200/70 bg-slate-50/40 dark:border-slate-800/60 dark:bg-slate-900/30 animate-pulse" />
      <div className="xl:col-span-6 h-[28rem] rounded-2xl border border-indigo-200/60 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-indigo-950/25 animate-pulse" />
      <div className="xl:col-span-3 h-64 rounded-2xl border border-rose-200/60 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/25 animate-pulse" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SectionCard — top-level pillar shell
   ════════════════════════════════════════════════════════════════ */

function SectionCard({
  tint,
  icon: Icon,
  title,
  description,
  rightSlot,
  className,
  contentClassName,
  children,
  footer,
}: {
  tint: TintName;
  icon: LucideIcon;
  title: string;
  description?: string;
  rightSlot?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = TINTS[tint];
  return (
    <section
      className={cn(
        "rounded-2xl border shadow-sm overflow-hidden flex flex-col",
        t.card,
        className
      )}
    >
      <header
        className={cn(
          "flex items-center gap-3 border-b px-4 py-3 shrink-0",
          t.headerStrip
        )}
      >
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-xl ring-1 shadow-sm shrink-0",
            t.iconPill
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight truncate">
            {title}
          </h3>
          {description && (
            <p className="text-[11px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {rightSlot}
      </header>

      <div className={cn("p-4 flex-1", contentClassName)}>{children}</div>

      {footer}
    </section>
  );
}

function SectionFooter({
  tint,
  children,
}: {
  tint: TintName;
  children: React.ReactNode;
}) {
  const t = TINTS[tint];
  return (
    <div className={cn("border-t px-4 py-3 shrink-0", t.footer)}>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PerfSubSection — internal divider inside the Performance pillar
   ════════════════════════════════════════════════════════════════ */

function PerfSubSection({
  icon: Icon,
  title,
  rightSlot,
  isFirst,
  children,
}: {
  icon: LucideIcon;
  title: string;
  rightSlot?: React.ReactNode;
  isFirst?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-4 py-4",
        !isFirst && "border-t border-indigo-200/50 dark:border-indigo-900/40"
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-100/80 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-200/60 dark:ring-indigo-900/60">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex-1">
          {title}
        </h4>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Read-only metric helpers (Meetings & Calls pillar)
   ════════════════════════════════════════════════════════════════ */

function ReadOnlyMetric({
  label,
  target,
  actual,
  bold,
}: {
  label: string;
  target: number;
  actual: number;
  bold?: boolean;
}) {
  return (
    <div className="space-y-1.5 py-0.5">
      <span className={cn("text-sm block", bold && "font-semibold")}>
        {label}
      </span>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between rounded-md bg-slate-100/70 dark:bg-slate-800/40 px-2.5 py-1">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Target
          </span>
          <span
            className={cn(
              "text-sm tabular-nums",
              bold ? "font-bold" : "font-medium"
            )}
          >
            {target || "—"}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-slate-100/70 dark:bg-slate-800/40 px-2.5 py-1">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Actual
          </span>
          <span
            className={cn(
              "text-sm tabular-nums",
              bold ? "font-bold" : "font-medium"
            )}
          >
            {actual || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReadOnlySubMetric({
  label,
  actual,
}: {
  label: string;
  actual: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs tabular-nums text-foreground/80 min-w-[36px] text-right">
        {actual || "—"}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PendingInput — drop-in <Input> wrapper that paints a subtle indigo
   ring + trailing inline spinner and disables the field while a save
   for THIS field is in flight. Visual contract:

     • Normal     → identical to plain <Input>; the wrapper is
                    transparent layout-wise (just adds `position:
                    relative`).
     • Pending    → indigo-tinted bg + ring, value text muted toward
                    indigo, right-padding bumped to make room for a
                    `h-3 w-3` spinner anchored at the right edge,
                    disabled so the user can't type while waiting.

   The trailing spinner stays inside the input's footprint, so there
   is no layout shift between the two states — only color and a tiny
   icon. That keeps the dialog visually calm during a save instead of
   redrawing four columns of inputs.

   `wrapperClassName` lets callers constrain the outer width when the
   Input has a fixed `w-*` and is laid out next to siblings that need
   to size to it (e.g. inputs in a `justify-between` row).
   ════════════════════════════════════════════════════════════════ */

function PendingInput({
  pending,
  className,
  wrapperClassName,
  disabled,
  ...inputProps
}: React.ComponentProps<typeof Input> & {
  pending?: boolean;
  wrapperClassName?: string;
}) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        {...inputProps}
        disabled={disabled || pending}
        className={cn(
          className,
          pending &&
            "pr-7 ring-1 ring-indigo-300 bg-indigo-50/50 text-indigo-700/80 dark:ring-indigo-700/60 dark:bg-indigo-950/30 dark:text-indigo-300/80 transition-colors",
        )}
      />
      {pending && (
        <Loader2
          aria-hidden
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-indigo-500 dark:text-indigo-400"
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   BreakdownInput — Dispatched Qty sub-items
   ════════════════════════════════════════════════════════════════ */

function BreakdownInput({
  label,
  field,
  form,
  canEdit,
  pending,
}: {
  label: string;
  field: keyof MonthlyDataInput;
  form: UseFormReturn<MonthlyDataInput>;
  canEdit: boolean;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-foreground/80 shrink-0">{label}</Label>
      <PendingInput
        type="number"
        {...form.register(field)}
        {...NUM_INPUT_PROPS}
        disabled={!canEdit}
        pending={pending}
        wrapperClassName="w-24"
        className="h-7 w-24 text-right text-sm tabular-nums"
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CostingRow — stacked label-over-input for narrow right pillar
   ════════════════════════════════════════════════════════════════ */

function CostingRow({
  label,
  field,
  form,
  canEdit,
  pending,
}: {
  label: string;
  field: keyof MonthlyDataInput;
  form: UseFormReturn<MonthlyDataInput>;
  canEdit: boolean;
  pending?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-xs text-muted-foreground">
          ₹
        </span>
        <PendingInput
          type="number"
          {...form.register(field)}
          {...NUM_INPUT_PROPS}
          disabled={!canEdit}
          pending={pending}
          className="h-9 pl-6 text-right text-sm tabular-nums"
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CityBlock & CitySelect — now indigo-tinted (unified Performance)
   ════════════════════════════════════════════════════════════════ */

function CityBlock({
  index,
  cities,
  tour,
  disabledCityIds,
  canEditTargets,
  canEdit,
  pending,
  onUpdate,
  onRemove,
}: {
  index: number;
  cities: City[];
  tour: CityTourEntry;
  disabledCityIds: Set<string>;
  canEditTargets: boolean;
  canEdit: boolean;
  /** True while a save is in flight AND this card's data differs from
   *  the dialog-open snapshot. Drives the indigo ring + trailing
   *  spinner on the city select and both day inputs. */
  pending?: boolean;
  onUpdate: (patch: Partial<CityTourEntry>) => void;
  onRemove: () => void;
}) {
  const selectedCity = useMemo(
    () => cities.find((c) => c.id === tour.city_id) ?? null,
    [cities, tour.city_id]
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-indigo-200/70 dark:border-indigo-900/50 bg-background/80 dark:bg-background/50 p-3 shadow-sm backdrop-blur-sm space-y-2.5 transition-all",
        pending &&
          "ring-1 ring-indigo-300 dark:ring-indigo-700 bg-indigo-50/30 dark:bg-indigo-950/20",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 ring-1 ring-indigo-200/60 dark:ring-indigo-900/60">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <CitySelect
            cities={cities}
            value={tour.city_id}
            onChange={(cityId) => onUpdate({ city_id: cityId })}
            disabled={!canEditTargets || Boolean(pending)}
            disabledCityIds={disabledCityIds}
            selectedCityName={selectedCity?.name ?? null}
            pending={pending}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canEditTargets || Boolean(pending)}
          aria-label={`Remove city block ${index + 1}`}
          title={canEditTargets ? `Remove city ${index + 1}` : undefined}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
            "text-slate-400 hover:bg-rose-50 hover:text-rose-500",
            "dark:hover:bg-rose-950/40 dark:hover:text-rose-400",
            "disabled:pointer-events-none disabled:opacity-30",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 pl-8">
        <div className="space-y-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Target Days
          </Label>
          <PendingInput
            type="number"
            {...DAY_INPUT_PROPS}
            value={tour.target_days}
            onChange={(e) =>
              onUpdate({
                target_days: Math.max(0, Number(e.target.value || 0)),
              })
            }
            disabled={!canEditTargets}
            pending={pending}
            className="h-8 text-right text-sm tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Actual Days
          </Label>
          <PendingInput
            type="number"
            {...DAY_INPUT_PROPS}
            value={tour.actual_days}
            onChange={(e) =>
              onUpdate({
                actual_days: Math.max(0, Number(e.target.value || 0)),
              })
            }
            disabled={!canEdit}
            pending={pending}
            className="h-8 text-right text-sm tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}

function CitySelect({
  cities,
  value,
  onChange,
  disabled,
  disabledCityIds,
  selectedCityName,
  pending,
}: {
  cities: City[];
  value: string | null;
  onChange: (cityId: string) => void;
  disabled: boolean;
  disabledCityIds: Set<string>;
  selectedCityName: string | null;
  /** When true, the trigger gets an indigo ring + trailing spinner
   *  (in place of the chevron) to signal an in-flight save. */
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return cities;
    const s = search.toLowerCase();
    return cities.filter((c) => c.name.toLowerCase().includes(s));
  }, [cities, search]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 h-9 text-sm",
          "hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-60 transition-colors",
          open && "ring-2 ring-ring",
          pending &&
            "ring-1 ring-indigo-300 dark:ring-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/30",
        )}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
        <span
          className={cn(
            "flex-1 truncate text-left",
            !selectedCityName && "text-muted-foreground",
            pending && "text-indigo-700/80 dark:text-indigo-300/80",
          )}
        >
          {selectedCityName ?? "Select a city\u2026"}
        </span>
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-500 dark:text-indigo-400" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--anchor-width,280px)] p-0 gap-0 max-h-[280px]"
        style={
          {
            ["--anchor-width" as string]: "280px",
          } as React.CSSProperties
        }
      >
        <div className="flex flex-col max-h-[280px]">
          <div className="p-2 shrink-0 border-b">
            <Input
              ref={inputRef}
              placeholder="Search cities\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No cities found
              </div>
            ) : (
              filtered.map((city) => {
                const isSelected = city.id === value;
                const isDisabled =
                  disabledCityIds.has(city.id) && city.id !== value;
                return (
                  <button
                    key={city.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      onChange(city.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                      "hover:bg-muted/60",
                      isDisabled && "opacity-40 cursor-not-allowed",
                      isSelected &&
                        "bg-indigo-50 dark:bg-indigo-950/40 font-medium"
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left truncate">
                      {city.name}
                    </span>
                    {isDisabled && !isSelected && (
                      <span className="text-[10px] text-muted-foreground">
                        picked
                      </span>
                    )}
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
