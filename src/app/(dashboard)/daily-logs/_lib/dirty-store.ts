/**
 * Cross-tree "dirty count" bridge for Daily Logs.
 *
 * The date selector lives OUTSIDE the Suspense boundary (so it stays
 * interactive during fetches), while the heavy DailyLogView lives
 * INSIDE. That tree split means React Context can't carry state from
 * the view up to the selector — a Provider in the view can only feed
 * children below it.
 *
 * A tiny module-level subscribable store solves this without bringing
 * in a state library. DailyLogView publishes its dirty count via
 * `dirtyStore.set(n)`; the selector reads via `useDirtyCount()` and
 * uses it to gate the unsaved-changes confirm before navigating.
 *
 * `useSyncExternalStore` is the standard React 19 escape hatch for
 * exactly this — non-React state observed by multiple components, with
 * proper SSR support via the `getServerSnapshot` arg.
 */

import { useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();

export const dirtyStore = {
  get: () => count,
  set: (n: number) => {
    if (n === count) return;
    count = n;
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Server snapshot is always 0 — on first paint nothing can be dirty. */
const getServerSnapshot = () => 0;

export function useDirtyCount(): number {
  return useSyncExternalStore(
    dirtyStore.subscribe,
    dirtyStore.get,
    getServerSnapshot,
  );
}
