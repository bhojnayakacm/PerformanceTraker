import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - icons (your PWA images)
     * - manifest.json (your PWA manifest)
     * - sw.js (your Service Worker)
     * - swe-worker- (Serwist generated worker files)
     * - standard image extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest\\.json|sw\\.js|swe-worker-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};