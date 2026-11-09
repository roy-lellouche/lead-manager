import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FileCheck, Percent, PhoneCall, Users } from "lucide-react";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES_ADMIN,
  INSTALLATION_TYPE_LABELS,
  INSTALLATION_TYPES,
  STATUS_CHART_COLORS,
  INSTALLATION_CHART_COLORS,
  type LeadStatus,
  type InstallationType,
} from "@/lib/types";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import { Panel } from "@/components/ui-kit/Panel";
import { BarList } from "@/components/ui-kit/BarList";
import { PeriodFilter } from "@/components/ui-kit/PeriodFilter";

function getDateRange(from?: string, to?: string) {
  const now = new Date();
  const fromStr = from || toDateStr(startOfMonth(now));
  const toStr = to || toDateStr(endOfMonth(now));
  return { from: new Date(fromStr), to: new Date(toStr) };
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function TeleproStatsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { from: fromDate, to: toDate } = getDateRange(sp.from, sp.to);
  toDate.setHours(23, 59, 59, 999);

  const adminClient = createAdminClient();

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", id)
    .eq("role", "telepro")
    .is("deleted_at", null)
    .single();

  if (!profile) notFound();

  const [
    { count: callsInPeriod },
    { data: leads },
    { data: docRecusLeads },
  ] = await Promise.all([
    adminClient
      .from("lead_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", id)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString()),
    adminClient
      .from("leads")
      .select("status")
      .eq("assigned_to", id)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString()),
    adminClient
      .from("leads")
      .select("installation_type")
      .eq("assigned_to", id)
      .eq("status", "documents_recus")
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString()),
  ]);

  const statusCounts = (leads || []).reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  const installationCounts = (docRecusLeads || []).reduce<Record<string, number>>((acc, l) => {
    const key = l.installation_type || "non_renseigne";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const totalLeads = (leads || []).length;
  const totalWithInstallation = (docRecusLeads || []).length;

  const statusData = LEAD_STATUSES_ADMIN.map((s) => ({
    name: LEAD_STATUS_LABELS[s],
    value: statusCounts[s] ?? 0,
    status: s,
  })).filter((d) => d.value > 0);

  const installationData = [
    ...INSTALLATION_TYPES.map((t) => ({
      name: INSTALLATION_TYPE_LABELS[t],
      value: installationCounts[t] ?? 0,
      type: t,
    })),
    ...(installationCounts["non_renseigne"] ? [{ name: "Non renseigné", value: installationCounts["non_renseigne"], type: "non_renseigne" }] : []),
  ]
    .filter((d) => d.value > 0)
    .map((d) => ({
      ...d,
      percent: totalWithInstallation > 0 ? Math.round((d.value / totalWithInstallation) * 100) : 0,
    }));

  const statusWithPercent = statusData.map((d) => ({
    ...d,
    percent: totalLeads > 0 ? Math.round((d.value / totalLeads) * 100) : 0,
  }));

  const conversion = totalLeads > 0 ? (totalWithInstallation / totalLeads) * 100 : 0;
  const now = new Date();
  const backQuery = [sp.from && `from=${sp.from}`, sp.to && `to=${sp.to}`].filter(Boolean).join("&");

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link
          href={`/admin${backQuery ? `?${backQuery}` : ""}`}
          className="mt-1 rounded-lg border border-line bg-white p-2 text-subtle shadow-card transition-colors hover:text-ink"
          aria-label="Retour au classement"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader
          eyebrow="Statistique télépro"
          title={profile.full_name || profile.email}
          subtitle={profile.email ?? undefined}
        />
      </div>

      <PeriodFilter
        defaultFrom={format(startOfMonth(now), "yyyy-MM-dd")}
        defaultTo={format(endOfMonth(now), "yyyy-MM-dd")}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Appels" value={callsInPeriod ?? 0} icon={PhoneCall} tone="brand" hint="Actions enregistrées sur les leads" />
        <StatCard label="Leads de la période" value={totalLeads} icon={Users} tone="amethyst" />
        <StatCard label="Documents reçus" value={totalWithInstallation} icon={FileCheck} tone="success" />
        <StatCard
          label="Taux de conversion"
          value={`${conversion.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}
          icon={Percent}
          tone="warning"
          hint="Documents reçus / leads"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Statuts des leads" description="Leads créés sur la période">
          <BarList
            emptyLabel="Aucun lead sur la période"
            items={statusWithPercent.map((d) => ({
              label: d.name,
              value: d.value,
              color: STATUS_CHART_COLORS[d.status as LeadStatus] ?? "#9ca3af",
            }))}
          />
        </Panel>
        <Panel title="Types d'installation" description="Dossiers en « Documents reçus »">
          <BarList
            emptyLabel="Aucun document reçu sur la période"
            items={installationData.map((d) => ({
              label: d.name,
              value: d.value,
              color: INSTALLATION_CHART_COLORS[d.type as InstallationType] ?? "#9ca3af",
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
