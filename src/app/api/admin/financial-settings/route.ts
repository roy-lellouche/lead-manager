import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAlertThresholds } from "@/lib/finance/server";
import { requireRole } from "@/lib/finance/auth";
import { parseAmount, parseDate, parseZone } from "@/lib/finance/validation";
import { COST_CATEGORIES, type CostCategory } from "@/lib/finance/engine";

async function buildPayload(admin: SupabaseClient) {
  const [methods, costs, scales, thresholds, history] = await Promise.all([
    admin.from("economic_methods").select("*").order("display_order"),
    admin.from("method_cost_items").select("*").order("display_order"),
    admin.from("cee_scales").select("*").order("scale_year").order("climate_zone"),
    loadAlertThresholds(admin),
    admin
      .from("financial_settings_history")
      .select("*, profile:profiles!changed_by(full_name, email)")
      .order("changed_at", { ascending: false })
      .limit(100),
  ]);
  return {
    methods: methods.data || [],
    costs: costs.data || [],
    scales: scales.data || [],
    thresholds,
    history: history.data || [],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(await buildPayload(auth.admin), { headers: { "Cache-Control": "no-store" } });
}

type Row = Record<string, unknown>;

/** Met à jour une ligne et journalise chaque champ modifié (ancienne → nouvelle valeur). */
async function updateWithHistory(
  admin: SupabaseClient,
  table: string,
  idColumn: string,
  id: string,
  entityLabel: (row: Row) => string,
  patch: Row,
  userId: string
) {
  const { data: before } = await admin.from(table).select("*").eq(idColumn, id).maybeSingle();
  if (!before) throw new Error("Élément introuvable");
  const diff: Row = {};
  for (const [k, v] of Object.entries(patch)) {
    const old = before[k];
    const same = typeof v === "number" ? Number(old) === v : (old ?? null) === (v ?? null);
    if (!same) diff[k] = v;
  }
  if (Object.keys(diff).length === 0) return;
  const now = new Date().toISOString();
  const { error } = await admin.from(table).update({ ...diff, updated_at: now }).eq(idColumn, id);
  if (error) throw new Error(error.message);
  await admin.from("financial_settings_history").insert(
    Object.entries(diff).map(([field, value]) => ({
      entity: table,
      entity_id: id,
      entity_label: entityLabel(before),
      field,
      old_value: before[field] ?? null,
      new_value: value ?? null,
      changed_by: userId,
    }))
  );
}

const ZONE_LABEL = (r: Row) => `Barème ${r.scale_year} ${r.climate_zone} (${r.method_id})`;

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;
  const userId = auth.userId;
  const body = (await request.json().catch(() => ({}))) as Row;
  const str = (v: unknown, label: string, max = 200) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) throw new Error(`${label} obligatoire`);
    if (s.length > max) throw new Error(`${label} trop long`);
    return s;
  };

  try {
    switch (body.action) {
      case "update_cost": {
        const patch: Row = {};
        if (body.label !== undefined) patch.label = str(body.label, "Libellé");
        const amount = parseAmount(body.amount, "Montant");
        if (amount !== undefined && amount !== null) patch.amount = amount;
        if (typeof body.active === "boolean") patch.active = body.active;
        await updateWithHistory(admin, "method_cost_items", "id", String(body.id), (r) => `Coût « ${r.label} »`, patch, userId);
        break;
      }
      case "add_cost": {
        const label = str(body.label, "Libellé");
        const category = String(body.category) as CostCategory;
        if (!COST_CATEGORIES.includes(category)) throw new Error("Catégorie invalide");
        const amount = parseAmount(body.amount, "Montant") ?? 0;
        const methodId = str(body.method_id, "Méthode");
        const code = `${label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}_${Date.now().toString(36)}`;
        const { data: max } = await admin
          .from("method_cost_items").select("display_order").eq("method_id", methodId)
          .order("display_order", { ascending: false }).limit(1).maybeSingle();
        const { data, error } = await admin
          .from("method_cost_items")
          .insert({ method_id: methodId, code, label, category, amount, display_order: (max?.display_order ?? 0) + 1 })
          .select("id").single();
        if (error) throw new Error(error.message);
        await admin.from("financial_settings_history").insert({
          entity: "method_cost_items", entity_id: data.id, entity_label: `Coût « ${label} »`,
          field: "création", old_value: null, new_value: { label, category, amount }, changed_by: userId,
        });
        break;
      }
      case "update_scale": {
        const patch: Row = {};
        const amount = parseAmount(body.amount, "Montant CEE");
        if (amount !== undefined && amount !== null) patch.amount = amount;
        const from = parseDate(body.valid_from, "Début de validité");
        if (from) patch.valid_from = from;
        const to = parseDate(body.valid_to, "Fin de validité");
        if (to !== undefined) patch.valid_to = to;
        if (body.conditions !== undefined) patch.conditions = typeof body.conditions === "string" ? body.conditions.trim() || null : null;
        if (typeof body.validated === "boolean") {
          patch.validated = body.validated;
          patch.validated_at = body.validated ? new Date().toISOString() : null;
          patch.validated_by = body.validated ? userId : null;
        }
        // Toute modification du montant ou des dates remet le barème « à valider ».
        if (("amount" in patch || "valid_from" in patch || "valid_to" in patch) && body.validated === undefined) {
          patch.validated = false;
          patch.validated_at = null;
          patch.validated_by = null;
        }
        await updateWithHistory(admin, "cee_scales", "id", String(body.id), ZONE_LABEL, patch, userId);
        break;
      }
      case "add_scale": {
        const methodId = str(body.method_id, "Méthode");
        const year = Number(body.scale_year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Année invalide");
        const zone = parseZone(body.climate_zone);
        const amount = parseAmount(body.amount, "Montant CEE");
        if (amount === null || amount === undefined) throw new Error("Montant CEE obligatoire");
        const from = parseDate(body.valid_from, "Début de validité");
        if (!from) throw new Error("Début de validité obligatoire");
        const to = parseDate(body.valid_to, "Fin de validité") ?? null;
        const { data, error } = await admin
          .from("cee_scales")
          .insert({ method_id: methodId, scale_year: year, climate_zone: zone, amount, valid_from: from, valid_to: to })
          .select("id").single();
        if (error) throw new Error(error.code === "23505" ? "Ce barème (année + zone) existe déjà" : error.message);
        await admin.from("financial_settings_history").insert({
          entity: "cee_scales", entity_id: data.id, entity_label: `Barème ${year} ${zone} (${methodId})`,
          field: "création", old_value: null, new_value: { amount, valid_from: from, valid_to: to }, changed_by: userId,
        });
        break;
      }
      case "update_thresholds": {
        const red = parseAmount(body.red_below, "Seuil rouge");
        const orange = parseAmount(body.orange_below, "Seuil orange");
        if (red == null || orange == null) throw new Error("Seuils obligatoires");
        if (red > orange) throw new Error("Le seuil rouge doit être inférieur ou égal au seuil orange");
        const old = await loadAlertThresholds(admin);
        const value = { red_below: red, orange_below: orange };
        const { error } = await admin
          .from("financial_settings")
          .upsert({ key: "alert_thresholds", value, updated_at: new Date().toISOString(), updated_by: userId });
        if (error) throw new Error(error.message);
        await admin.from("financial_settings_history").insert({
          entity: "financial_settings", entity_id: "alert_thresholds", entity_label: "Seuils d'alerte de marge",
          field: "value", old_value: old, new_value: value, changed_by: userId,
        });
        break;
      }
      case "update_method": {
        const patch: Row = {};
        if (body.name !== undefined) patch.name = str(body.name, "Nom", 100);
        if (body.description !== undefined) patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
        if (typeof body.is_configured === "boolean") patch.is_configured = body.is_configured;
        if (typeof body.active === "boolean") patch.active = body.active;
        await updateWithHistory(admin, "economic_methods", "id", String(body.id), (r) => `Méthode « ${r.name} »`, patch, userId);
        break;
      }
      default:
        return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  return NextResponse.json(await buildPayload(admin));
}
