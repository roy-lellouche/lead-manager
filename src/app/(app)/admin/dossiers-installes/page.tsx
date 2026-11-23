import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, getSessionUser } from "@/lib/supabase/session";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import type { DossierRow } from "@/lib/dossiers";
import { DossiersClient } from "./DossiersClient";

export const dynamic = "force-dynamic";

const LEAD_COLUMNS = [
  "id", "first_name", "last_name", "city", "postal_code", "installateur", "delegataire_group",
  "installation_type", "category", "status_changed_at", "chantier_comment",
  "benefit_cee", "benefit_mpr", "installation_cost", "material_cost", "regie_cost",
  "is_depose", "is_controle_veritas", "is_paye", "is_cee_paye", "is_compte_bloque", "is_rejete",
].join(", ");

export default async function DossiersInstallesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const role = normalizeRole((await getSessionProfile(user.id))?.role);
  if (role !== "admin") redirect(roleLandingPath(role));

  const admin = createAdminClient();
  const [{ data: leads, error }, { data: invoices }] = await Promise.all([
    admin
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("status", "installe")
      .order("status_changed_at", { ascending: false, nullsFirst: false })
      .limit(2000),
    admin
      .from("supplier_invoices")
      .select("lead_id, amount_ht, amount_ttc")
      .not("lead_id", "is", null)
      .limit(5000),
  ]);

  const invByLead = new Map<string, { ht: number; count: number }>();
  for (const inv of invoices || []) {
    const k = String(inv.lead_id);
    const cur = invByLead.get(k) || { ht: 0, count: 0 };
    cur.ht += Number(inv.amount_ht ?? inv.amount_ttc ?? 0);
    cur.count += 1;
    invByLead.set(k, cur);
  }

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const rows: DossierRow[] = ((leads || []) as unknown as Record<string, unknown>[]).map((l) => {
    const inv = invByLead.get(String(l.id));
    return {
      id: String(l.id),
      first_name: (l.first_name as string) ?? null,
      last_name: (l.last_name as string) ?? null,
      city: (l.city as string) ?? null,
      postal_code: (l.postal_code as string) ?? null,
      installateur: (l.installateur as string) ?? null,
      delegataire_group: (l.delegataire_group as string) ?? null,
      installation_type: (l.installation_type as string) ?? null,
      category: (l.category as string) ?? null,
      installed_at: (l.status_changed_at as string) ?? null,
      chantier_comment: (l.chantier_comment as string) ?? null,
      benefit_cee: num(l.benefit_cee),
      benefit_mpr: num(l.benefit_mpr),
      installation_cost: num(l.installation_cost),
      material_cost: num(l.material_cost),
      regie_cost: num(l.regie_cost),
      is_depose: !!l.is_depose,
      is_controle_veritas: !!l.is_controle_veritas,
      is_paye: !!l.is_paye,
      is_cee_paye: !!l.is_cee_paye,
      is_compte_bloque: !!l.is_compte_bloque,
      is_rejete: !!l.is_rejete,
      supplier_invoices_ht: Math.round((inv?.ht ?? 0) * 100) / 100,
      supplier_invoices_count: inv?.count ?? 0,
    };
  });

  return (
    <>
      {error && <p className="text-sm text-ruby">Erreur de chargement : {error.message}</p>}
      <DossiersClient initialRows={rows} />
    </>
  );
}
