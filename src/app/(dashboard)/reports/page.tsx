import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportBuilder } from "./_components/report-builder";

export default async function ReportsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Generate performance reports and export to Excel or CSV.
        </p>
      </div>
      <ReportBuilder employees={employees ?? []} />
    </div>
  );
}
