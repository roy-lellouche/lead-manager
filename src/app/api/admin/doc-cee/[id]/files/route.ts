import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CEE_DOC_MAX_FILE_BYTES,
  CEE_DOC_MAX_FILES,
  CEE_DOCS_BUCKET,
  type CeeDocRequest,
} from "@/lib/doc-cee";
import {
  canAccessRequest,
  extractFiles,
  requireCeeDocStaff,
  uploadCeeDocFiles,
  withCeeDocUrls,
} from "@/lib/doc-cee-server";

export const maxDuration = 60;

/** Dépôt de documents (PDF, images ou autres) : la demande passe au vert. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireCeeDocStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { data: existing } = await admin
    .from("cee_doc_requests")
    .select("files, completed_at, assigned_to")
    .eq("id", id)
    .single();
  if (!existing || !canAccessRequest(auth, existing)) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const files = formData ? extractFiles(formData) : [];
  if (!files.length) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  const current = (existing.files ?? []) as CeeDocRequest["files"];
  if (current.length + files.length > CEE_DOC_MAX_FILES)
    return NextResponse.json({ error: `Maximum ${CEE_DOC_MAX_FILES} fichiers par demande.` }, { status: 400 });
  if (files.some((f) => f.size > CEE_DOC_MAX_FILE_BYTES))
    return NextResponse.json({ error: "Un fichier dépasse 25 Mo." }, { status: 400 });

  const { stored, error: uploadError } = await uploadCeeDocFiles(admin, id, files);
  if (uploadError) return NextResponse.json({ error: "Échec de l'envoi des fichiers." }, { status: 500 });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("cee_doc_requests")
    .update({ files: [...current, ...stored], completed_at: existing.completed_at ?? now, updated_at: now })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    await admin.storage.from(CEE_DOCS_BUCKET).remove(stored.map((f) => f.path));
    return NextResponse.json({ error: "Impossible d'enregistrer les fichiers." }, { status: 500 });
  }

  const [row] = await withCeeDocUrls(admin, [data as CeeDocRequest]);
  return NextResponse.json(row);
}

/** Retire un fichier ; sans fichier restant, la demande redevient rouge. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireCeeDocStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.role === "telepro") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const path = req.nextUrl.searchParams.get("path");
  const { data: existing } = await admin.from("cee_doc_requests").select("files").eq("id", id).single();
  if (!existing || !path) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });

  const current = (existing.files ?? []) as CeeDocRequest["files"];
  if (!current.some((f) => f.path === path)) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  const remaining = current.filter((f) => f.path !== path);

  const { data, error } = await admin
    .from("cee_doc_requests")
    .update({
      files: remaining,
      ...(remaining.length ? {} : { completed_at: null }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  await admin.storage.from(CEE_DOCS_BUCKET).remove([path]);

  const [row] = await withCeeDocUrls(admin, [data as CeeDocRequest]);
  return NextResponse.json(row);
}
