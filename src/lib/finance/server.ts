import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_ALERT_THRESHOLDS,
  evaluateChantier,
  type AlertThresholds,
  type CeeScale,
  type ClimateZone,
  type StandardCostItem,
} from "./engine";
import { resolveZoneFromCommunes, type Commune } from "./climate-zones";

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

export interface MethodConfig {
  method: { id: string; name: string; is_configured: boolean } | null;
  costs: StandardCostItem[];
  scales: CeeScale[];
}

export async function loadMethodConfig(admin: SupabaseClient, methodId: string): Promise<MethodConfig> {
  const [m, c, s] = await Promise.all([
    admin.from("economic_methods").select("id, name, is_configured").eq("id", methodId).maybeSingle(),
    admin
      .from("method_cost_items")
      .select("code, label, category, amount")
      .eq("method_id", methodId)
      .eq("active", true)
      .order("display_order"),
    admin
      .from("cee_scales")
      .select("id, method_id, scale_year, climate_zone, amount, valid_from, valid_to, validated")
      .eq("method_id", methodId),
  ]);
  return {
    method: m.data,
    costs: (c.data || []).map((x) => ({ ...x, amount: Number(x.amount) })) as StandardCostItem[],
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

/* ── Recalcul d'un chantier ──────────────────────────────────────────── */

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Recalcule la rentabilité prévisionnelle d'un lead, côté serveur.
 * - Ne fait rien si aucune méthode économique n'est choisie.
 * - Une seule ligne par lead (upsert) : pas de doublon.
 * - Les coûts standards sont figés au premier calcul : une modification ultérieure
 *   des paramètres ne change pas les chantiers existants (sauf `resetStandardCosts`).
 * - Les montants réels ne sont jamais modifiés ici.
 * - L'historique ne reçoit une entrée que si le résultat change.
 */
export async function recalculateLeadFinancials(
  admin: SupabaseClient,
  leadId: string,
  opts: { trigger: string; userId: string | null; resetStandardCosts?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const [{ data: lead }, { data: fin }] = await Promise.all([
    admin.from("leads").select("id, postal_code, city, devis_signed_at").eq("id", leadId).maybeSingle(),
    admin.from("lead_financials").select("*").eq("lead_id", leadId).maybeSingle(),
  ]);
  if (!lead) return { ok: false, error: "Lead introuvable" };
  if (!fin || !fin.method_id) return { ok: true };

  const config = await loadMethodConfig(admin, fin.method_id);

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
  const needResolve = !keepManual && (addressChanged || !fin.climate_zone && fin.zone_source !== "a_confirmer");
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

  /* Coûts standards : figés au premier calcul. */
  const useSnapshot = Array.isArray(fin.standard_costs) && !opts.resetStandardCosts;
  const standardCosts: StandardCostItem[] = useSnapshot
    ? (fin.standard_costs as StandardCostItem[])
    : config.costs;
  const standardCostsAt = useSnapshot ? fin.standard_costs_at : new Date().toISOString();

  const ev = evaluateChantier({
    methodId: fin.method_id,
    methodConfigured: !!config.method?.is_configured && config.costs.length > 0,
    standardCosts,
    costOverrides: (fin.cost_overrides || {}) as Record<string, number>,
    otherCosts: num(fin.other_costs) ?? 0,
    zone: zone.climate_zone,
    zonePendingReason: zone.zone_message,
    engagementDate: (lead.devis_signed_at as string | null) || null,
    scales: config.scales,
    ceeConfirmed: num(fin.cee_confirmed),
    resteACharge: num(fin.reste_a_charge) ?? 0,
    otherRevenue: num(fin.other_revenue) ?? 0,
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
    cost_lines: ev.costLines,
    cost_materiel: ev.costs.materiel,
    cost_fournitures: ev.costs.fournitures,
    cost_main_oeuvre: ev.costs.main_oeuvre,
    cost_dossier: ev.costs.dossier,
    cost_autres: ev.costs.autres,
    total_cost: ev.costs.total,
    revenue: ev.result?.revenue ?? null,
    gross_margin: ev.result?.gross_margin ?? null,
    margin_rate: ev.result?.margin_rate ?? null,
  };

  const hashed = {
    method_id: fin.method_id,
    devis_signed_at: lead.devis_signed_at,
    cee_confirmed: num(fin.cee_confirmed),
    reste_a_charge: num(fin.reste_a_charge),
    other_revenue: num(fin.other_revenue),
    other_costs: num(fin.other_costs),
    ...result,
    standard_costs_at: undefined,
  };
  const hash = createHash("sha256").update(JSON.stringify(hashed)).digest("hex");

  const now = new Date().toISOString();
  const { error } = await admin
    .from("lead_financials")
    .update({ ...result, calculated_at: now, calculated_by: opts.userId, updated_at: now })
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
export const RECALC_LEAD_FIELDS = ["postal_code", "city", "installation_type", "devis_signed_at"] as const;

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
