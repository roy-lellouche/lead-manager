import { createAdminClient } from "@/lib/supabase/admin";
import { CHANTIER_STATUS_FIELDS, DELEGATAIRE_GROUPS, INSTALLATION_TYPE_LABELS, INSTALLATION_TYPES, LEAD_STATUS_LABELS, LEAD_STATUSES_ADMIN, type LeadStatus } from "@/lib/types";
import { Banknote, Coins, Hammer, TrendingUp } from "lucide-react";
import { STATUS_CHART_COLORS, INSTALLATION_CHART_COLORS } from "@/lib/types";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import { Panel, SectionTitle } from "@/components/ui-kit/Panel";
import { BarList } from "@/components/ui-kit/BarList";
import { PeriodFilter, DelegataireChips } from "@/components/ui-kit/PeriodFilter";
import { summarize, type DossierRow } from "@/lib/dossiers";

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
    .select("status, delegataire_group, installation_type, is_installe, is_depot_mpr, is_cee_paye, is_mpe_paye, is_code_envoye, is_depose, is_controle_veritas, is_paye, is_compte_bloque, is_rejete, installateur, pac_model_id, cee_zone, postal_code, surface_m2, color, benefit_cee, benefit_mpr, installation_cost, material_cost, regie_cost, dossier_cost")
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
  // Finances : même calcul que le suivi des dossiers installés (montants de la fiche client).
  const fin = summarize(leads as unknown as DossierRow[]);
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

      <SectionTitle hint="Dossiers installés sur la période : Prime CEE + MPR − installation − matériel − régie − frais de dossier">Finances</SectionTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Rentabilité totale" value={eur(fin.margin)} icon={TrendingUp} tone={fin.margin < 0 ? "danger" : "success"} size="lg" href="/admin/dossiers-installes" hint={`${eur(fin.avgMargin)} en moyenne par dossier complet`} />
        <StatCard label="Primes (CEE + MPR)" value={eur(fin.revenue)} icon={Coins} tone="brand" size="lg" href="/admin/dossiers-installes" />
        <StatCard label="Coûts" value={eur(fin.cost)} icon={Banknote} tone="danger" size="lg" href="/admin/dossiers-installes" hint="Installation, matériel, régie, frais de dossier" />
        <StatCard label="Dossiers installés" value={count} icon={Hammer} tone="amethyst" size="lg" href="/admin/dossiers-installes" hint={`${fin.complete} complets · ${fin.incomplete} à compléter`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Primes restant à encaisser" value={eur(fin.toCollect)} href="/admin/dossiers-installes" />
        <StatCard label="Primes encaissées" value={eur(fin.collected)} href="/admin/dossiers-installes" hint="Dossiers à l'étape « Payé »" />
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
