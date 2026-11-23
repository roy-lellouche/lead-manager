import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { computeProfitability, modelPatch, MONEY_FIELDS, normalizeBareme, normalizeModel, type PacModel } from "@/lib/dossiers";

/**
 * Applique les fiches PAC aux dossiers installés qui ont un modèle de PAC :
 * seuls les montants VIDES sont remplis (prime CEE du barème Coup de pouce, coûts par rubrique).
 * Un montant déjà saisi n'est jamais écrasé.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const [{ data: models }, { data: setting }, { data: leads, error }] = await Promise.all([
    admin.from("pac_models").select("id, name, active, etas_band, cee_mode, cee_h1, cee_h2, cee_h3, cost_items"),
    admin.from("financial_settings").select("value").eq("key", "cee_cdp_bareme").maybeSingle(),
    admin
      .from("leads")
      .select(`id, pac_model_id, cee_zone, postal_code, surface_m2, color, ${MONEY_FIELDS.join(", ")}`)
      .eq("status", "installe")
      .not("pac_model_id", "is", null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bareme = normalizeBareme(setting?.value);
  const byId = new Map(((models || []) as PacModel[]).map((m) => [m.id, normalizeModel(m)]));
  const now = new Date().toISOString();
  const updated: { id: string; patch: Record<string, number> }[] = [];
  for (const l of (leads || []) as unknown as Record<string, unknown>[]) {
    const model = byId.get(String(l.pac_model_id));
    if (!model) continue;
    const { patch } = modelPatch(model, l, false, bareme);
    if (Object.keys(patch).length === 0) continue;
    const profitability = computeProfitability({ ...l, ...patch });
    const { error: upErr } = await admin
      .from("leads")
      .update({ ...patch, profitability, updated_at: now })
      .eq("id", String(l.id));
    if (upErr) return NextResponse.json({ error: upErr.message, updated }, { status: 500 });
    await admin.from("lead_logs").insert({
      lead_id: String(l.id),
      user_id: auth.userId,
      action: `Montants remplis d'après la fiche PAC « ${model.name} »`,
    });
    updated.push({ id: String(l.id), patch });
  }
  return NextResponse.json({ updated });
}
