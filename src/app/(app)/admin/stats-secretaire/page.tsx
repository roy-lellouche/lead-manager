import { createAdminClient } from "@/lib/supabase/admin";
import { FileCheck } from "lucide-react";
import { DELEGATAIRE_GROUPS, INSTALLATION_CHART_COLORS, INSTALLATION_TYPE_LABELS, INSTALLATION_TYPES } from "@/lib/types";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import { Panel } from "@/components/ui-kit/Panel";
import { BarList } from "@/components/ui-kit/BarList";
import { PeriodFilter, DelegataireChips } from "@/components/ui-kit/PeriodFilter";

export default async function StatsSecretairePage({
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

  let docRecusQuery = adminClient
    .from("leads")
    .select("installation_type")
    .in("status", ["documents_recus", "ancien_documents_recus"])
    .gte("updated_at", fromDate.toISOString())
    .lte("updated_at", toDate.toISOString());

  if (selectedDelegataires.length > 0) {
    const orParts = selectedDelegataires.map((d) =>
      d === "__non_assigne__" ? "delegataire_group.is.null" : `delegataire_group.eq.${d}`
    );
    docRecusQuery = docRecusQuery.or(orParts.join(","));
  }

  const { data: docRecusLeads } = await docRecusQuery;

  const leads = docRecusLeads || [];
  const installationTypeCounts = leads.reduce<Record<string, number>>((acc, l) => {
    const key = l.installation_type || "non_renseigne";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const listUrl = `/admin/documents-recus?from=${from}&to=${to}${delegataireUrlPart ? `&${delegataireUrlPart}` : ""}`;
  const year = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiques"
        subtitle="Dossiers en « Documents reçus » par type d'installation. Cliquez pour ouvrir la liste."
      />

      <PeriodFilter defaultFrom={`${year}-01-01`} defaultTo={`${year}-12-31`}>
        <DelegataireChips
          options={[
            ...DELEGATAIRE_GROUPS.map((d) => ({ value: d, label: d })),
            { value: "__non_assigne__", label: "Non assigné" },
          ]}
        />
      </PeriodFilter>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StatCard
          label="Documents reçus"
          value={leads.length}
          icon={FileCheck}
          tone="success"
          size="lg"
          href={listUrl}
          hint="Dossiers mis à jour sur la période"
        />
        <Panel title="Types d'installation" className="lg:col-span-2">
          <BarList
            items={[
              ...INSTALLATION_TYPES.map((type) => ({
                label: INSTALLATION_TYPE_LABELS[type],
                value: installationTypeCounts[type] ?? 0,
                color: INSTALLATION_CHART_COLORS[type],
                href: listUrl,
              })),
              {
                label: "Non renseigné",
                value: installationTypeCounts["non_renseigne"] ?? 0,
                color: "#9ca3af",
                href: listUrl,
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
