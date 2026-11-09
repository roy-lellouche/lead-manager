/**
 * Moteur de calcul de rentabilité des chantiers (pur, sans accès réseau ni base).
 *
 * Tous les montants sont en euros TTC (choix RS Écologie) et calculés en
 * centimes entiers pour éviter les erreurs d'arrondi des flottants.
 *
 * Formules :
 *   Coût total              = somme des coûts du chantier
 *   Chiffre d'affaires (CA) = prime CEE + reste à charge client + autres recettes
 *   Marge brute             = CA − coût total
 *   Taux de marge           = marge brute / CA × 100   (marge sur CA, PAS taux de marque sur coût)
 */

export type ClimateZone = "H1" | "H2" | "H3";
export const CLIMATE_ZONES: ClimateZone[] = ["H1", "H2", "H3"];

export type CostCategory = "materiel" | "fournitures" | "main_oeuvre" | "dossier" | "autres";
export const COST_CATEGORIES: CostCategory[] = ["materiel", "fournitures", "main_oeuvre", "dossier", "autres"];
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  materiel: "Matériel",
  fournitures: "Fournitures",
  main_oeuvre: "Main-d'œuvre",
  dossier: "Dossier",
  autres: "Autres coûts",
};

/** Poste de coût standard d'une méthode (paramètres financiers). */
export interface StandardCostItem {
  code: string;
  label: string;
  category: CostCategory;
  amount: number;
}

/** Ligne de coût appliquée à un chantier. */
export interface CostLine extends StandardCostItem {
  /** Montant standard figé au moment de l'application au chantier. */
  standard_amount: number;
  /** true si le montant a été remplacé par un coût spécifique au chantier. */
  overridden: boolean;
}

export interface CeeScale {
  id: string;
  method_id: string;
  scale_year: number;
  climate_zone: ClimateZone;
  amount: number;
  valid_from: string; // YYYY-MM-DD
  valid_to: string | null; // YYYY-MM-DD inclus, null = sans fin
  validated: boolean;
}

export interface AlertThresholds {
  /** Marge strictement inférieure → alerte rouge. */
  red_below: number;
  /** Marge inférieure ou égale → vigilance orange (au-dessus : vert). */
  orange_below: number;
}
export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = { red_below: 1000, orange_below: 2000 };

export type MarginAlert = "rouge" | "orange" | "vert";

/* ── Arrondis monétaires ─────────────────────────────────────────────── */

/** Convertit un montant en centimes entiers (arrondi commercial, demi vers le haut en valeur absolue). */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error(`Montant invalide : ${amount}`);
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(amount) * 100 + 1e-7);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Arrondit un montant à 2 décimales de façon fiable. */
export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

/* ── Coûts ───────────────────────────────────────────────────────────── */

/**
 * Construit les lignes de coût d'un chantier.
 * `snapshot` : coûts standards figés lors du premier calcul (chantier historique) ;
 * s'il est absent, on applique les coûts standards actuels.
 * `overrides` : coûts spécifiques au chantier (code → montant).
 */
export function buildCostLines(
  standard: StandardCostItem[],
  overrides: Record<string, number | null | undefined> = {}
): CostLine[] {
  return standard.map((item) => {
    const o = overrides[item.code];
    const hasOverride = typeof o === "number" && Number.isFinite(o);
    return {
      ...item,
      standard_amount: roundMoney(item.amount),
      amount: roundMoney(hasOverride ? (o as number) : item.amount),
      overridden: hasOverride && roundMoney(o as number) !== roundMoney(item.amount),
    };
  });
}

export interface CostBreakdown {
  materiel: number;
  fournitures: number;
  main_oeuvre: number;
  dossier: number;
  autres: number;
  total: number;
}

/** Somme des coûts par catégorie. `extraCosts` s'ajoute aux « Autres coûts ». */
export function sumCosts(lines: Pick<CostLine, "category" | "amount">[], extraCosts = 0): CostBreakdown {
  const cents: Record<CostCategory, number> = {
    materiel: 0,
    fournitures: 0,
    main_oeuvre: 0,
    dossier: 0,
    autres: 0,
  };
  for (const l of lines) cents[l.category] += toCents(l.amount);
  cents.autres += toCents(extraCosts || 0);
  const total = COST_CATEGORIES.reduce((s, c) => s + cents[c], 0);
  return {
    materiel: fromCents(cents.materiel),
    fournitures: fromCents(cents.fournitures),
    main_oeuvre: fromCents(cents.main_oeuvre),
    dossier: fromCents(cents.dossier),
    autres: fromCents(cents.autres),
    total: fromCents(total),
  };
}

/* ── Résultat ────────────────────────────────────────────────────────── */

export interface ProfitabilityResult {
  revenue: number;
  gross_margin: number;
  /** Taux de marge sur CA en %, 2 décimales. null si CA = 0. */
  margin_rate: number | null;
}

export function computeProfitability(input: {
  totalCost: number;
  cee: number;
  resteACharge?: number;
  otherRevenue?: number;
}): ProfitabilityResult {
  const revenueCents =
    toCents(input.cee) + toCents(input.resteACharge || 0) + toCents(input.otherRevenue || 0);
  const marginCents = revenueCents - toCents(input.totalCost);
  const rate = revenueCents === 0 ? null : Math.round((marginCents / revenueCents) * 10000) / 100;
  return {
    revenue: fromCents(revenueCents),
    gross_margin: fromCents(marginCents),
    margin_rate: rate,
  };
}

/* ── Barèmes CEE ─────────────────────────────────────────────────────── */

/** Date ISO (YYYY-MM-DD) valide ? */
export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export type ScaleSelection =
  | { ok: true; scale: CeeScale }
  | { ok: false; reason: "aucun_bareme" | "plusieurs_baremes" };

/**
 * Sélectionne le barème CEE applicable : même méthode, même zone, et date
 * d'engagement comprise dans [valid_from ; valid_to]. Plusieurs barèmes
 * concurrents = configuration incohérente → pas de choix arbitraire.
 */
export function selectCeeScale(
  scales: CeeScale[],
  methodId: string,
  zone: ClimateZone,
  date: string
): ScaleSelection {
  const matches = scales.filter(
    (s) =>
      s.method_id === methodId &&
      s.climate_zone === zone &&
      s.valid_from <= date &&
      (s.valid_to === null || date <= s.valid_to)
  );
  if (matches.length === 0) return { ok: false, reason: "aucun_bareme" };
  if (matches.length > 1) return { ok: false, reason: "plusieurs_baremes" };
  return { ok: true, scale: matches[0] };
}

/* ── Alertes ─────────────────────────────────────────────────────────── */

export function marginAlertLevel(
  margin: number,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): MarginAlert {
  if (margin < thresholds.red_below) return "rouge";
  if (margin <= thresholds.orange_below) return "orange";
  return "vert";
}

/* ── Évaluation complète d'un chantier ───────────────────────────────── */

export interface ChantierInput {
  methodId: string;
  methodConfigured: boolean;
  standardCosts: StandardCostItem[];
  costOverrides?: Record<string, number | null | undefined>;
  otherCosts?: number;
  zone: ClimateZone | null;
  /** Raison lisible si la zone n'est pas déterminée. */
  zonePendingReason?: string | null;
  engagementDate: string | null;
  scales: CeeScale[];
  ceeConfirmed?: number | null;
  resteACharge?: number;
  otherRevenue?: number;
}

export interface ChantierEvaluation {
  status: "calcule" | "en_attente";
  pendingReasons: string[];
  costLines: CostLine[];
  costs: CostBreakdown;
  scale: CeeScale | null;
  ceeScaleAmount: number | null;
  /** Montant CEE retenu dans le CA (confirmé s'il existe, sinon barème). */
  ceeForecast: number | null;
  result: ProfitabilityResult | null;
}

export function evaluateChantier(input: ChantierInput): ChantierEvaluation {
  // `scaleOnly` : informations qui ne servent qu'à choisir le barème. Un montant
  // CEE confirmé les rend non bloquantes (le CA repose alors sur ce montant).
  const pending: { reason: string; scaleOnly: boolean }[] = [];
  if (!input.methodConfigured)
    pending.push({ reason: "Méthode économique non configurée (coûts et barèmes à définir)", scaleOnly: false });

  const costLines = buildCostLines(input.standardCosts, input.costOverrides);
  const costs = sumCosts(costLines, input.otherCosts || 0);

  if (!input.zone)
    pending.push({ reason: input.zonePendingReason || "Zone climatique non déterminée", scaleOnly: true });
  if (!input.engagementDate)
    pending.push({ reason: "Date de signature du devis manquante", scaleOnly: true });
  else if (!isIsoDate(input.engagementDate))
    pending.push({ reason: "Date de signature du devis invalide", scaleOnly: true });

  let scale: CeeScale | null = null;
  if (input.methodConfigured && input.zone && isIsoDate(input.engagementDate)) {
    const sel = selectCeeScale(input.scales, input.methodId, input.zone, input.engagementDate);
    if (sel.ok) scale = sel.scale;
    else
      pending.push({
        reason:
          sel.reason === "aucun_bareme"
            ? `Aucun barème CEE pour la zone ${input.zone} à la date du ${input.engagementDate}`
            : "Plusieurs barèmes CEE se chevauchent pour cette date et cette zone : à corriger dans les paramètres",
        scaleOnly: true,
      });
  }

  const confirmed =
    typeof input.ceeConfirmed === "number" && Number.isFinite(input.ceeConfirmed) ? input.ceeConfirmed : null;
  // Un montant CEE confirmé prime sur le barème.
  const ceeForecast = confirmed !== null ? roundMoney(confirmed) : scale ? roundMoney(scale.amount) : null;

  const blocking = pending.filter((p) => !(p.scaleOnly && confirmed !== null));
  const canCompute = ceeForecast !== null && blocking.length === 0;

  return {
    status: canCompute ? "calcule" : "en_attente",
    pendingReasons: canCompute ? [] : pending.map((p) => p.reason),
    costLines,
    costs,
    scale,
    ceeScaleAmount: scale ? roundMoney(scale.amount) : null,
    ceeForecast,
    result: canCompute
      ? computeProfitability({
          totalCost: costs.total,
          cee: ceeForecast as number,
          resteACharge: input.resteACharge || 0,
          otherRevenue: input.otherRevenue || 0,
        })
      : null,
  };
}
