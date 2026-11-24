import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import { withCeeDocUrls } from "@/lib/doc-cee-server";
import type { CeeDocRequest } from "@/lib/doc-cee";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { DocCeeClient } from "../../admin/doc-cee/DocCeeClient";

export const dynamic = "force-dynamic";

/** DOC CEE côté télépro : uniquement les demandes qui lui sont assignées. */
export default async function TeleproDocCeePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const role = normalizeRole(profile?.role);
  if (role !== "telepro") redirect(roleLandingPath(role));

  const { data } = await admin
    .from("cee_doc_requests")
    .select("*")
    .eq("assigned_to", user.id)
    .order("created_at", { ascending: false });
  const items = await withCeeDocUrls(admin, (data ?? []) as CeeDocRequest[]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="DOC CEE"
        subtitle="Documents à récupérer auprès de vos clients. Rouge : à récupérer — orange : document déposé — vert : dossier complet."
      />
      <DocCeeClient initialItems={items} mode="telepro" viewerRole="telepro" />
    </div>
  );
}
