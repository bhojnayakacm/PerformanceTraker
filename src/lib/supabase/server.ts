/**
 * SERVER Supabase Client
 * =======================
 * Used in Server Components, Server Actions, and Route Handlers.
 *
 * WHY a separate server client?
 * On the server, there are no browser cookies automatically available.
 * We must explicitly read cookies from the incoming request using Next.js's
 * `cookies()` API and pass them to Supabase so it can identify the user.
 *
 * The `setAll` method handles refreshing expired auth tokens — Supabase may
 * issue a new token during a request, and we need to write it back to the
 * response cookies. The try/catch exists because `cookies().set()` throws
 * when called from a Server Component (read-only context). That's fine —
 * the middleware will handle the refresh instead.
 *
 * HOW TO USE:
 *   import { createClient } from "@/lib/supabase/server"
 *   const supabase = await createClient()
 *   const { data } = await supabase.from("employees").select()
 *
 * NOTE: This function is async because `cookies()` is async in Next.js 15.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component (read-only context).
            // Safe to ignore — middleware handles token refresh.
          }
        },
      },
    }
  );
}
