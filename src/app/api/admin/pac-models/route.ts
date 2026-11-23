import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { parsePacModelInput } from "@/lib/dossiers";

const PAC_COLUMNS = "id, name, active, etas_band, cee_mode, cee_h1, cee_h2, cee_h3, cost_items";

/** Grille « modèle de PAC → prime CEE ». */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from("pac_models").select(PAC_COLUMNS).order("display_order").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || [], { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = parsePacModelInput(await request.json().catch(() => ({})), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await auth.admin
    .from("pac_models")
    .insert(parsed.values)
    .select(PAC_COLUMNS)
    .single();
  if (error) {
    const msg = error.code === "23505" ? "Ce modèle existe déjà" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(data);
}
