import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_ALERT_THRESHOLDS,
  NO_CEE_VAT,
  evaluateChantier,
  type AlertThresholds,
  type CeeVatConfig,
  type CeeScale,
  type ClimateZone,
  type StandardCostItem,
} from "./engine";
import { resolveZoneFromCommunes, type Commune } from "./climate-zones";
import { selectMethod, type CatalogProduct, type MethodSelection, type ScalePeriod } from "./method-selection";

/* ── Géolocalisation (API officielle geo.api.gouv.fr) ────────────────── */

export async function fetchCommunesForPostalCode(postalCode: string): Promise<Commune[] | null> {
  if (!/^\d{5}$/.test(postalCode)) return [];
  try {
    const url = `https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom,code,codeDepartement`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Commune[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null; // service indisponible : on réessaiera au prochain recalcul
  }
}

/* ── Configuration d'une méthode ─────────────────────────────────────── */

export interface MethodRow {
  id: string;
  name: string;
  is_configured: boolean;
  active: boolean;
  auto_select: boolean;
  etas_min_exclusive: number | null;
  etas_max_inclusive: number | null;
  eligibility_conditions: string[];
  cee_amount_basis: "HT" | "TTC";
  cee_vat_share: number;
  cee_vat_rate: number;
}

const METHOD_COLUMNS =
  "id, name, is_configured, active, auto_select, etas_min_exclusive, etas_max_inclusive, eligibility_conditions, cee_amount_basis, cee_vat_share, cee_vat_rate";

function toMethodRow(m: Record<string, unknown>): MethodRow {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(m.id),
    name: String(m.name),
    is_configured: !!m.is_configured,
    active: m.active !== false,
    auto_select: !!m.auto_select,
    etas_min_exclusive: n(m.etas_min_exclusive),
    etas_max_inclusive: n(m.etas_max_inclusive),
    eligibility_conditions: Array.isArray(m.eligibility_conditions) ? (m.eligibility_conditions as string[]) : [],
    cee_amount_basis: m.cee_amount_basis === "TTC" ? "TTC" : "HT",
    cee_vat_share: Number(m.cee_vat_share ?? 0),
    cee_vat_rate: Number(m.cee_vat_rate ?? 0),
  };
}

export function ceeVatConfigOf(m: MethodRow | null): CeeVatConfig {
  if (!m) return NO_CEE_VAT;
  return { basis: m.cee_amount_basis, taxable_share: m.cee_vat_share, vat_rate: m.cee_vat_rate };
}

export interface MethodConfig {
  method: MethodRow | null;
  costs: StandardCostItem[];
  scales: CeeScale[];
}

export async function loadMethodConfig(admin: SupabaseClient, methodId: string): Promise<MethodConfig> {
  const [m, c, s] = await Promise.all([
    admin.from("economic_methods").select(METHOD_COLUMNS).eq("id", methodId).maybeSingle(),
    admin
      .from("method_cost_items")
      .select("code, label, category, amount, amount_basis, vat_rate, vat_recovery_rate")
      .eq("method_id", methodId)
      .eq("active", true)
      .order("display_order"),
    admin
      .from("cee_scales")
      .select("id, method_id, scale_year, climate_zone, amount, valid_from, valid_to, validated")
      .eq("method_id", methodId),
  ]);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    method: m.data ? toMethodRow(m.data as Record<string, unknown>) : null,
    costs: (c.data || []).map((x) => ({
      ...x,
      amount: Number(x.amount),
      amount_basis: x.amount_basis === "HT" ? "HT" : "TTC",
      vat_rate: n(x.vat_rate),
      vat_recovery_rate: n(x.vat_recovery_rate) ?? 100,
    })) as StandardCostItem[],
    scales: (s.data || []).map((x) => ({ ...x, amount: Number(x.amount) })) as CeeScale[],
  };
}

export async function loadAlertThresholds(admin: SupabaseClient): Promise<AlertThresholds> {
  const { data } = await admin.from("financial_settings").select("value").eq("key", "alert_thresholds").maybeSingle();
  const v = data?.value as Partial<AlertThresholds> | undefined;
  return {
    red_below: Number(v?.red_below ?? DEFAULT_ALERT_THRESHOLDS.red_below),
    orange_below: Number(v?.orange_below ?? DEFAULT_ALERT_THRESHOLDS.orange_below),
  };
}

/* ── Sélection automatique de la méthode ─────────────────────────────── */

async function loadLeadPacProducts(admin: SupabaseClient, leadId: string): Promise<CatalogProduct[]> {
  const { data } = await admin
    .from("lead_materials")
    .select("product_id, products(id, name, is_pac_atlantic, etas, etas_validated)")
    .eq("lead_id", leadId);
  const out: CatalogProduct[] = [];
  for (const row of (data || []) as { products: Record<string, unknown> | Record<string, unknown>[] | null }[]) {
    const p = Array.isArray(row.products) ? row.products[0] : row.products;
    if (!p) continue;
    out.push({
      id: String(p.id),
      name: String(p.name),
      is_pac_atlantic: !!p.is_pac_atlantic,
      etas: p.etas === null || p.etas === undefined ? null : Number(p.etas),
      etas_validated: !!p.etas_validated,
    });
  }
  return out;
}

function describeSelection(sel: MethodSelection): string | null {
  switch (sel.status) {
    case "aucune_pac":
      return null;
    case "plusieurs_pac":
      return `Plusieurs PAC Atlantic sur la fiche (${sel.products.map((p) => p.name).join(", ")}) : choisissez la méthode à la main`;
    case "etas_a_confirmer":
      return `ETAS de « ${sel.product.name} » non renseigné ou non validé dans le catalogue (Paramètres financiers) : à confirmer`;
    case "aucune_methode":
      return `Aucune méthode configurée pour un ETAS de ${sel.etas} %`;
    case "plusieurs_methodes":
      return `Plusieurs méthodes correspondent à un ETAS de ${sel.etas} % : choisissez à la main`;
    case "candidate":
      return sel.missing.length
        ? `${sel.method.name} (ETAS ${sel.etas} %) : à confirmer avant application`
        : `${sel.method.name} appliquée automatiquement (ETAS ${sel.etas} %)`;
  }
}

/* ── Recalcul d'un chantier ──────────────────────────────────────────── */

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Recalcule la rentabilité prévisionnelle d'un lead, côté serveur.
 * - Sélectionne automatiquement la méthode d'après la PAC Atlantic de la fiche (ETAS validé
 *   + conditions confirmées + période du barème), sauf si la méthode a été choisie à la main.
 * - Une seule ligne par lead : pas de doublon.
 * - Les coûts standards sont figés au premier calcul avec une méthode : une modification
 *   ultérieure des paramètres ne change pas les chantiers existants (sauf `resetStandardCosts`).
 * - Les montants réels ne sont jamais modifiés ici.
 * - L'historique ne reçoit une entrée que si le résultat change.
 */
export async function recalculateLeadFinancials(
  admin: SupabaseClient,
  leadId: string,
  opts: { trigger: string; userId: string | null; resetStandardCosts?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const [{ data: lead }, finRes, products] = await Promise.all([
    admin.from("leads").select("id, status, postal_code, city, devis_signed_at").eq("id", leadId).maybeSingle(),
    admin.from("lead_financials").select("*").eq("lead_id", leadId).maybeSingle(),
    loadLeadPacProducts(admin, leadId),
  ]);
  if (!lead) return { ok: false, error: "Lead introuvable" };
  let fin = finRes.data as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const hasPac = products.some((p) => p.is_pac_atlantic);

  // Pas de fiche rentabilité : on n'en crée une qu'au statut « Installé », avec une PAC Atlantic sur la fiche.
  if (!fin) {
    if (!hasPac || lead.status !== "installe") return { ok: true };
    const { error } = await admin.from("lead_financials").insert({ lead_id: leadId, method_source: "auto" });
    if (error) return { ok: false, error: error.message };
    fin = (await admin.from("lead_financials").select("*").eq("lead_id", leadId).maybeSingle()).data;
    if (!fin) return { ok: false, error: "Création de la fiche rentabilité impossible" };
  }

  const engagementDate = (lead.devis_signed_at as string | null) || null;

  /* Sélection de la méthode */
  let methodId: string | null = fin.method_id ?? null;
  let selectionMessage: string | null = null;
  let suggestedMethodId: string | null = null;
  let selectionPending: string[] = [];
  let etasProduct: CatalogProduct | null = null;
  if (hasPac || fin.method_source === "auto") {
    const [{ data: methodRows }, { data: periods }] = await Promise.all([
      admin.from("economic_methods").select(METHOD_COLUMNS),
      admin.from("cee_scales").select("method_id, valid_from, valid_to"),
    ]);
    const methods = ((methodRows || []) as Record<string, unknown>[]).map(toMethodRow);
    const sel = selectMethod({
      products,
      methods,
      checks: (fin.eligibility_checks || {}) as Record<string, Record<string, boolean>>,
      engagementDate,
      scalePeriods: (periods || []) as ScalePeriod[],
    });
    if ("product" in sel) etasProduct = sel.product;
    selectionMessage = describeSelection(sel);
    if (sel.status === "candidate") suggestedMethodId = sel.method.id;

    if (fin.method_source !== "manuel") {
      if (sel.status === "candidate" && sel.missing.length === 0) methodId = sel.method.id;
      else {
        methodId = null;
        selectionPending =
          sel.status === "candidate" ? sel.missing : selectionMessage ? [selectionMessage] : ["Aucune PAC Atlantic sur la fiche"];
      }
    } else if (suggestedMethodId && suggestedMethodId !== methodId) {
      selectionMessage = `Méthode choisie à la main ; le catalogue suggère : ${methods.find((m) => m.id === suggestedMethodId)?.name}`;
    }
  }

  const selectionFields = {
    method_id: methodId,
    suggested_method_id: suggestedMethodId,
    selection_message: selectionMessage,
    etas_product_id: etasProduct?.id ?? null,
    etas_product_name: etasProduct?.name ?? null,
    etas_value: etasProduct?.etas ?? null,
  };

  const now = new Date().toISOString();
  if (!methodId) {
    const { error } = await admin
      .from("lead_financials")
      .update({
        ...selectionFields,
        calc_status: "en_attente",
        pending_reasons: selectionPending.length ? selectionPending : ["Aucune méthode économique sélectionnée"],
        revenue: null, gross_margin: null, margin_rate: null, cee_forecast: null,
        cee_ht: null, cee_vat: null, cee_ttc: null, cash_in_ttc: null,
        updated_at: now,
      })
      .eq("lead_id", leadId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const config = await loadMethodConfig(admin, methodId);

  /* Zone climatique : re-résolue si l'adresse a changé ou si elle n'a pas pu l'être. */
  const postal = ((lead.postal_code as string | null) || "").trim();
  const city = ((lead.city as string | null) || "").trim();
  const addressChanged = (fin.zone_postal_code || "") !== postal || (fin.zone_city || "") !== city;
  const zone: {
    climate_zone: ClimateZone | null;
    zone_source: string | null;
    zone_message: string | null;
    zone_candidates: unknown;
    insee_code: string | null;
    department_code: string | null;
  } = {
    climate_zone: fin.climate_zone,
    zone_source: fin.zone_source,
    zone_message: fin.zone_message,
    zone_candidates: fin.zone_candidates,
    insee_code: fin.insee_code,
    department_code: fin.department_code,
  };
  const keepManual = fin.zone_source === "manuel" && !addressChanged;
  const needResolve = !keepManual && (addressChanged || (!fin.climate_zone && fin.zone_source !== "a_confirmer"));
  if (needResolve) {
    if (!postal) {
      Object.assign(zone, {
        climate_zone: null, zone_source: "introuvable", zone_message: "Code postal d'installation manquant",
        zone_candidates: null, insee_code: null, department_code: null,
      });
    } else {
      const communes = await fetchCommunesForPostalCode(postal);
      if (communes === null) {
        Object.assign(zone, {
          climate_zone: null, zone_source: "introuvable",
          zone_message: "Service de géolocalisation indisponible : réessayez ou choisissez la zone",
          zone_candidates: null, insee_code: null, department_code: null,
        });
      } else {
        const r = resolveZoneFromCommunes(communes, city);
        if (r.status === "ok")
          Object.assign(zone, {
            climate_zone: r.zone, zone_source: "auto", zone_message: null, zone_candidates: null,
            insee_code: r.insee_code, department_code: r.department_code,
          });
        else if (r.status === "ambigu")
          Object.assign(zone, {
            climate_zone: null, zone_source: "a_confirmer",
            zone_message: "Code postal couvrant plusieurs communes de zones différentes : confirmez la commune",
            zone_candidates: r.candidates, insee_code: null, department_code: null,
          });
        else
          Object.assign(zone, {
            climate_zone: null, zone_source: "introuvable", zone_message: r.reason,
            zone_candidates: null, insee_code: null, department_code: null,
          });
      }
    }
  }

  /* Coûts standards : figés au premier calcul avec cette méthode. */
  const snapshotMethod = fin.standard_costs_method_id ?? fin.method_id;
  const methodChanged = snapshotMethod !== methodId;
  const useSnapshot = Array.isArray(fin.standard_costs) && !opts.resetStandardCosts && !methodChanged;
  const standardCosts: StandardCostItem[] = useSnapshot ? (fin.standard_costs as StandardCostItem[]) : config.costs;
  const standardCostsAt = useSnapshot ? fin.standard_costs_at : now;
  // Les coûts spécifiques d'une autre méthode ne s'appliquent pas.
  const costOverrides = methodChanged && fin.standard_costs ? {} : ((fin.cost_overrides || {}) as Record<string, number>);

  const ev = evaluateChantier({
    methodId,
    methodConfigured: !!config.method?.is_configured && config.costs.length > 0,
    standardCosts,
    costOverrides,
    otherCosts: num(fin.other_costs) ?? 0,
    zone: zone.climate_zone,
    zonePendingReason: zone.zone_message,
    engagementDate,
    scales: config.scales,
    ceeConfirmed: num(fin.cee_confirmed),
    resteACharge: num(fin.reste_a_charge) ?? 0,
    otherRevenue: num(fin.other_revenue) ?? 0,
    ceeVat: ceeVatConfigOf(config.method),
  });

  const result = {
    calc_status: ev.status,
    pending_reasons: ev.pendingReasons,
    ...zone,
    zone_postal_code: postal,
    zone_city: city,
    scale_id: ev.scale?.id ?? null,
    scale_year: ev.scale?.scale_year ?? null,
    scale_validated: ev.scale ? ev.scale.validated : null,
    cee_scale_amount: ev.ceeScaleAmount,
    cee_forecast: ev.ceeForecast,
    standard_costs: standardCosts,
    standard_costs_at: standardCostsAt,
    standard_costs_method_id: methodId,
    cost_overrides: costOverrides,
    cost_lines: ev.costLines,
    cost_materiel: ev.costs.materiel,
    cost_fournitures: ev.costs.fournitures,
    cost_main_oeuvre: ev.costs.main_oeuvre,
    cost_dossier: ev.costs.dossier,
    cost_autres: ev.costs.autres,
    total_cost: ev.costs.total,
    raw_total_cost: ev.costs.raw_total,
    total_cost_ht: ev.costs.total_ht,
    total_cost_ttc: ev.costs.total_ttc,
    total_vat: ev.costs.total_vat,
    recoverable_vat: ev.costs.recoverable_vat,
    cash_out_ttc: ev.costs.total_ttc,
    revenue: ev.result?.revenue ?? null,
    gross_margin: ev.result?.gross_margin ?? null,
    margin_rate: ev.result?.margin_rate ?? null,
    cee_ht: ev.result?.cee_ht ?? null,
    cee_vat: ev.result?.cee_vat ?? null,
    cee_ttc: ev.result?.cee_ttc ?? null,
    cash_in_ttc: ev.result?.cash_in_ttc ?? null,
  };

  const hashed = {
    method_id: methodId,
    devis_signed_at: engagementDate,
    cee_confirmed: num(fin.cee_confirmed),
    reste_a_charge: num(fin.reste_a_charge),
    other_revenue: num(fin.other_revenue),
    other_costs: num(fin.other_costs),
    ...result,
    standard_costs_at: undefined,
  };
  const hash = createHash("sha256").update(JSON.stringify(hashed)).digest("hex");

  const { error } = await admin
    .from("lead_financials")
    .update({ ...selectionFields, ...result, calculated_at: now, calculated_by: opts.userId, updated_at: now })
    .eq("lead_id", leadId);
  if (error) return { ok: false, error: error.message };

  const { data: last } = await admin
    .from("lead_financial_calculations")
    .select("result_hash")
    .eq("lead_id", leadId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.result_hash !== hash) {
    await admin.from("lead_financial_calculations").insert({
      lead_id: leadId,
      calculated_by: opts.userId,
      trigger: opts.trigger,
      result_hash: hash,
      snapshot: hashed,
    });
  }
  return { ok: true };
}

/** Champs de la fiche lead dont la modification déclenche un recalcul. */
export const RECALC_LEAD_FIELDS = ["status", "postal_code", "city", "installation_type", "devis_signed_at", "category"] as const;

/**
 * À appeler après une mise à jour de lead : recalcule si un champ pertinent
 * est présent dans la mise à jour. N'échoue jamais la requête appelante.
 */
export async function recalcIfRelevant(
  admin: SupabaseClient,
  leadId: string,
  updatedFields: Record<string, unknown>,
  userId: string | null
): Promise<void> {
  const touched = RECALC_LEAD_FIELDS.filter((f) => f in updatedFields);
  if (touched.length === 0) return;
  try {
    await recalculateLeadFinancials(admin, leadId, { trigger: `fiche: ${touched.join(", ")}`, userId });
  } catch (e) {
    console.error("[finance] recalcul impossible", leadId, e);
  }
}
