import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import { withPhotoUrls } from "@/lib/sav-server";
import type { SavRequest } from "@/lib/sav";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { SavClient } from "./SavClient";

export const dynamic = "force-dynamic";

export default async function AdminSavPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();

  // Les pages /admin lisent en service role : le contrôle de rôle se fait ici.
  const role = normalizeRole(profile?.role);
  if (role !== "admin" && role !== "secretaire" && role !== "stockage") redirect(roleLandingPath(role));

  const { data } = await admin
    .from("sav_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const items = await withPhotoUrls(admin, (data ?? []) as SavRequest[]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SAV"
        subtitle="Demandes de service après-vente, indépendantes des leads. Elles arrivent du formulaire client ou de votre saisie."
      />
      <SavClient initialItems={items} />
    </div>
  );
}
