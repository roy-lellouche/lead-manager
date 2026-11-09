/**
 * Moteur de calcul de rentabilité des chantiers (pur, sans accès réseau ni base).
 *
 * Montants calculés en centimes entiers pour éviter les erreurs d'arrondi des flottants.
 *
 * TVA (par poste de coût, paramétrable) :
 *   - montant d'origine saisi en HT ou en TTC, taux de TVA propre au poste ;
 *   - part de TVA récupérable (0 à 100 %) ;
 *   - coût de revient du poste = TTC − TVA récupérable.
 *   Un poste sans taux de TVA (chantiers historiques) est pris tel quel.
 *
 * Formules :
 *   Coût de revient         = somme des coûts de revient des postes
 *   Chiffre d'affaires (CA) = prime CEE HT + reste à charge client + autres recettes
 *   Marge brute             = CA − coût de revient
 *   Taux de marge           = marge brute / CA × 100   (marge sur CA, PAS taux de marque sur coût)
 * Trésorerie (séparée) : décaissement TTC des coûts, encaissement TTC des recettes.
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

export type AmountBasis = "HT" | "TTC";

/** Poste de coût standard d'une méthode (paramètres financiers). */
export interface StandardCostItem {
  code: string;
  label: string;
  category: CostCategory;
  /** Montant d'origine, dans la base `amount_basis`. */
  amount: number;
  amount_basis?: AmountBasis;
  /** Taux de TVA en % (ex. 20). null/absent = pas de traitement de TVA (montant pris tel quel). */
  vat_rate?: number | null;
  /** Part de la TVA récupérable en % (100 = totale, 0 = aucune). */
  vat_recovery_rate?: number | null;
}

/** Ligne de coût appliquée à un chantier. */
export interface CostLine extends StandardCostItem {
  /** Montant standard figé au moment de l'application au chantier. */
  standard_amount: number;
  /** true si le montant a été remplacé par un coût spécifique au chantier. */
  overridden: boolean;
  ht: number;
  ttc: number;
  vat: number;
  recoverable_vat: number;
  /** Coût de revient = TTC − TVA récupérable. */
  cost_price: number;
}

/** Traitement de la TVA d'un montant (en centimes). */
export function vatBreakdown(
  amount: number,
  basis: AmountBasis = "TTC",
  vatRate: number | null | undefined,
  recoveryRate: number | null | undefined = 100
): { ht: number; ttc: number; vat: number; recoverable_vat: number; cost_price: number } {
  const a = toCents(amount);
  if (vatRate === null || vatRate === undefined || !Number.isFinite(vatRate)) {
    const v = fromCents(a);
    return { ht: v, ttc: v, vat: 0, recoverable_vat: 0, cost_price: v };
  }
  const r = vatRate / 100;
  const ht = basis === "HT" ? a : Math.round(a / (1 + r));
  const ttc = basis === "HT" ? Math.round(a * (1 + r)) : a;
  const vat = ttc - ht;
  const rec = Math.round((vat * Math.min(100, Math.max(0, recoveryRate ?? 100))) / 100);
  return {
    ht: fromCents(ht),
    ttc: fromCents(ttc),
    vat: fromCents(vat),
    recoverable_vat: fromCents(rec),
    cost_price: fromCents(ttc - rec),
  };
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
  /** Marge strictement inférieure → vigilance orange (à partir de ce seuil : vert). */
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
 * `overrides` : coûts spécifiques au chantier (code → montant, dans la base du poste).
 */
export function buildCostLines(
  standard: StandardCostItem[],
  overrides: Record<string, number | null | undefined> = {}
): CostLine[] {
  return standard.map((item) => {
    const o = overrides[item.code];
    const hasOverride = typeof o === "number" && Number.isFinite(o);
    const amount = roundMoney(hasOverride ? (o as number) : item.amount);
    const basis: AmountBasis = item.amount_basis === "HT" ? "HT" : "TTC";
    return {
      ...item,
      amount_basis: basis,
      vat_rate: item.vat_rate ?? null,
      vat_recovery_rate: item.vat_rate == null ? null : item.vat_recovery_rate ?? 100,
      standard_amount: roundMoney(item.amount),
      amount,
      overridden: hasOverride && roundMoney(o as number) !== roundMoney(item.amount),
      ...vatBreakdown(amount, basis, item.vat_rate, item.vat_recovery_rate ?? 100),
    };
  });
}

export interface CostBreakdown {
  /** Coût de revient par catégorie. */
  materiel: number;
  fournitures: number;
  main_oeuvre: number;
  dossier: number;
  autres: number;
  /** Coût de revient total (après TVA récupérable). */
  total: number;
  total_ht: number;
  total_ttc: number;
  total_vat: number;
  recoverable_vat: number;
  /** Somme arithmétique des montants d'origine (bases HT/TTC mélangées) : contrôle uniquement. */
  raw_total: number;
}

type CostLike = Pick<CostLine, "category" | "amount"> & Partial<Pick<CostLine, "ht" | "ttc" | "vat" | "recoverable_vat" | "cost_price">>;

/** Somme des coûts. `extraCosts` (autres coûts du chantier, sans TVA) s'ajoute aux « Autres coûts ». */
export function sumCosts(lines: CostLike[], extraCosts = 0): CostBreakdown {
  const cents: Record<CostCategory, number> = { materiel: 0, fournitures: 0, main_oeuvre: 0, dossier: 0, autres: 0 };
  let ht = 0, ttc = 0, vat = 0, rec = 0, raw = 0;
  for (const l of lines) {
    const cp = toCents(l.cost_price ?? l.amount);
    cents[l.category] += cp;
    ht += toCents(l.ht ?? l.amount);
    ttc += toCents(l.ttc ?? l.amount);
    vat += toCents(l.vat ?? 0);
    rec += toCents(l.recoverable_vat ?? 0);
    raw += toCents(l.amount);
  }
  const extra = toCents(extraCosts || 0);
  cents.autres += extra;
  ht += extra; ttc += extra; raw += extra;
  const total = COST_CATEGORIES.reduce((s, c) => s + cents[c], 0);
  return {
    materiel: fromCents(cents.materiel),
    fournitures: fromCents(cents.fournitures),
    main_oeuvre: fromCents(cents.main_oeuvre),
    dossier: fromCents(cents.dossier),
    autres: fromCents(cents.autres),
    total: fromCents(total),
    total_ht: fromCents(ht),
    total_ttc: fromCents(ttc),
    total_vat: fromCents(vat),
    recoverable_vat: fromCents(rec),
    raw_total: fromCents(raw),
  };
}

/* ── Recettes ────────────────────────────────────────────────────────── */

/** Traitement de la TVA de la prime CEE (par méthode). */
export interface CeeVatConfig {
  /** Base du montant du barème / confirmé. */
  basis: AmountBasis;
  /** Part de la prime soumise à TVA, en % (ex. 50). */
  taxable_share: number;
  /** Taux de TVA sur la part taxable, en %. */
  vat_rate: number;
}
/** Sans configuration : prime prise telle quelle, sans TVA (comportement historique). */
export const NO_CEE_VAT: CeeVatConfig = { basis: "HT", taxable_share: 0, vat_rate: 0 };

export function ceeVatSplit(amount: number, cfg: CeeVatConfig = NO_CEE_VAT): { ht: number; vat: number; ttc: number } {
  const a = toCents(amount);
  const share = Math.min(100, Math.max(0, cfg.taxable_share)) / 100;
  const r = Math.max(0, cfg.vat_rate) / 100;
  const taxable = Math.round(a * share);
  if (cfg.basis === "HT") {
    const vat = Math.round(taxable * r);
    return { ht: fromCents(a), vat: fromCents(vat), ttc: fromCents(a + vat) };
  }
  const taxableHt = Math.round(taxable / (1 + r));
  const ht = a - taxable + taxableHt;
  return { ht: fromCents(ht), vat: fromCents(a - ht), ttc: fromCents(a) };
}

/* ── Résultat ────────────────────────────────────────────────────────── */

export interface ProfitabilityResult {
  /** CA prévisionnel (base HT). */
  revenue: number;
  gross_margin: number;
  /** Taux de marge sur CA en %, 2 décimales. null si CA = 0. */
  margin_rate: number | null;
  cee_ht: number;
  cee_vat: number;
  cee_ttc: number;
  /** Encaissement TTC prévu (trésorerie). */
  cash_in_ttc: number;
}

export function computeProfitability(input: {
  totalCost: number;
  cee: number;
  resteACharge?: number;
  otherRevenue?: number;
  ceeVat?: CeeVatConfig;
}): ProfitabilityResult {
  const cee = ceeVatSplit(input.cee, input.ceeVat);
  const extra = toCents(input.resteACharge || 0) + toCents(input.otherRevenue || 0);
  const revenueCents = toCents(cee.ht) + extra;
  const marginCents = revenueCents - toCents(input.totalCost);
  const rate = revenueCents === 0 ? null : Math.round((marginCents / revenueCents) * 10000) / 100;
  return {
    revenue: fromCents(revenueCents),
    gross_margin: fromCents(marginCents),
    margin_rate: rate,
    cee_ht: cee.ht,
    cee_vat: cee.vat,
    cee_ttc: cee.ttc,
    cash_in_ttc: fromCents(toCents(cee.ttc) + extra),
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
  if (margin < thresholds.orange_below) return "orange";
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
  ceeVat?: CeeVatConfig;
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
          ceeVat: input.ceeVat,
        })
      : null,
  };
}
