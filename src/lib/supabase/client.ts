/**
 * BROWSER Supabase Client
 * =======================
 * Used in Client Components (files with "use client" at the top).
 *
 * WHY a separate browser client?
 * Next.js runs code in 3 environments: browser, server (RSC/actions), and
 * middleware (edge). Each has different access to cookies and headers.
 * The browser client uses `createBrowserClient` which automatically handles
 * auth tokens via browser cookies — no manual cookie wiring needed.
 *
 * HOW TO USE:
 *   import { createClient } from "@/lib/supabase/client"
 *   const supabase = createClient()
 *   const { data } = await supabase.from("employees").select()
 *
 * The client is lightweight — safe to create per-component. Supabase JS
 * deduplicates connections internally.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
