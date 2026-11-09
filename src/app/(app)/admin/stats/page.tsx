import { createAdminClient } from "@/lib/supabase/admin";
import { CHANTIER_STATUS_FIELDS, DELEGATAIRE_GROUPS, INSTALLATION_TYPE_LABELS, INSTALLATION_TYPES, LEAD_STATUS_LABELS, LEAD_STATUSES_ADMIN, type LeadStatus } from "@/lib/types";
import { Banknote, Coins, Hammer, TrendingUp } from "lucide-react";
import { STATUS_CHART_COLORS, INSTALLATION_CHART_COLORS } from "@/lib/types";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import { Panel, SectionTitle } from "@/components/ui-kit/Panel";
import { BarList } from "@/components/ui-kit/BarList";
import { PeriodFilter, DelegataireChips } from "@/components/ui-kit/PeriodFilter";

const STATUSES: LeadStatus[] = LEAD_STATUSES_ADMIN;


export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; delegataire?: string | string[] }>;
}) {
  const adminClient = createAdminClient();
  const params = await searchParams;
  const from = params.from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = params.to || `${new Date().getFullYear()}-12-31`;
  const delegataireParam = params.delegataire;
  const selectedDelegataires = Array.isArray(delegataireParam)
    ? delegataireParam
    : delegataireParam
      ? [delegataireParam]
      : [];

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const delegataireUrlPart = selectedDelegataires.length > 0
    ? selectedDelegataires.map((d) => `delegataire=${encodeURIComponent(d)}`).join("&")
    : "";
  const baseInstalleUrl = `/admin/leads?status=installe&from=${from}&to=${to}${delegataireUrlPart ? `&${delegataireUrlPart}` : ""}`;
  const baseLeadsUrl = `/admin/leads?from=${from}&to=${to}${delegataireUrlPart ? `&${delegataireUrlPart}` : ""}`;

  let docRecusQuery = adminClient
    .from("leads")
    .select("status, delegataire_group, installation_type, is_installe, is_depot_mpr, is_cee_paye, is_mpe_paye, is_code_envoye, is_depose, is_controle_veritas, is_paye, is_compte_bloque, is_rejete, lead_financials(method_id, calc_status, gross_margin, revenue, total_cost, cee_forecast, cee_received)")
    .eq("status", "installe")
    .gte("updated_at", fromDate.toISOString())
    .lte("updated_at", toDate.toISOString());

  let allLeadsQuery = adminClient
    .from("leads")
    .select("status, installation_type")
    .gte("updated_at", fromDate.toISOString())
    .lte("updated_at", toDate.toISOString());

  if (selectedDelegataires.length > 0) {
    const orParts = selectedDelegataires.map((d) =>
      d === "__non_assigne__" ? "delegataire_group.is.null" : `delegataire_group.eq.${d}`
    );
    docRecusQuery = docRecusQuery.or(orParts.join(","));
    allLeadsQuery = allLeadsQuery.or(orParts.join(","));
  }

  const [
    { data: docRecusLeads },
    { data: allLeadsByStatus },
  ] = await Promise.all([
    docRecusQuery,
    allLeadsQuery,
  ]);

  const leads = docRecusLeads || [];
  const leadsDocRecusOnly = leads;
  // Finances : uniquement le calcul automatique des méthodes économiques (méthodes 1, 2, 3).
  // Les anciens montants saisis à la main restent sur les fiches mais ne sont plus comptés.
  type Fin = { method_id: string | null; calc_status: string; gross_margin: number | null; revenue: number | null; total_cost: number | null; cee_forecast: number | null; cee_received: number | null };
  const finOf = (l: Record<string, unknown>): Fin | null => {
    const f = l.lead_financials as Fin | Fin[] | null | undefined;
    return (Array.isArray(f) ? f[0] : f) ?? null;
  };
  const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);
  const fins = leads.map((l) => finOf(l as Record<string, unknown>));
  const withMethod = fins.filter((f) => f?.method_id);
  const computed = withMethod.filter((f) => f!.calc_status === "calcule" && f!.gross_margin !== null) as Fin[];
  const sum = (list: Fin[], k: keyof Fin) => list.reduce((s, f) => s + cents(f[k]), 0) / 100;
  const totalMargin = sum(computed, "gross_margin");
  const totalRevenue = sum(computed, "revenue");
  const totalCosts = sum(computed, "total_cost");
  const totalCeeForecast = sum(computed, "cee_forecast");
  const totalCeeReceived = sum(withMethod as Fin[], "cee_received");
  const withoutMethod = leads.length - withMethod.length;
  const pendingCalc = withMethod.length - computed.length;
  const avgMargin = computed.length > 0 ? totalMargin / computed.length : 0;
  const count = leads.length;

  const delegataireCounts = leads.reduce<Record<string, number>>((acc, l) => {
    const key = l.delegataire_group || "Non assigné";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const statusCounts = (allLeadsByStatus || []).reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  const installationTypeCounts = (docRecusLeads || []).reduce<Record<string, number>>((acc, l) => {
    const key = l.installation_type || "non_renseigne";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const chantierCounts = CHANTIER_STATUS_FIELDS.reduce<Record<string, number>>((acc, { field }) => {
    acc[field] = leads.filter((l) => !!(l as Record<string, unknown>)[field]).length;
    return acc;
  }, {});

  const totalLeads = (allLeadsByStatus || []).length;

  const eur = (n: number) =>
    n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const defaultFrom = `${new Date().getFullYear()}-01-01`;
  const defaultTo = `${new Date().getFullYear()}-12-31`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiques"
        subtitle="Résultats financiers et avancement des dossiers. Chaque chiffre ouvre la liste des dossiers concernés."
      />

      <PeriodFilter defaultFrom={defaultFrom} defaultTo={defaultTo}>
        <DelegataireChips
          options={[
            ...DELEGATAIRE_GROUPS.map((d) => ({ value: d, label: d })),
            { value: "__non_assigne__", label: "Non assigné" },
          ]}
        />
      </PeriodFilter>

      <SectionTitle hint="Dossiers installés sur la période, calcul automatique par méthode (1, 2, 3)">Finances</SectionTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Marge brute prévisionnelle" value={eur(totalMargin)} icon={TrendingUp} tone="success" size="lg" href="/admin/rentabilite" hint={`${eur(avgMargin)} en moyenne par chantier calculé`} />
        <StatCard label="Chiffre d'affaires prévisionnel" value={eur(totalRevenue)} icon={Coins} tone="brand" size="lg" href="/admin/rentabilite" hint="Prime CEE HT + reste à charge" />
        <StatCard label="Coût de revient" value={eur(totalCosts)} icon={Banknote} tone="danger" size="lg" href="/admin/rentabilite" hint="Coûts standards des méthodes, TVA récupérable déduite" />
        <StatCard label="Dossiers installés" value={count} icon={Hammer} tone="amethyst" size="lg" href={baseInstalleUrl} hint={`${computed.length} calculés · ${pendingCalc} en attente`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Prime CEE prévisionnelle" value={eur(totalCeeForecast)} href="/admin/rentabilite" />
        <StatCard label="Prime CEE encaissée" value={eur(totalCeeReceived)} href="/admin/rentabilite" />
        <StatCard label="Installés sans méthode" value={withoutMethod} href={baseInstalleUrl} hint="À attribuer : méthode 1, 2 ou 3 sur la fiche" />
      </div>

      {selectedDelegataires.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Filtre actif : <strong>{selectedDelegataires.map((d) => (d === "__non_assigne__" ? "Non assigné" : d)).join(", ")}</strong>
        </p>
      )}

      <SectionTitle>Dossiers</SectionTitle>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Types d'installation" description="Dossiers installés">
          <BarList
            items={[
              ...INSTALLATION_TYPES.map((type) => ({
                label: INSTALLATION_TYPE_LABELS[type],
                value: installationTypeCounts[type] ?? 0,
                color: INSTALLATION_CHART_COLORS[type],
                href: `${baseInstalleUrl}&installation_type=${encodeURIComponent(type)}`,
              })),
              {
                label: "Non renseigné",
                value: installationTypeCounts["non_renseigne"] ?? 0,
                color: "#9ca3af",
                href: `${baseInstalleUrl}&installation_type=non_renseigne`,
              },
            ]}
          />
        </Panel>

        <Panel title="Par mandataire" description="Dossiers installés">
          <BarList
            items={[
              ...DELEGATAIRE_GROUPS.map((d) => ({
                label: d,
                value: delegataireCounts[d] ?? 0,
                href: `/admin/leads?status=installe&delegataire=${encodeURIComponent(d)}&from=${from}&to=${to}`,
              })),
              {
                label: "Non assigné",
                value: delegataireCounts["Non assigné"] ?? 0,
                color: "#9ca3af",
                href: `/admin/leads?status=installe&delegataire=__non_assigne__&from=${from}&to=${to}`,
              },
            ]}
          />
        </Panel>

        <Panel title="Avancement des chantiers" description="Part des dossiers installés ayant chaque étape (cumulable)">
          <BarList
            sort={false}
            total={count}
            defaultColor="#0ABAB5"
            items={CHANTIER_STATUS_FIELDS.map(({ field, label }) => ({
              label,
              value: chantierCounts[field] ?? 0,
              href: `/admin/leads?status=installe&chantier=${field}&from=${from}&to=${to}`,
            }))}
          />
        </Panel>

        <Panel title="Leads par statut" description={`${totalLeads} leads mis à jour sur la période`}>
          <BarList
            hideZero
            items={STATUSES.map((status) => ({
              label: LEAD_STATUS_LABELS[status],
              value: statusCounts[status] ?? 0,
              color: STATUS_CHART_COLORS[status],
              href: `${baseLeadsUrl}&status=${status}`,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
