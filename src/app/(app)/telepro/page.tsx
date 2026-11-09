import { createAdminClient } from "@/lib/supabase/admin";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";
import Link from "next/link";
import { ArrowRight, CalendarClock, Inbox, PhoneCall, PhoneMissed, Sparkles, Users } from "lucide-react";
import { LEAD_STATUS_LABELS, LEAD_STATUSES_ADMIN, STATUS_CHART_COLORS, type LeadStatus } from "@/lib/types";
import { NrpCallsButton } from "./NrpCallsButton";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import { Panel } from "@/components/ui-kit/Panel";
import { BarList } from "@/components/ui-kit/BarList";
import { getSessionUser } from "@/lib/supabase/session";

export default async function TeleproDashboard() {
  const user = await getSessionUser();
  if (!user) return null;

  const adminClient = createAdminClient();

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const { count: total } = await adminClient
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", user.id);

  // « Reçus » = date à laquelle le lead a été attribué au télépro (telepro_added_at),
  // ce qui inclut les leads redistribués le jour même.
  const { count: today } = await adminClient
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", user.id)
    .gte("telepro_added_at", todayStart.toISOString());

  const { count: week } = await adminClient
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", user.id)
    .gte("telepro_added_at", weekStart.toISOString());

  const { count: month } = await adminClient
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", user.id)
    .gte("telepro_added_at", monthStart.toISOString());

  const { data: byStatus } = await adminClient
    .from("leads")
    .select("status")
    .eq("assigned_to", user.id);

  const statusCounts = (byStatus || []).reduce(
    (acc, l) => {
      acc[l.status as LeadStatus] = (acc[l.status as LeadStatus] || 0) + 1;
      return acc;
    },
    {} as Record<LeadStatus, number>
  );

  const documentsRecus =
    (statusCounts.documents_recus || 0) +
    (statusCounts.ancien_documents_recus || 0);
  const conversionRate =
    (total || 0) > 0
      ? ((documentsRecus / (total || 1)) * 100).toFixed(1)
      : "0";

  const rate = Number(conversionRate);

  const todo = [
    { status: "a_rappeler" as LeadStatus, label: "À rappeler", icon: CalendarClock, tone: "text-ruby bg-ruby-soft" },
    { status: "nouveau" as LeadStatus, label: "Nouveaux", icon: Sparkles, tone: "text-brand bg-brand-soft" },
    { status: "nrp" as LeadStatus, label: "NRP à relancer", icon: PhoneMissed, tone: "text-gold bg-gold-soft" },
    { status: "en_attente_doc" as LeadStatus, label: "En attente de documents", icon: Inbox, tone: "text-amethyst bg-amethyst-soft" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord"
        subtitle="Vos leads et vos priorités du jour"
        actions={
          <>
            <Link
              href="/telepro/leads"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-sm font-medium text-ink shadow-card transition-colors hover:bg-panel"
            >
              <Users className="h-4 w-4" /> Mes leads
            </Link>
            <Link
              href="/telepro/teleprospection"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-white shadow-card transition-colors hover:bg-ink-soft"
            >
              <PhoneCall className="h-4 w-4" /> Démarrer la téléprospection
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Reçus aujourd'hui" value={today || 0} tone="brand" size="lg" />
        <StatCard label="Reçus cette semaine" value={week || 0} tone="success" />
        <StatCard label="Reçus ce mois" value={month || 0} tone="amethyst" />
        <StatCard label="Leads au total" value={total || 0} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="À traiter" description="Cliquez pour ouvrir la liste" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {todo.map((t) => (
              <Link
                key={t.status}
                href={`/telepro/leads?status=${t.status}`}
                className="group flex items-center gap-3 rounded-xl border border-line p-3 transition-all hover:border-brand-line hover:shadow-card"
              >
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.tone}`}>
                  <t.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-subtle">{t.label}</span>
                  <span className="block text-xl font-bold tabular-nums text-ink">{statusCounts[t.status] || 0}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-faint transition-colors group-hover:text-brand" />
              </Link>
            ))}
          </div>
          <div className="mt-4 border-t border-line-soft pt-4">
            <NrpCallsButton />
          </div>
        </Panel>

        <Panel title="Taux de conversion" description="Documents reçus (y compris anciens) / total">
          <p className="text-4xl font-bold tracking-tight tabular-nums text-emerald">
            {conversionRate.replace(".", ",")} %
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line-soft">
            <div className="h-full rounded-full bg-emerald" style={{ width: `${Math.min(100, rate)}%` }} />
          </div>
          <p className="mt-3 text-sm text-subtle">
            {documentsRecus} dossier{documentsRecus > 1 ? "s" : ""} sur {total || 0} lead{(total || 0) > 1 ? "s" : ""}
          </p>
        </Panel>
      </div>

      <Panel title="Mes leads par statut">
        <BarList
          hideZero
          emptyLabel="Aucun lead pour le moment"
          items={LEAD_STATUSES_ADMIN.map((st) => ({
            label: LEAD_STATUS_LABELS[st],
            value: statusCounts[st] || 0,
            color: STATUS_CHART_COLORS[st],
            href: `/telepro/leads?status=${st}`,
          }))}
        />
      </Panel>
    </div>
  );
}
