import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CEE_DOCS_BUCKET, parseCeeDocPatch, type CeeDocRequest } from "@/lib/doc-cee";
import { canAccessRequest, isValidTeleproId, requireCeeDocStaff, withCeeDocUrls } from "@/lib/doc-cee-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireCeeDocStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { data: existing } = await admin.from("cee_doc_requests").select("assigned_to").eq("id", id).single();
  if (!existing || !canAccessRequest(auth, existing))
    return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

  const parsed = parseCeeDocPatch(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  let patch = parsed.value;
  // Le télépro ne peut écrire que son propre commentaire.
  if (auth.role === "telepro") {
    patch = "telepro_comment" in patch ? { telepro_comment: patch.telepro_comment } : {};
  }
  if (patch.assigned_to && !(await isValidTeleproId(admin, patch.assigned_to)))
    return NextResponse.json({ error: "Télépro introuvable." }, { status: 400 });

  const { data, error } = await admin
    .from("cee_doc_requests")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

  const [row] = await withCeeDocUrls(admin, [data as CeeDocRequest]);
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireCeeDocStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.role === "telepro") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const { data: existing } = await admin.from("cee_doc_requests").select("files").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

  const { error } = await admin.from("cee_doc_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });

  const paths = ((existing.files ?? []) as CeeDocRequest["files"]).map((f) => f.path);
  if (paths.length) await admin.storage.from(CEE_DOCS_BUCKET).remove(paths);
  return NextResponse.json({ success: true });
}
