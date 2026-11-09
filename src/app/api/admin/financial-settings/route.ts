import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAlertThresholds, recalculateLeadFinancials } from "@/lib/finance/server";
import { requireRole } from "@/lib/finance/auth";
import { parseAmount, parseDate, parseZone } from "@/lib/finance/validation";
import { COST_CATEGORIES, type CostCategory } from "@/lib/finance/engine";

async function buildPayload(admin: SupabaseClient) {
  const [methods, costs, scales, thresholds, history, products] = await Promise.all([
    admin.from("economic_methods").select("*").order("display_order"),
    admin.from("method_cost_items").select("*").order("display_order"),
    admin.from("cee_scales").select("*").order("scale_year").order("climate_zone"),
    loadAlertThresholds(admin),
    admin
      .from("financial_settings_history")
      .select("*, profile:profiles!changed_by(full_name, email)")
      .order("changed_at", { ascending: false })
      .limit(100),
    admin
      .from("products")
      .select("id, name, price, is_pac_atlantic, etas, etas_validated, product_types(name)")
      .order("name"),
  ]);
  return {
    methods: methods.data || [],
    costs: costs.data || [],
    scales: scales.data || [],
    thresholds,
    history: history.data || [],
    products: products.data || [],
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
    const same =
      typeof v === "number"
        ? old !== null && old !== undefined && Number(old) === v
        : typeof v === "object" && v !== null
          ? JSON.stringify(old) === JSON.stringify(v)
          : (old ?? null) === (v ?? null);
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

/** Pourcentage 0–100 optionnel (undefined = non fourni, null autorisé si nullable). */
function parsePercent(v: unknown, label: string, nullable = false): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") {
    if (nullable) return null;
    throw new Error(`${label} obligatoire`);
  }
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${label} : valeur entre 0 et 100 attendue`);
  return Math.round(n * 100) / 100;
}

function parseBasis(v: unknown): "HT" | "TTC" | undefined {
  if (v === undefined) return undefined;
  if (v === "HT" || v === "TTC") return v;
  throw new Error("Base invalide (HT ou TTC)");
}

/** Champs TVA communs aux postes de coût. */
function vatPatch(body: Row): Row {
  const patch: Row = {};
  const basis = parseBasis(body.amount_basis);
  if (basis) patch.amount_basis = basis;
  const rate = parsePercent(body.vat_rate, "Taux de TVA", true);
  if (rate !== undefined) patch.vat_rate = rate;
  const rec = parsePercent(body.vat_recovery_rate, "TVA récupérable");
  if (rec !== undefined && rec !== null) patch.vat_recovery_rate = rec;
  return patch;
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
        Object.assign(patch, vatPatch(body));
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
          .insert({
            method_id: methodId, code, label, category, amount, display_order: (max?.display_order ?? 0) + 1,
            amount_basis: "TTC", vat_rate: 20, vat_recovery_rate: 100, ...vatPatch(body),
          })
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
        if (typeof body.auto_select === "boolean") patch.auto_select = body.auto_select;
        const ceeBasis = parseBasis(body.cee_amount_basis);
        if (ceeBasis) patch.cee_amount_basis = ceeBasis;
        const share = parsePercent(body.cee_vat_share, "Part de la prime soumise à TVA");
        if (share !== undefined && share !== null) patch.cee_vat_share = share;
        const ceeRate = parsePercent(body.cee_vat_rate, "Taux de TVA de la prime");
        if (ceeRate !== undefined && ceeRate !== null) patch.cee_vat_rate = ceeRate;
        for (const k of ["etas_min_exclusive", "etas_max_inclusive"] as const) {
          if (body[k] === undefined) continue;
          if (body[k] === null || body[k] === "") patch[k] = null;
          else {
            const n = Number(String(body[k]).replace(",", "."));
            if (!Number.isFinite(n) || n < 0 || n > 400) throw new Error("ETAS invalide (en %)");
            patch[k] = n;
          }
        }
        if (body.eligibility_conditions !== undefined) {
          if (!Array.isArray(body.eligibility_conditions)) throw new Error("Conditions invalides");
          const list = (body.eligibility_conditions as unknown[]).map((c) => String(c).trim()).filter(Boolean).slice(0, 20);
          if (list.some((c) => c.length > 200)) throw new Error("Condition trop longue (200 caractères max.)");
          patch.eligibility_conditions = [...new Set(list)];
        }
        await updateWithHistory(admin, "economic_methods", "id", String(body.id), (r) => `Méthode « ${r.name} »`, patch, userId);
        break;
      }
      case "update_product": {
        const patch: Row = {};
        if (typeof body.is_pac_atlantic === "boolean") patch.is_pac_atlantic = body.is_pac_atlantic;
        if (body.etas !== undefined) {
          if (body.etas === null || body.etas === "") patch.etas = null;
          else {
            const n = Number(String(body.etas).replace(",", "."));
            if (!Number.isFinite(n) || n <= 0 || n > 400) throw new Error("ETAS invalide (en %)");
            patch.etas = Math.round(n * 100) / 100;
          }
          // Un ETAS modifié doit être revalidé.
          if (body.etas_validated === undefined) patch.etas_validated = false;
        }
        if (typeof body.etas_validated === "boolean") {
          if (body.etas_validated) {
            const { data: p } = await admin.from("products").select("etas").eq("id", String(body.id)).maybeSingle();
            const etas = "etas" in patch ? patch.etas : p?.etas;
            if (etas === null || etas === undefined) throw new Error("Renseignez l'ETAS avant de le valider");
          }
          patch.etas_validated = body.etas_validated;
        }
        await updateWithHistory(admin, "products", "id", String(body.id), (r) => `Produit « ${r.name} »`, patch, userId);
        // Les chantiers en attente de sélection automatique avec ce produit sont recalculés ;
        // ceux qui ont déjà une méthode ne bougent pas (coûts historiques conservés).
        const { data: uses } = await admin.from("lead_materials").select("lead_id").eq("product_id", String(body.id));
        const leadIds = [...new Set((uses || []).map((u) => u.lead_id as string))];
        if (leadIds.length) {
          const { data: pending } = await admin
            .from("lead_financials")
            .select("lead_id")
            .in("lead_id", leadIds)
            .is("method_id", null)
            .eq("method_source", "auto");
          for (const r of (pending || []).slice(0, 200)) {
            await recalculateLeadFinancials(admin, r.lead_id as string, { trigger: "ETAS du catalogue modifié", userId });
          }
        }
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
