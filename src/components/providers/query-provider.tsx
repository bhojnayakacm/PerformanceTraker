"use client";

/**
 * Client-only wrapper that hands the QueryClient down through React Context
 * so every <useQuery> below can find it. Mounted at the (dashboard)/layout.tsx
 * boundary — high enough that every dashboard page sees the same browser
 * QueryClient, low enough that we don't pay the cache cost on /login.
 *
 * <ReactQueryDevtools> only loads in dev (Next strips the `process.env.NODE_ENV
 * !== "production"` branch via dead-code elimination in the prod build), so
 * there's no production bundle penalty.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getQueryClient } from "@/lib/query-client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Call getQueryClient() inside the component body — must NOT be hoisted.
  // On the server, every render needs a fresh client; on the browser, the
  // inner isServer check returns the same singleton across renders.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV !== "production" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}
