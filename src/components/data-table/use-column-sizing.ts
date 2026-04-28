"use client";

/**
 * Column-sizing hook that bypasses TanStack Table's resize feature entirely.
 *
 * Why not use TanStack's built-in resize:
 *
 * Even with `columnResizeMode: 'onEnd'`, TanStack still calls
 * `setColumnSizingInfo` on every pointermove event. That's a React state
 * update per mouse-move tick, which forces every column header to re-render
 * each frame, which on a sticky-column table means a full layout pass per
 * frame. With ~60 events/second × dozens of cells re-rendering × sticky
 * positioning recalc → "Page Unresponsive" and crashes.
 *
 * What this hook does instead:
 *
 *   1. Holds the canonical width for each column in React state, but ONLY
 *      reads/writes to it on pointer-up. The drag itself doesn't touch
 *      React state at all.
 *   2. During a drag, the move handler writes a single CSS variable
 *      directly to the `<table>` element's inline style via a ref. The
 *      browser repaints the affected column at GPU/compositor speed with
 *      zero React reconciliation work.
 *   3. The same CSS vars are also injected via React on each render for
 *      the initial paint, so when state commits on pointer-up the value
 *      already matches the DOM-set var — no flicker.
 *
 * Consumers wire `tableRef`, `tableStyle`, and `widthCalc` onto their
 * `<table>`, then read `getColumnStyle(id)` for the per-column width and
 * `getResizeHandleProps(id)` for the resize divider's pointer events.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

export type SizingColumn = {
  /** Stable column identifier — used as the CSS var key. Must be a valid
   *  CSS identifier: letters, digits, hyphens, underscores. */
  id: string;
  /** Initial / default width in pixels. */
  size: number;
  /** Minimum allowed width in pixels. The drag clamps to this. */
  minSize: number;
};

export type ColumnSizing = {
  /** Inline-style spread for the `<table>` element. Sets `tableLayout: 'fixed'`
   *  and the initial CSS variables. The hook will mutate these vars directly
   *  on the element during a drag (via `tableRef`) without going through React. */
  tableStyle: CSSProperties;
  /** Required ref for the `<table>` element. Without it, the live drag
   *  updates can't find the DOM node to set vars on. */
  tableRef: RefObject<HTMLTableElement | null>;
  /** A `calc(var(--col-A-w) + var(--col-B-w) + ...)` expression for the
   *  table's total width. Use as `width: \`calc(${PREFIX}px + ${widthCalc})\``
   *  if you have a fixed-width drag-handle column to add in. */
  widthCalc: string;
  /** Width style for one column — `{ width: 'var(--col-X-w)' }`. */
  getColumnStyle: (id: string) => CSSProperties;
  /** Pointer event handlers to spread onto the resize-divider element. */
  getResizeHandleProps: (id: string) => {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
  /** ID of the column currently being resized (for highlighting its handle). */
  resizingId: string | null;
};

export function useColumnSizing(columns: SizingColumn[]): ColumnSizing {
  const [sizes, setSizes] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const c of columns) init[c.id] = c.size;
    return init;
  });
  const [resizingId, setResizingId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);

  // Refs that the (stable, useCallback'd) pointer handlers read from. Keep
  // them in sync with the latest props/state on every render.
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  const minSizesRef = useRef<Record<string, number>>({});
  minSizesRef.current = Object.fromEntries(
    columns.map((c) => [c.id, c.minSize]),
  );

  const active = useRef<{
    id: string;
    startX: number;
    startWidth: number;
    current: number;
    minWidth: number;
  } | null>(null);

  // PERF: requestAnimationFrame throttle. Pointer events fire at the input
  // device rate (60Hz on most mice, 120/144Hz on high-refresh hardware). Even
  // a single CSS-var write triggers a browser layout pass over the whole
  // table; on a 100-row table that's ~5–10ms. At 144Hz that's >1.4s of layout
  // work per real-time second — the queue never drains and "Page Unresponsive"
  // fires. RAF coalesces multiple pointermoves into one DOM write per frame.
  const rafIdRef = useRef<number | null>(null);
  const pendingRef = useRef<{ id: string; width: number } | null>(null);

  const flushPending = useCallback(() => {
    rafIdRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    tableRef.current?.style.setProperty(
      `--col-${pending.id}-w`,
      `${pending.width}px`,
    );
  }, []);

  // Add new columns into sizes if the columns prop adds any. We deliberately
  // do NOT remove sizes for columns that disappeared — keep them for hot
  // toggling / re-additions later in the session.
  useEffect(() => {
    setSizes((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const c of columns) {
        if (!(c.id in next)) {
          next[c.id] = c.size;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [columns]);

  // Cancel any pending RAF on unmount so we don't leak a frame-callback
  // referencing a torn-down DOM node.
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // CSS-vars block used for the table element's inline style. React-controlled,
  // so it always matches `sizes` state. The drag handler also pokes these vars
  // directly via `tableRef` for the live drag — both paths converge to the
  // same value on commit.
  const tableStyle = useMemo<CSSProperties>(() => {
    const style: Record<string, string> = {};
    for (const c of columns) {
      style[`--col-${c.id}-w`] = `${sizes[c.id] ?? c.size}px`;
    }
    return {
      tableLayout: "fixed",
      ...style,
    } as CSSProperties;
  }, [columns, sizes]);

  // `calc(var(--col-A-w) + var(--col-B-w) + ...)` — the total of the resizable
  // columns. Consumers can wrap this in a calc() that adds any fixed-width
  // sibling columns (e.g. the 40px drag handle).
  const widthCalc = useMemo(() => {
    if (columns.length === 0) return "0px";
    return `calc(${columns.map((c) => `var(--col-${c.id}-w)`).join(" + ")})`;
  }, [columns]);

  const getColumnStyle = useCallback(
    (id: string): CSSProperties => ({ width: `var(--col-${id}-w)` }),
    [],
  );

  const onPointerDown = useCallback(
    (id: string, e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const startWidth = sizesRef.current[id] ?? 100;
      active.current = {
        id,
        startX: e.clientX,
        startWidth,
        current: startWidth,
        minWidth: minSizesRef.current[id] ?? 60,
      };
      setResizingId(id);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [],
  );

  // PERF-CRITICAL: this fires on every pointermove (60–144Hz). It does not
  // call setState — it queues a single CSS-var write per animation frame
  // via RAF. The browser repaints column widths from var changes at native
  // compositor speed; React stays out of the loop entirely.
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active.current) return;
      const next = Math.max(
        active.current.minWidth,
        Math.round(
          active.current.startWidth + (e.clientX - active.current.startX),
        ),
      );
      if (next === active.current.current) return;
      active.current.current = next;
      pendingRef.current = { id: active.current.id, width: next };
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushPending);
      }
    },
    [flushPending],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active.current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released — ignore */
      }
      // Drain any RAF-pending DOM write before committing to React state, so
      // the inline style React sets on the next render matches the DOM. (No
      // flicker on pointer-up.)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (pendingRef.current) {
        tableRef.current?.style.setProperty(
          `--col-${pendingRef.current.id}-w`,
          `${pendingRef.current.width}px`,
        );
        pendingRef.current = null;
      }
      const { id, current } = active.current;
      setSizes((prev) =>
        prev[id] === current ? prev : { ...prev, [id]: current },
      );
      active.current = null;
      setResizingId(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  const getResizeHandleProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) =>
        onPointerDown(id, e),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    }),
    [onPointerDown, onPointerMove, onPointerUp],
  );

  return {
    tableStyle,
    tableRef,
    widthCalc,
    getColumnStyle,
    getResizeHandleProps,
    resizingId,
  };
}
