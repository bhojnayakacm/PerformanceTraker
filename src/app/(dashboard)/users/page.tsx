import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UsersDataTable } from "./_components/users-data-table";

export default async function UsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: profiles }, { data: employees }] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  if (profile?.role !== "super_admin") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">
            User Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage application users and their roles.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-muted-foreground shadow-[0_1px_2px_0_rgba(15,23,42,0.04)]">
          <p>Only Super Admins can manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage application users and their roles.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <UsersDataTable
          data={profiles ?? []}
          currentUserId={user.id}
          employees={employees ?? []}
        />
      </div>
    </div>
  );
}
