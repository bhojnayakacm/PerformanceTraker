"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
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

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Employees", href: "/employees", icon: Users },
  { title: "Daily Logs", href: "/daily-logs", icon: ClipboardList },
  { title: "Monthly Data", href: "/monthly-data", icon: CalendarDays },
  { title: "Import Data", href: "/import", icon: Upload },
  { title: "User Management", href: "/users", icon: UserCog },
  { title: "Reports", href: "/reports", icon: BarChart3 },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
                      render={<Link href={item.href} prefetch={true} />}
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
