"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const initials =
    userName
      .split(/[\s@]/)
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <SidebarTrigger className="-ml-1 text-slate-600 hover:text-slate-900" />
      <Separator orientation="vertical" className="mr-2 !h-4 bg-slate-200" />
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right">
          <p className="text-sm font-semibold leading-none text-slate-800">
            {userName}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 capitalize">
            {userRole.replace("_", " ")}
          </p>
        </div>
        <div
          className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold ring-1 ring-primary/15"
          aria-hidden="true"
        >
          {initials}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          <span className="sr-only">Log out</span>
        </Button>
      </div>
    </header>
  );
}
