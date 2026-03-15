/**
 * Root Page — Temporary Landing
 * ==============================
 * This page will be replaced in Phase 3 (Auth) with a redirect:
 *   - Authenticated users → /dashboard
 *   - Unauthenticated users → /login
 *
 * For now, it serves as a visual check that the foundation is working:
 *   Next.js + Tailwind + shadcn/ui all rendering correctly.
 */

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      {/* App title — uses Tailwind's typography utilities */}
      <h1 className="text-4xl font-bold tracking-tight">
        Performance Tracker
      </h1>

      <p className="max-w-md text-center text-muted-foreground">
        Employee performance tracking dashboard for management.
        Built with Next.js, Supabase, and shadcn/ui.
      </p>

      {/* shadcn Button — confirms the component library is wired up */}
      <Button size="lg">
        Get Started
      </Button>

      {/* Version badge — quick visual confirmation of the stack */}
      <div className="flex gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border px-3 py-1">Next.js 15</span>
        <span className="rounded-full border px-3 py-1">Tailwind v4</span>
        <span className="rounded-full border px-3 py-1">Supabase</span>
        <span className="rounded-full border px-3 py-1">shadcn/ui</span>
      </div>
    </div>
  );
}
