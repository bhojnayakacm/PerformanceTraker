"use client";

/**
 * Sidebar with hover-debounced TanStack Query prefetch.
 *
 *   • Next.js `<Link prefetch={true}>` handles the RSC prefetch — all
 *     dashboard routes are eagerly prefetched on viewport intersect, so
 *     `loading.tsx` streams instantly upon click and the page's server
 *     prefetch (its `prefetchQuery` + `dehydrate(queryClient)`) is
 *     bundled into that RSC payload.
 *   • The `onMouseEnter`/`onFocus` handler below ADDS a 150 ms-debounced
 *     direct prefetch into the browser `queryClient`. This is redundant
 *     with the RSC prefetch in the common case but rescues two corners:
 *       (a) RSC prefetches eventually age out of Next.js's cache.
 *       (b) The user lingered on the current page past our 30 s
 *           staleTime, so the previously-warm entries are now stale.
 *     In both cases a 150 ms hover re-warms the cache directly, so the
 *     subsequent click hydrates synchronously with no skeleton flash.
 *
 * Why 150 ms: filters out incidental mouse-through events (cursor crossing
 * the sidebar to reach the main content) while still firing comfortably
 * before any deliberate click. Repeat hovers within 30 s are no-ops —
 * `prefetchQuery` skips when the cached entry is still fresh.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Upload,
  UserCog,
  BarChart3,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";
import { prefetchRoute } from "@/lib/queries/prefetch-route";
import type { UserRole } from "@/lib/types";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Employees", href: "/employees", icon: Users },
  { title: "Daily Logs", href: "/daily-logs", icon: ClipboardList },
  { title: "Monthly Data", href: "/monthly-data", icon: CalendarDays },
  { title: "Cumulative Data", href: "/cumulative-data", icon: CalendarRange },
  { title: "Import Data", href: "/import", icon: Upload },
  { title: "User Management", href: "/users", icon: UserCog },
  { title: "Reports", href: "/reports", icon: BarChart3 },
];

const HOVER_DEBOUNCE_MS = 150;

type Props = {
  userId: string;
  userRole: UserRole;
};

export function AppSidebar({ userId, userRole }: Props) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const queryClient = useQueryClient();
  // Memoized so the same browser client is reused across hovers — keeps
  // Supabase's internal session/auth listeners stable rather than spinning
  // up a new pool every time the user grazes the sidebar.
  const supabase = useMemo(() => createClient(), []);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHover = () => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const scheduleHover = (href: string) => {
    cancelHover();
    hoverTimer.current = setTimeout(() => {
      prefetchRoute(queryClient, href, { supabase, userId, userRole });
      hoverTimer.current = null;
    }, HOVER_DEBOUNCE_MS);
  };

  // Guard against a pending timer outliving the component (e.g. layout
  // teardown on logout). Without this, a fire-after-unmount would still
  // run prefetchRoute against a queryClient nobody listens to.
  useEffect(() => {
    return () => {
      if (hoverTimer.current !== null) {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
    };
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b border-slate-200 px-2 py-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" prefetch={true} />}
              className="font-semibold text-slate-900 hover:bg-slate-100 hover:text-slate-900"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-sm font-bold shadow-[0_4px_12px_-4px_rgba(79,70,229,0.4)] ring-1 ring-indigo-500/20">
                PT
              </div>
              <span className="truncate tracking-tight">
                Performance Tracker
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link
                          href={item.href}
                          prefetch={true}
                          onMouseEnter={() => scheduleHover(item.href)}
                          onMouseLeave={cancelHover}
                          onFocus={() => scheduleHover(item.href)}
                          onBlur={cancelHover}
                        />
                      }
                      tooltip={mounted ? item.title : undefined}
                      isActive={isActive}
                      className="relative h-9 gap-3 text-[13px] text-slate-600 transition-all duration-200 ease-out hover:bg-indigo-50/60 hover:text-slate-900 data-active:bg-indigo-50 data-active:text-indigo-700 data-active:hover:bg-indigo-50 data-active:hover:text-indigo-700 data-active:before:content-[''] data-active:before:absolute data-active:before:inset-y-0 data-active:before:left-0 data-active:before:w-[3px] data-active:before:bg-indigo-600"
                    >
                      <item.icon
                        className={isActive ? "text-indigo-600" : "text-slate-500"}
                      />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
