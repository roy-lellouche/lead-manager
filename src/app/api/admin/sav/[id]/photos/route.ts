import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPhotoFiles, requireSavStaff, uploadSavPhotos, validatePhotos, withPhotoUrls } from "@/lib/sav-server";
import { SAV_PHOTOS_BUCKET, type SavRequest } from "@/lib/sav";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireSavStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { data: existing } = await admin.from("sav_requests").select("photos").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "SAV introuvable" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const files = formData ? extractPhotoFiles(formData) : [];
  if (!files.length) return NextResponse.json({ error: "Aucune photo reçue" }, { status: 400 });
  const photoError = validatePhotos(files, (existing.photos ?? []).length);
  if (photoError) return NextResponse.json({ error: photoError }, { status: 400 });

  const { paths, error: uploadError } = await uploadSavPhotos(admin, id, files);
  if (uploadError) return NextResponse.json({ error: "Échec de l'envoi des photos." }, { status: 500 });

  const { data, error } = await admin
    .from("sav_requests")
    .update({ photos: [...(existing.photos ?? []), ...paths], updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    await admin.storage.from(SAV_PHOTOS_BUCKET).remove(paths);
    return NextResponse.json({ error: "Impossible d'enregistrer les photos." }, { status: 500 });
  }

  const [sav] = await withPhotoUrls(admin, [data as SavRequest]);
  return NextResponse.json(sav);
}
