import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { parsePacModelInput } from "@/lib/dossiers";

const PAC_COLUMNS = "id, name, active, cee_h1, cee_h2, cee_h3, cost_items";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const parsed = parsePacModelInput(await request.json().catch(() => ({})), false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await auth.admin
    .from("pac_models")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(PAC_COLUMNS)
    .single();
  if (error) {
    const msg = error.code === "23505" ? "Ce modèle existe déjà" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  // Les dossiers qui portaient ce modèle le perdent (ON DELETE SET NULL) ; leur prime CEE est conservée.
  const { error } = await auth.admin.from("pac_models").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
