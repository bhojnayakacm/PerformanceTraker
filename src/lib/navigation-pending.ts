/**
 * Tiny subscribable "is a programmatic navigation in flight?" boolean.
 *
 * WHY
 * ---
 * `useTransition()`'s `isPending` is hook-local. When a selector wraps
 * `router.push` in `startTransition`, only THAT component sees its
 * isPending flip true. The Grid sitting below it has no signal that a
 * navigation has been kicked off, so it keeps rendering the previous
 * page's data at 100% opacity until the server resolves the new RSC
 * payload — which can take 300 ms-1 s on a cold cache. The result is
 * the "old data masquerading as new data" illusion this store fixes.
 *
 * HOW
 * ---
 * Each selector that triggers navigation mirrors its own useTransition
 * isPending into this store via a single `useEffect`:
 *
 *     useEffect(() => {
 *       if (isPending) {
 *         navigationPendingStore.start();
 *         return () => navigationPendingStore.end();
 *       }
 *     }, [isPending]);
 *
 * The cleanup-pairing guarantee from React means every `start()` is
 * matched by an `end()` — including the unmount path, which fires the
 * cleanup if the user navigates away mid-flight.
 *
 * Grids subscribe via `useNavigationPending()` and OR the result into
 * their existing `showOverlay = isFetching || isPending` expression.
 *
 * REFCOUNTING
 * -----------
 * The internal counter (not a boolean) handles the rare case of two
 * selectors firing simultaneously without one accidentally clearing
 * the other's pending state. Concurrent starts add; their cleanups
 * subtract; the public `get` returns `count > 0`.
 *
 * Server snapshot is constant `false` — nothing is in-flight on first
 * paint by definition.
 */

import { useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const navigationPendingStore = {
  get: () => count > 0,
  start: () => {
    count += 1;
    if (count === 1) emit();
  },
  end: () => {
    if (count === 0) return;
    count -= 1;
    if (count === 0) emit();
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

const getServerSnapshot = () => false;

export function useNavigationPending(): boolean {
  return useSyncExternalStore(
    navigationPendingStore.subscribe,
    navigationPendingStore.get,
    getServerSnapshot,
  );
}
