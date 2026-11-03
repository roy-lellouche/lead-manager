import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSavStaff, withPhotoUrls } from "@/lib/sav-server";
import { isSavStatus, type SavRequest } from "@/lib/sav";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireSavStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!isSavStatus(body.status)) return NextResponse.json({ error: "Statut invalide" }, { status: 400 });

  let rescheduledAt: string | null = null;
  if (body.status === "a_reprogrammer") {
    const date = new Date(body.rescheduled_at);
    if (!body.rescheduled_at || Number.isNaN(date.getTime()))
      return NextResponse.json({ error: "Date et heure de reprogrammation requises" }, { status: 400 });
    rescheduledAt = date.toISOString();
  }

  const { data, error } = await admin
    .from("sav_requests")
    .update({ status: body.status, rescheduled_at: rescheduledAt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: "SAV introuvable" }, { status: 404 });

  const [sav] = await withPhotoUrls(admin, [data as SavRequest]);
  return NextResponse.json(sav);
}
