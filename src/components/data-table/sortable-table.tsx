"use client";

/**
 * Shared DnD primitives for our TanStack and hand-rolled tables.
 *
 * The order is persisted per-user in localStorage as a `string[]` of stable
 * row IDs, keyed by `storageKey`. Standard column sort always wins visually:
 * when TanStack `sorting` is active, the table renders rows in sorted order
 * (custom-order persistence is preserved underneath but masked by the sort).
 * "Reset Order" clears both.
 */

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDndMonitor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ARCHITECTURAL NOTE — why this strategy returns null for everything.
 *
 * The default sortable strategies (`verticalListSortingStrategy`, etc.) have
 * useSortable return a non-null `transform` for every row that needs to slide
 * out of the way of the dragged item. We then apply that transform in the
 * <tr>'s `style.transform`.
 *
 * That is fatal for tables with sticky cells. Once a `<tr>` has `transform`,
 * it becomes the containing block for any descendant `position: sticky`,
 * which means the browser must re-resolve the sticky offset for every cell
 * inside that row on every animation frame — dozens of layout-invalidating
 * recomputations per frame, multiplied by the number of sliding rows. This
 * is the "Page Unresponsive" the user keeps hitting.
 *
 * The escape hatch is to never translate the rows at all. The drag preview
 * lives entirely inside <DragOverlay> (a portal-rendered clone, no sticky
 * children); rows in the table stay where the data put them, and on drop we
 * just commit the new order via React state. No per-frame layout work.
 *
 * UX-wise, the user sees: the dragged row goes invisible, the floating
 * overlay follows the cursor, and the drop target row gets a subtle indigo
 * tint (via `isOver`). It's the Linear/Notion/Airtable pattern.
 */
const noTranslateStrategy: SortingStrategy = () => null;

/**
 * Module-level constant so `useSortable`'s internal `animateLayoutChanges`
 * effect doesn't see a fresh function ref on every render. Inline arrow
 * (`() => false`) was destabilizing dnd-kit's effect deps under hot drags.
 */
const ANIMATE_LAYOUT_CHANGES_NEVER = () => false;

/** Magic id used for the drag handle column / cell. */
export const DRAG_HANDLE_COL_ID = "__drag_handle__";

/* ─────────────────────────────────────────────────────────────────────── */
/* useTableDnD — the persistence + ordering brain                          */
/* ─────────────────────────────────────────────────────────────────────── */

type UseTableDnDArgs<T> = {
  data: T[];
  storageKey: string;
  getId: (row: T) => string;
};

export function useTableDnD<T>({
  data,
  storageKey,
  getId,
}: UseTableDnDArgs<T>) {
  // PERF: Stabilize getId via an internal ref. Callers idiomatically pass an
  // inline arrow (`(row) => row.employee.id`) which would otherwise be a
  // fresh ref every parent render — making `orderedData`, `rowIds`, and
  // `handleDragEnd` all churn fresh refs every render, then cascading those
  // fresh `items` into <SortableContext> and forcing its internal useMemo
  // to recompute. By absorbing getId into a ref we close the feedback path:
  // outputs of this hook are now referentially stable across renders unless
  // the data prop or persisted order actually changes.
  const getIdRef = useRef(getId);
  getIdRef.current = getId;
  const stableGetId = useCallback((row: T) => getIdRef.current(row), []);

  // null = no custom order saved; [] is treated the same as null on load.
  const [order, setOrder] = useState<string[] | null>(null);

  // Hydrate from localStorage on mount. Reads must be in an effect (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((x) => typeof x === "string") &&
        parsed.length > 0
      ) {
        setOrder(parsed);
      }
    } catch {
      // corrupt storage value — silently ignore and fall back to default order
    }
  }, [storageKey]);

  // Apply saved order to incoming data:
  //   1. Items in saved order (filtered to ones that still exist).
  //   2. Any new items from `data` not in saved order, appended in their
  //      original relative position.
  const orderedData = useMemo(() => {
    if (!order || order.length === 0) return data;
    const byId = new Map<string, T>();
    for (const row of data) byId.set(stableGetId(row), row);
    const seen = new Set<string>();
    const out: T[] = [];
    for (const id of order) {
      const row = byId.get(id);
      if (row && !seen.has(id)) {
        out.push(row);
        seen.add(id);
      }
    }
    for (const row of data) {
      const id = stableGetId(row);
      if (!seen.has(id)) out.push(row);
    }
    return out;
  }, [data, order, stableGetId]);

  const rowIds = useMemo(
    () => orderedData.map(stableGetId),
    [orderedData, stableGetId],
  );

  const persist = useCallback(
    (next: string[]) => {
      setOrder(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // quota exceeded or storage disabled — order still lives in state for this session
      }
    },
    [storageKey],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = rowIds.indexOf(String(active.id));
      const newIndex = rowIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      persist(arrayMove(rowIds, oldIndex, newIndex));
    },
    [rowIds, persist],
  );

  const resetOrder = useCallback(() => {
    setOrder(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  const hasCustomOrder = order !== null && order.length > 0;

  return {
    orderedData,
    rowIds,
    handleDragEnd,
    resetOrder,
    hasCustomOrder,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */
/* DragHandleContext — bridges row-level useSortable to the handle cell    */
/* ─────────────────────────────────────────────────────────────────────── */

type DragHandleContextValue = {
  attributes: HTMLAttributes<HTMLElement>;
  listeners: HTMLAttributes<HTMLElement> | undefined;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  isDragging: boolean;
  disabled: boolean;
};

const DragHandleContext = createContext<DragHandleContextValue | null>(null);

/* ─────────────────────────────────────────────────────────────────────── */
/* DndTableProvider — DndContext + SortableContext combo                   */
/* ─────────────────────────────────────────────────────────────────────── */

export function DndTableProvider({
  id = "dnd-table",
  rowIds,
  onDragEnd,
  renderOverlay,
  children,
}: {
  /** Deterministic context id. Required for SSR — `<DndContext>` otherwise
   * generates a random id on the server that won't match the client, causing
   * an aria-describedby hydration mismatch. */
  id?: string;
  rowIds: string[];
  onDragEnd: (event: DragEndEvent) => void;
  /** PERF: Renders a simplified visual clone in the <DragOverlay> portal.
   * The original <SortableRow> goes opacity:0 while dragging, which avoids
   * re-laying-out the heavy sticky-column row on every animation frame.
   * The render fn receives the active row's id and returns the preview JSX. */
  renderOverlay?: (activeId: string) => ReactNode;
  children: ReactNode;
}) {
  // Pointer activation distance prevents accidental drags during click;
  // gives the user 6px of slack for a true click vs. a drag intent.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // PERF: We deliberately do NOT keep `activeId` state on this component.
  // Earlier versions did, and the setState on drag-start/cancel re-rendered
  // <DndTableProvider> + traversed its children every time a drag began or
  // ended. The state now lives on a sibling component (<ActiveDragOverlay>)
  // that subscribes to dnd-kit events via `useDndMonitor` — so this provider
  // renders exactly once and never again per drag.
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={rowIds} strategy={noTranslateStrategy}>
        {children}
      </SortableContext>
      {renderOverlay ? (
        <ActiveDragOverlay renderOverlay={renderOverlay} />
      ) : null}
    </DndContext>
  );
}

/**
 * Inner component that owns the `activeId` state. Subscribes to dnd-kit drag
 * events via `useDndMonitor` (a child-of-DndContext hook). Re-renders ONLY
 * this subtree on drag start/end — never bubbles up to <DndTableProvider>
 * or its children.
 */
function ActiveDragOverlay({
  renderOverlay,
}: {
  renderOverlay: (activeId: string) => ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Stable handler refs so useDndMonitor's internal subscription doesn't
  // re-bind on every render of this component.
  const onDragStart = useCallback((event: { active: { id: string | number } }) => {
    setActiveId(String(event.active.id));
  }, []);
  const onDragEnd = useCallback(() => setActiveId(null), []);
  const onDragCancel = useCallback(() => setActiveId(null), []);

  useDndMonitor({ onDragStart, onDragEnd, onDragCancel });

  return (
    // dropAnimation:null skips the snap-back tween — with our overlay
    // shape differing from the row shape, the default tween reads as a
    // weird squash. Snapping is faster and visually cleaner.
    <DragOverlay dropAnimation={null}>
      {activeId ? renderOverlay(activeId) : null}
    </DragOverlay>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* SortableRow — a draggable <tr>                                           */
/* ─────────────────────────────────────────────────────────────────────── */

type SortableRowProps = {
  id: string;
  children: ReactNode;
  className?: string;
  /** When true, the drag handle is rendered inert. Used when a column sort
   * is active — the visual order would not match the persisted custom order
   * if dragging were allowed during sort. */
  disabled?: boolean;
  onClick?: HTMLAttributes<HTMLTableRowElement>["onClick"];
};

/**
 * SortableRow renders a `<tr>` that:
 *  - registers as a sortable item with dnd-kit (via `setNodeRef`)
 *  - exposes drag-handle wiring through context (for <DragHandleCell>)
 *  - intentionally applies NO transform/transition during a drag
 *
 * That last point is the architectural fix. Combined with the
 * `noTranslateStrategy` on SortableContext above, no row ever gets a
 * `transform` applied to it. Sticky cells inside rows therefore never get
 * trapped in a transformed containing block, and the browser does no
 * per-frame sticky-recompute work during drags.
 *
 * The dragged row is rendered transparent (`opacity: 0`) — the visible drag
 * preview lives in `<DragOverlay>` (portal). The row about to receive the
 * drop is highlighted via `isOver` for clear feedback, since rows no longer
 * slide visually to make space.
 */
export const SortableRow = memo(function SortableRow({
  id,
  children,
  className,
  disabled = false,
  onClick,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
    isOver,
  } = useSortable({
    id,
    disabled,
    // Disable @dnd-kit's FLIP layout animation. Module-level constant —
    // inlining `() => false` here would be a fresh ref every render and
    // destabilize useSortable's internal effect deps on hot drags.
    animateLayoutChanges: ANIMATE_LAYOUT_CHANGES_NEVER,
  });

  // No transform, no transition. Stable object identity unless `isDragging`
  // actually changes — so memoized children never see a churning `style` prop.
  const style = useMemo<CSSProperties>(
    () => ({ opacity: isDragging ? 0 : undefined }),
    [isDragging],
  );

  // PERF: stable context value. DragHandleCell consumes via context — a fresh
  // ctx object every render would force every drag-handle cell to re-render
  // on every parent re-render.
  const ctx = useMemo<DragHandleContextValue>(
    () => ({
      attributes: attributes as unknown as HTMLAttributes<HTMLElement>,
      listeners: listeners as unknown as
        | HTMLAttributes<HTMLElement>
        | undefined,
      setActivatorNodeRef,
      isDragging,
      disabled,
    }),
    [attributes, listeners, setActivatorNodeRef, isDragging, disabled],
  );

  // Drop indicator. Background tint (no border) so we don't shift cell
  // heights by 1–2px on every hover transition during a drag.
  const finalClassName = cn(
    className,
    isOver && !isDragging && "!bg-indigo-50/70 dark:!bg-indigo-950/40",
  );

  return (
    <DragHandleContext.Provider value={ctx}>
      <tr
        ref={setNodeRef}
        style={style}
        onClick={onClick}
        data-dragging={isDragging ? "true" : undefined}
        data-drop-target={isOver && !isDragging ? "true" : undefined}
        className={finalClassName}
      >
        {children}
      </tr>
    </DragHandleContext.Provider>
  );
});

/* ─────────────────────────────────────────────────────────────────────── */
/* DragHandleCell — <td> with the GripVertical activator                   */
/* ─────────────────────────────────────────────────────────────────────── */

export function DragHandleCell({
  className,
  cellClassName,
}: {
  /** Extra classes for the inner button. */
  className?: string;
  /** Extra classes for the wrapping <td>. */
  cellClassName?: string;
}) {
  const ctx = useContext(DragHandleContext);
  // Defaults: sticky-left + opaque bg so the column doesn't bleed-through
  // when the table scrolls horizontally. `bg-white` (not `bg-inherit`) is
  // intentional — semi-transparent row backgrounds (hover, dirty) would
  // otherwise let underlying cells show through during horizontal scroll.
  const baseTd =
    "sticky left-0 z-10 w-[40px] px-2 align-middle bg-white dark:bg-slate-900";
  if (!ctx) {
    return <td className={cn(baseTd, cellClassName)} />;
  }
  return (
    <td
      className={cn(baseTd, cellClassName)}
      // Stop click bubbling so row-level click handlers (e.g. monthly-data
      // row click → opens detail dialog) don't fire when grabbing the handle.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        ref={ctx.setActivatorNodeRef}
        {...(ctx.listeners ?? {})}
        {...(ctx.attributes ?? {})}
        disabled={ctx.disabled}
        aria-label="Drag to reorder row"
        title={ctx.disabled ? "Clear sort to reorder rows" : "Drag to reorder"}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors",
          ctx.disabled
            ? "cursor-not-allowed opacity-40"
            : "cursor-grab hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing",
          className,
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </td>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* DragHandleHeader — empty <th> with consistent width                     */
/* ─────────────────────────────────────────────────────────────────────── */

/** Header cell for the drag handle column.
 *
 * Sticky-left + opaque slate-100 by default. When `resetVisible` is true and
 * an `onReset` callback is provided, renders a subtle RotateCcw icon button
 * — this is the in-header replacement for the standalone "Reset Order" text
 * button that used to live in each table's toolbar.
 *
 * Pair with `<thead className="sticky top-0 z-20">`. Tables that have BOTH
 * sticky-top and sticky-left (e.g. daily-logs) can override `className` to
 * bump this corner to z-30. */
export function DragHandleHeader({
  className,
  rowSpan,
  onReset,
  resetVisible = false,
}: {
  className?: string;
  rowSpan?: number;
  /** Called when the user clicks the reset icon. */
  onReset?: () => void;
  /** Hide the icon when there's nothing to reset (no custom order, no sort). */
  resetVisible?: boolean;
}) {
  return (
    <th
      rowSpan={rowSpan}
      aria-label="Reorder column"
      className={cn(
        "sticky left-0 z-20 w-[40px] px-2 align-middle bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
        className,
      )}
    >
      {onReset && resetVisible ? (
        <button
          type="button"
          onClick={onReset}
          title="Reset Order"
          aria-label="Reset row order"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </th>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* RowDragPreview — simplified clone rendered inside <DragOverlay>         */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Standardised "card" used as the floating drag preview across all four
 * tables. Rendered in a portal by <DragOverlay>, so it sits on top of the
 * page (no sticky-column re-layout cost on every frame).
 *
 * pointer-events-none keeps it from intercepting mouseover events on the
 * underlying drop targets while it follows the cursor.
 */
export function RowDragPreview({
  initials,
  avatarClassName,
  name,
  subtitle,
  trailing,
}: {
  initials: string;
  avatarClassName: string;
  name: string;
  subtitle?: string;
  /** Optional trailing content — e.g. a badge or compact metric. */
  trailing?: ReactNode;
}) {
  return (
    <div className="pointer-events-none flex w-max max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xl ring-2 ring-indigo-500/40">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          avatarClassName,
        )}
      >
        {initials}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium leading-tight text-slate-900">
          {name}
        </div>
        {subtitle ? (
          <div className="truncate text-xs leading-tight text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}
