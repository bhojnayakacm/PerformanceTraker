/**
 * TanStack Query — shared QueryClient factory.
 *
 * Returns the right QueryClient for the current execution context. The two
 * cases differ in important ways:
 *
 *   • Server (RSC, route handlers): create a *fresh* QueryClient per request.
 *     Each request's dehydrated cache is serialized into <HydrationBoundary>
 *     and discarded after the response. Sharing a server QueryClient across
 *     requests would leak one user's cached rows into another user's render
 *     — a correctness issue, not just a perf one.
 *
 *   • Browser: a module-level singleton so the cache survives client-side
 *     navigations. This is the layer that makes filter backtracks free
 *     ("May → June → May" hits the cache instead of refetching) and powers
 *     `placeholderData: keepPreviousData` between filter changes.
 *
 * Defaults are tuned for this app:
 *   • staleTime 60s — monthly aggregates only mutate via user save (rare),
 *     so most cache entries stay correct far longer than 60s. The shorter
 *     window keeps everything fresh after a Monthly Data save without
 *     forcing a full reload.
 *   • gcTime 5m — generous, because the cost of holding a few KB of rolled-up
 *     numbers in memory is nothing compared to the user-perceived value of
 *     a 0-ms backtrack 4 minutes later.
 *   • refetchOnWindowFocus off — every save calls revalidatePath already,
 *     and tab-focus refetch would thrash the cache for no fresh data.
 */
import { isServer, QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) {
    // Per-request instance — never share across requests.
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
