import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import { EQUIPE_ROLES, listStockProducts } from "@/lib/equipe-server";
import { addDays, mondayOf, toIsoDate, type TeamInstallation } from "@/lib/equipe";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { EquipeClient } from "./EquipeClient";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();

  // Les pages /admin lisent en service role : le contrôle de rôle se fait ici.
  const role = normalizeRole(profile?.role);
  if (!role || !(EQUIPE_ROLES as readonly string[]).includes(role)) redirect(roleLandingPath(role));

  // Semaine en cours (heure de Paris côté serveur ≈ heure locale ; le client
  // recharge de toute façon la semaine affichée).
  const monday = mondayOf(new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })));
  const from = toIsoDate(monday);
  const to = toIsoDate(addDays(monday, 6));

  const [{ data }, products] = await Promise.all([
    admin
      .from("team_installations")
      .select("*")
      .gte("install_date", from)
      .lte("install_date", to)
      .order("install_date")
      .order("created_at"),
    listStockProducts(admin),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Équipe"
        subtitle="Planning hebdomadaire des équipes de pose. Une pompe à chaleur « prise du stock » est retirée automatiquement du Stockage ; sinon marquez-la « à commander »."
      />
      <EquipeClient
        initialWeekStart={from}
        initialItems={(data ?? []) as TeamInstallation[]}
        initialProducts={products}
      />
    </div>
  );
}
