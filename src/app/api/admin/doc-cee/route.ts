import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCeeDocInput, type CeeDocRequest } from "@/lib/doc-cee";
import { isValidTeleproId, requireCeeDocStaff, withCeeDocUrls } from "@/lib/doc-cee-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireCeeDocStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let query = admin.from("cee_doc_requests").select("*").order("created_at", { ascending: false });
  if (auth.role === "telepro") query = query.eq("assigned_to", auth.userId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await withCeeDocUrls(admin, (data ?? []) as CeeDocRequest[]));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireCeeDocStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.role === "telepro") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const parsed = parseCeeDocInput(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.value.assigned_to && !(await isValidTeleproId(admin, parsed.value.assigned_to)))
    return NextResponse.json({ error: "Télépro introuvable." }, { status: 400 });

  const { data, error } = await admin
    .from("cee_doc_requests")
    .insert({ ...parsed.value, created_by: auth.userId })
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: "Impossible de créer la demande." }, { status: 500 });

  const [row] = await withCeeDocUrls(admin, [data as CeeDocRequest]);
  return NextResponse.json(row);
}
