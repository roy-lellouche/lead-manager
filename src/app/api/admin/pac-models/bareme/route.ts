import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { INCOME_CATEGORIES, normalizeBareme, type IncomeCategory } from "@/lib/dossiers";

/** Prix du MWhc cumac par catégorie de revenus (barème CEE Coup de pouce). */
export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => ({}))) as { price_mwhc?: Record<string, unknown> };
  if (!body.price_mwhc || typeof body.price_mwhc !== "object") return NextResponse.json({ error: "Prix manquants" }, { status: 400 });

  const { data: current } = await auth.admin.from("financial_settings").select("value").eq("key", "cee_cdp_bareme").maybeSingle();
  const bareme = normalizeBareme(current?.value);
  const old = { ...bareme.price_mwhc };
  for (const c of INCOME_CATEGORIES) {
    if (!(c.key in body.price_mwhc)) continue;
    const n = Number(String(body.price_mwhc[c.key]).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 1000) return NextResponse.json({ error: `Prix ${c.key} invalide` }, { status: 400 });
    bareme.price_mwhc[c.key as IncomeCategory] = Math.round(n * 10000) / 10000;
  }
  const now = new Date().toISOString();
  const { error } = await auth.admin
    .from("financial_settings")
    .upsert({ key: "cee_cdp_bareme", value: bareme, updated_at: now, updated_by: auth.userId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auth.admin.from("financial_settings_history").insert({
    entity: "financial_settings", entity_id: "cee_cdp_bareme", entity_label: "Barème CEE Coup de pouce",
    field: "prix du MWhc cumac", old_value: old, new_value: bareme.price_mwhc, changed_by: auth.userId,
  });
  return NextResponse.json(bareme);
}
