"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 !h-4" />
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium leading-none">{userName}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {userRole.replace("_", " ")}
          </p>
        </div>
        <form action={logout}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Log out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
