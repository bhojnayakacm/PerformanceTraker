import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "./_components/import-wizard";

export default async function ImportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = profile?.role ?? "viewer";

  if (userRole !== "super_admin") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
          <p className="text-muted-foreground mt-1">
            Import employee data and performance records.
          </p>
        </div>
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <p>Only Super Admins can import data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground mt-1">
          Bulk import employees, targets, and actuals from CSV or Excel files.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
