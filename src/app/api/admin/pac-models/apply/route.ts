import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { computeProfitability, MONEY_FIELDS } from "@/lib/dossiers";

/**
 * Applique la grille aux dossiers installés qui ont un modèle de PAC mais
 * aucune prime CEE saisie. Les primes déjà saisies ne sont jamais écrasées.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const [{ data: models }, { data: leads, error }] = await Promise.all([
    admin.from("pac_models").select("id, name, cee_amount"),
    admin
      .from("leads")
      .select(`id, pac_model_id, ${MONEY_FIELDS.join(", ")}`)
      .eq("status", "installe")
      .not("pac_model_id", "is", null)
      .is("benefit_cee", null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const amountByModel = new Map((models || []).map((m) => [m.id as string, m]));
  const now = new Date().toISOString();
  const updated: { id: string; benefit_cee: number; profitability: number }[] = [];
  for (const l of (leads || []) as unknown as Record<string, unknown>[]) {
    const model = amountByModel.get(String(l.pac_model_id));
    if (!model || model.cee_amount === null) continue;
    const cee = Number(model.cee_amount);
    const profitability = computeProfitability({ ...l, benefit_cee: cee });
    const { error: upErr } = await admin
      .from("leads")
      .update({ benefit_cee: cee, profitability, updated_at: now })
      .eq("id", String(l.id));
    if (upErr) return NextResponse.json({ error: upErr.message, updated }, { status: 500 });
    await admin.from("lead_logs").insert({
      lead_id: String(l.id),
      user_id: auth.userId,
      action: `Prime CEE ${cee} € appliquée d'après la PAC « ${model.name} »`,
    });
    updated.push({ id: String(l.id), benefit_cee: cee, profitability });
  }
  return NextResponse.json({ updated });
}
