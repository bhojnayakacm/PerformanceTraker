/**
 * MIDDLEWARE Supabase Client
 * ==========================
 * Used exclusively in Next.js middleware (middleware.ts at project root).
 *
 * WHY a separate middleware client?
 * Middleware runs on the Edge Runtime BEFORE any page renders. It has access
 * to the request and can modify the response. This is the ideal place to:
 *   1. Refresh expired auth tokens (keeps users logged in)
 *   2. Redirect unauthenticated users to /login
 *   3. Block routes based on user role
 *
 * The cookie handling here is more complex than the server client because
 * middleware can both READ from the request and WRITE to the response.
 * We must sync cookies between both to ensure downstream Server Components
 * see the refreshed token.
 *
 * HOW TO USE:
 *   // In middleware.ts at project root:
 *   import { updateSession } from "@/lib/supabase/middleware"
 *   export async function middleware(request: NextRequest) {
 *     return await updateSession(request)
 *   }
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Start with a "pass-through" response — the request continues as normal
  // unless we explicitly redirect below.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Read cookies from the incoming request
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write refreshed tokens to BOTH the request (for downstream RSCs)
          // and the response (for the browser to store)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          // Recreate the response to include the updated request cookies
          supabaseResponse = NextResponse.next({ request });

          // Also set cookies on the response so the browser gets them
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Use getUser() NOT getSession().
  // getUser() makes a network call to Supabase to validate the token.
  // getSession() only reads from the cookie and can be spoofed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If no authenticated user and not already on the login page → redirect
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If authenticated user tries to visit /login → send them to dashboard
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
