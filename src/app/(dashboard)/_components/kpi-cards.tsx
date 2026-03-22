import {
  Users,
  Handshake,
  Phone,
  MapPin,
  IndianRupee,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { KpiData } from "../_lib/dashboard-helpers";
import { pct, formatNumber } from "../_lib/dashboard-helpers";

type KpiCardProps = {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  achievement?: number | null;
};

function KpiCard({ title, value, subtitle, icon, achievement }: KpiCardProps) {
  const achieveColor =
    achievement === null || achievement === undefined
      ? ""
      : achievement >= 90
        ? "text-emerald-600"
        : achievement >= 70
          ? "text-amber-600"
          : "text-red-600";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="rounded-lg bg-muted p-2.5">{icon}</div>
        </div>
        {achievement !== null && achievement !== undefined && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Achievement</span>
              <span className={`font-semibold ${achieveColor}`}>
                {achievement}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  achievement >= 90
                    ? "bg-emerald-500"
                    : achievement >= 70
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${Math.min(achievement, 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ICON_CLASS = "h-5 w-5 text-muted-foreground";

export function KpiCards({ kpis }: { kpis: KpiData }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        title="Active Employees"
        value={String(kpis.activeEmployees)}
        subtitle="Currently active"
        icon={<Users className={ICON_CLASS} />}
        achievement={null}
      />
      <KpiCard
        title="Total Meetings"
        value={formatNumber(kpis.totalMeetingsActual)}
        subtitle={`Target: ${formatNumber(kpis.totalMeetingsTarget)}`}
        icon={<Handshake className={ICON_CLASS} />}
        achievement={pct(kpis.totalMeetingsActual, kpis.totalMeetingsTarget)}
      />
      <KpiCard
        title="Total Calls"
        value={formatNumber(kpis.totalCallsActual)}
        subtitle={`Target: ${formatNumber(kpis.totalCallsTarget)}`}
        icon={<Phone className={ICON_CLASS} />}
        achievement={pct(kpis.totalCallsActual, kpis.totalCallsTarget)}
      />
      <KpiCard
        title="Client Visits"
        value={formatNumber(kpis.totalClientVisitsActual)}
        subtitle={`Target: ${formatNumber(kpis.totalClientVisitsTarget)}`}
        icon={<MapPin className={ICON_CLASS} />}
        achievement={pct(
          kpis.totalClientVisitsActual,
          kpis.totalClientVisitsTarget
        )}
      />
      <KpiCard
        title="Total Costing"
        value={`₹${formatNumber(kpis.totalCosting)}`}
        subtitle="Salary + TA/DA + Incentive + Promo"
        icon={<IndianRupee className={ICON_CLASS} />}
        achievement={null}
      />
    </div>
  );
}
