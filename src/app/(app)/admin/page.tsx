import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ChevronRight, FileCheck, Percent, PhoneCall, Users } from "lucide-react";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES_ADMIN,
  INSTALLATION_TYPE_LABELS,
  INSTALLATION_TYPES,
  STATUS_CHART_COLORS,
  INSTALLATION_CHART_COLORS,
} from "@/lib/types";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import { Panel } from "@/components/ui-kit/Panel";
import { BarList, StackedBar } from "@/components/ui-kit/BarList";
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

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { from: fromDate, to: toDate } = getDateRange(params.from, params.to);
  toDate.setHours(23, 59, 59, 999);

  const adminClient = createAdminClient();

  const { data: telepros } = await adminClient
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "telepro")
    .is("deleted_at", null)
    .order("full_name");

  const activeTelepros = telepros || [];
  const teleproIds = activeTelepros.map((t) => t.id);

  let leadsByTelepro: Record<string, { status: string }[]> = {};
  let docRecusByTelepro: Record<string, { installation_type: string | null }[]> =
    {};
  let callsByTelepro: Record<string, number> = {};

  if (teleproIds.length > 0) {
    const [leadsRes, docRecusRes, logsRes] = await Promise.all([
      adminClient
        .from("leads")
        .select("assigned_to, status")
        .in("assigned_to", teleproIds)
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString()),
      adminClient
        .from("leads")
        .select("assigned_to, installation_type")
        .in("assigned_to", teleproIds)
        .eq("status", "documents_recus")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString()),
      adminClient
        .from("lead_logs")
        .select("user_id")
        .in("user_id", teleproIds)
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString()),
    ]);

    const leads = leadsRes.data || [];
    const docRecus = docRecusRes.data || [];
    const logs = logsRes.data || [];

    callsByTelepro = teleproIds.reduce<Record<string, number>>((acc, t) => {
      acc[t] = logs.filter((l) => l.user_id === t).length;
      return acc;
    }, {});

    for (const t of teleproIds) {
      leadsByTelepro[t] = leads.filter((l) => l.assigned_to === t);
      docRecusByTelepro[t] = docRecus.filter((l) => l.assigned_to === t);
    }
  }

  const defaultFrom = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const defaultTo = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const periodQuery = [params.from && `from=${params.from}`, params.to && `to=${params.to}`]
    .filter(Boolean)
    .join("&");

  const rows = activeTelepros
    .map((telepro) => {
      const leads = leadsByTelepro[telepro.id] || [];
      const statusCounts = leads.reduce<Record<string, number>>((acc, l) => {
        acc[l.status] = (acc[l.status] || 0) + 1;
        return acc;
      }, {});
      const docs = (docRecusByTelepro[telepro.id] || []).length;
      const total = leads.length;
      return {
        ...telepro,
        name: telepro.full_name || telepro.email,
        calls: callsByTelepro[telepro.id] ?? 0,
        total,
        docs,
        conversion: total > 0 ? (docs / total) * 100 : 0,
        statusCounts,
      };
    })
    // Classement : documents reçus, puis appels.
    .sort((a, b) => b.docs - a.docs || b.calls - a.calls || a.name.localeCompare(b.name));

  const teamCalls = rows.reduce((s, r) => s + r.calls, 0);
  const teamLeads = rows.reduce((s, r) => s + r.total, 0);
  const teamDocs = rows.reduce((s, r) => s + r.docs, 0);
  const teamConversion = teamLeads > 0 ? (teamDocs / teamLeads) * 100 : 0;

  const teamStatus = LEAD_STATUSES_ADMIN.map((s) => ({
    label: LEAD_STATUS_LABELS[s],
    value: rows.reduce((acc, r) => acc + (r.statusCounts[s] ?? 0), 0),
    color: STATUS_CHART_COLORS[s],
  }));

  const installCounts: Record<string, number> = {};
  for (const t of teleproIds) {
    for (const l of docRecusByTelepro[t] || []) {
      const key = l.installation_type || "non_renseigne";
      installCounts[key] = (installCounts[key] || 0) + 1;
    }
  }
  const teamInstall = [
    ...INSTALLATION_TYPES.map((t) => ({
      label: INSTALLATION_TYPE_LABELS[t],
      value: installCounts[t] ?? 0,
      color: INSTALLATION_CHART_COLORS[t],
    })),
    { label: "Non renseigné", value: installCounts["non_renseigne"] ?? 0, color: "#9ca3af" },
  ];

  const fmtPct = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistique télépro"
        subtitle="Performance de l'équipe sur la période, sur les leads créés dans cette période."
      />

      <PeriodFilter defaultFrom={defaultFrom} defaultTo={defaultTo} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Appels" value={teamCalls} icon={PhoneCall} tone="brand" hint="Actions enregistrées sur les leads" />
        <StatCard label="Leads de la période" value={teamLeads} icon={Users} tone="neutral" hint={`${rows.length} télépro${rows.length > 1 ? "s" : ""} actif${rows.length > 1 ? "s" : ""}`} />
        <StatCard label="Documents reçus" value={teamDocs} icon={FileCheck} tone="success" />
        <StatCard label="Taux de conversion" value={fmtPct(teamConversion)} icon={Percent} tone="warning" hint="Documents reçus / leads" />
      </div>

      <Panel
        title="Classement des télépros"
        description="Trié par documents reçus. Cliquez sur une ligne pour le détail."
        bodyClassName="p-0 pt-3"
      >
        {rows.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-subtle">Aucun télépro actif</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y border-line-soft bg-panel text-left text-xs font-medium text-subtle">
                  <th className="w-10 px-5 py-2.5">#</th>
                  <th className="px-3 py-2.5">Télépro</th>
                  <th className="px-3 py-2.5 text-right">Appels</th>
                  <th className="px-3 py-2.5 text-right">Leads</th>
                  <th className="px-3 py-2.5 text-right">Docs reçus</th>
                  <th className="px-3 py-2.5 text-right">Conversion</th>
                  <th className="w-[28%] px-3 py-2.5">Répartition des statuts</th>
                  <th className="w-8 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const href = `/admin/stats-telepro/${r.id}${periodQuery ? `?${periodQuery}` : ""}`;
                  return (
                    <tr key={r.id} className="group border-b border-line-soft last:border-0 hover:bg-panel">
                      <td className="px-5 py-3 text-xs font-semibold tabular-nums text-faint">{i + 1}</td>
                      <td className="px-3 py-3">
                        <Link href={href} className="flex items-center gap-3 focus-visible:outline-none">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
                            {initials(r.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink group-hover:text-brand">{r.name}</span>
                            <span className="block truncate text-xs text-subtle">{r.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink">{r.calls}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink">{r.total}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">{r.docs}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink">{fmtPct(r.conversion)}</td>
                      <td className="px-3 py-3">
                        <StackedBar
                          segments={LEAD_STATUSES_ADMIN.map((s) => ({
                            label: LEAD_STATUS_LABELS[s],
                            value: r.statusCounts[s] ?? 0,
                            color: STATUS_CHART_COLORS[s],
                          }))}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Link href={href} aria-label={`Détail de ${r.name}`}>
                          <ChevronRight className="h-4 w-4 text-faint group-hover:text-brand" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Statuts des leads" description="Toute l'équipe, leads créés sur la période">
          <BarList items={teamStatus} hideZero emptyLabel="Aucun lead sur la période" />
        </Panel>
        <Panel title="Types d'installation" description="Dossiers en « Documents reçus »">
          <BarList items={teamInstall} hideZero emptyLabel="Aucun document reçu sur la période" />
        </Panel>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
