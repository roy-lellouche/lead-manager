import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import { getSessionProfile, getSessionUser } from "@/lib/supabase/session";
import { FinancialSettingsClient } from "./FinancialSettingsClient";

export default async function FinancialSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const role = normalizeRole((await getSessionProfile(user.id))?.role);
  if (role !== "admin") redirect(roleLandingPath(role));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Paramètres financiers"
        subtitle="Coûts standards (avec TVA par poste), barèmes CEE, sélection automatique par ETAS et seuils d’alerte. Les nouveaux chantiers appliquent ces valeurs automatiquement ; les chantiers existants conservent les coûts figés lors de leur calcul."
      />
      <FinancialSettingsClient />
    </div>
  );
}
