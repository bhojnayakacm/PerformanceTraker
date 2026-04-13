import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/queries/auth";
import { ImportWizard } from "./_components/import-wizard";

export default async function ImportPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  if (auth.role !== "super_admin") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
          <p className="text-muted-foreground mt-1">
            Bulk import employees, monthly figures, daily logs, and city tours
            from CSV files.
          </p>
        </div>
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          Only Super Admins can import data.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground mt-1">
          Bulk import employees, monthly figures, daily logs, and city tours
          from CSV files.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
