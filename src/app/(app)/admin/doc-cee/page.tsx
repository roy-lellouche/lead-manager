import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import { listCeeTelepros, withCeeDocUrls } from "@/lib/doc-cee-server";
import type { CeeDocRequest } from "@/lib/doc-cee";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { DocCeeClient } from "./DocCeeClient";

export const dynamic = "force-dynamic";

export default async function DocCeePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();

  // Les pages /admin lisent en service role : le contrôle de rôle se fait ici.
  const role = normalizeRole(profile?.role);
  if (role !== "admin" && role !== "secretaire" && role !== "cee") redirect(roleLandingPath(role));

  const [{ data }, telepros] = await Promise.all([
    admin.from("cee_doc_requests").select("*").order("created_at", { ascending: false }),
    listCeeTelepros(admin),
  ]);
  const items = await withCeeDocUrls(admin, (data ?? []) as CeeDocRequest[]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="DOC CEE"
        subtitle="Documents demandés par le responsable CEE. Rouge : à fournir — orange : document déposé, à valider — vert : dossier complet."
      />
      <DocCeeClient initialItems={items} telepros={telepros} viewerRole={role} />
    </div>
  );
}
