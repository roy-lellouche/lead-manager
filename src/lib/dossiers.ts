import { zoneForDepartment } from "./finance/climate-zones";

/**
 * Suivi des dossiers installés : étape du pipeline (après installation) et
 * rentabilité simple de chaque dossier, à partir des champs « chantier » de la fiche.
 *
 * Rentabilité = CEE + MPR − installation − matériel − régie − frais de dossier
 * (même formule que la fiche client).
 */

export type DossierStage = "a_deposer" | "depose" | "controle" | "paye" | "bloque";

export const DOSSIER_STAGES: { key: DossierStage; label: string; hint: string }[] = [
  { key: "a_deposer", label: "À déposer", hint: "Installé, dossier CEE pas encore déposé" },
  { key: "depose", label: "Déposé", hint: "Dossier déposé chez le délégataire" },
  { key: "controle", label: "Contrôle Veritas", hint: "En contrôle avant paiement" },
  { key: "paye", label: "Payé", hint: "Prime encaissée : dossier soldé" },
  { key: "bloque", label: "Bloqué / rejeté", hint: "Compte bloqué ou dossier rejeté" },
];

export const DOSSIER_STAGE_LABELS: Record<DossierStage, string> = Object.fromEntries(
  DOSSIER_STAGES.map((s) => [s.key, s.label])
) as Record<DossierStage, string>;

export interface DossierFlags {
  is_depose?: boolean | null;
  is_controle_veritas?: boolean | null;
  is_paye?: boolean | null;
  is_cee_paye?: boolean | null;
  is_compte_bloque?: boolean | null;
  is_rejete?: boolean | null;
}

/** Étape actuelle d'un dossier, déduite des cases « Statut chantier » de la fiche. */
export function dossierStage(f: DossierFlags): DossierStage {
  if (f.is_compte_bloque || f.is_rejete) return "bloque";
  if (f.is_paye || f.is_cee_paye) return "paye";
  if (f.is_controle_veritas) return "controle";
  if (f.is_depose) return "depose";
  return "a_deposer";
}

/** Cases à enregistrer sur la fiche pour placer le dossier à une étape donnée. */
export function stageToFlags(stage: DossierStage): Record<string, boolean> {
  const base = {
    is_depose: false,
    is_controle_veritas: false,
    is_paye: false,
    is_cee_paye: false,
    is_compte_bloque: false,
    is_rejete: false,
  };
  switch (stage) {
    case "a_deposer":
      return base;
    case "depose":
      return { ...base, is_depose: true };
    case "controle":
      return { ...base, is_depose: true, is_controle_veritas: true };
    case "paye":
      return { ...base, is_depose: true, is_controle_veritas: true, is_paye: true, is_cee_paye: true };
    case "bloque":
      // « Bloqué » conserve l'avancement : seul le blocage est ajouté (voir patchForStage).
      return { ...base, is_compte_bloque: true };
  }
}

/** Mise à jour à envoyer pour passer un dossier à une étape, sans perdre l'avancement en cas de blocage. */
export function patchForStage(stage: DossierStage, current: DossierFlags): Record<string, boolean> {
  if (stage === "bloque") {
    if (current.is_compte_bloque || current.is_rejete) return {};
    return { is_compte_bloque: true };
  }
  return { ...stageToFlags(stage) };
}

export interface DossierMoney {
  benefit_cee?: number | string | null;
  benefit_mpr?: number | string | null;
  installation_cost?: number | string | null;
  material_cost?: number | string | null;
  regie_cost?: number | string | null;
  /** Frais de dossier : secrétariat CEE, coût du lead… */
  dossier_cost?: number | string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? 0 : n;
};

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const MONEY_FIELDS = [
  "benefit_cee", "benefit_mpr", "installation_cost", "material_cost", "regie_cost", "dossier_cost",
] as const;

/** Rentabilité du dossier (identique au calcul de la fiche client). */
export function computeProfitability(m: DossierMoney): number {
  return round2(revenueOf(m) - costOf(m));
}

export function revenueOf(m: DossierMoney): number {
  return round2(num(m.benefit_cee) + num(m.benefit_mpr));
}

export function costOf(m: DossierMoney): number {
  return round2(num(m.installation_cost) + num(m.material_cost) + num(m.regie_cost) + num(m.dossier_cost));
}

/** Dossier avec pompe à chaleur (type d'installation PAC ou non renseigné). */
export function needsPac(installationType: string | null | undefined): boolean {
  return !installationType || installationType.startsWith("pac");
}

/* ── Zone climatique ─────────────────────────────────────────────── */

export type CeeZone = "H1" | "H2" | "H3";
export const CEE_ZONES: CeeZone[] = ["H1", "H2", "H3"];

/** Zone du dossier : choisie à la main, sinon déduite du département (code postal). */
export function zoneOf(r: { cee_zone?: string | null; postal_code?: string | null }): { zone: CeeZone | null; manual: boolean } {
  if (r.cee_zone && (CEE_ZONES as string[]).includes(r.cee_zone)) return { zone: r.cee_zone as CeeZone, manual: true };
  const cp = (r.postal_code || "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(cp)) return { zone: null, manual: false };
  // Corse (20xxx) : 2A et 2B sont toutes deux en H3.
  const dep = cp.startsWith("20") ? "2A" : cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2);
  return { zone: zoneForDepartment(dep) as CeeZone | null, manual: false };
}

/* ── Fiches PAC : prime par zone et postes de coût ───────────────── */

export type CostCategory = "materiel" | "installation" | "regie" | "dossier";
export const COST_CATEGORIES: { key: CostCategory; label: string; field: (typeof MONEY_FIELDS)[number] }[] = [
  { key: "materiel", label: "Matériel", field: "material_cost" },
  { key: "installation", label: "Installation", field: "installation_cost" },
  { key: "regie", label: "Régie", field: "regie_cost" },
  { key: "dossier", label: "Frais de dossier", field: "dossier_cost" },
];

export interface CostItem {
  label: string;
  amount: number;
  basis: "HT" | "TTC";
  category: CostCategory;
}

export type EtasBand = "111_140" | "140_plus";
export const ETAS_BANDS: { key: EtasBand; label: string }[] = [
  { key: "111_140", label: "111 % ≤ ETAS < 140 %" },
  { key: "140_plus", label: "ETAS ≥ 140 %" },
];

export interface PacModel {
  id: string;
  name: string;
  active: boolean;
  /** Tranche d'ETAS : sert au barème CEE (null = barème inutilisable, prime forfaitaire de la fiche). */
  etas_band: EtasBand | null;
  /** « bareme » : barème Coup de pouce (repli sur le forfait) ; « forfait » : prime fixe de la fiche. */
  cee_mode: "bareme" | "forfait";
  cee_h1: number | null;
  cee_h2: number | null;
  cee_h3: number | null;
  cost_items: CostItem[];
}

/* ── Barème CEE « Coup de pouce » 2026 ─────────────────────────────── */

export type IncomeCategory = "TMO" | "MO" | "IT" | "CL";
export const INCOME_CATEGORIES: { key: IncomeCategory; label: string; color: string }[] = [
  { key: "TMO", label: "Très modestes", color: "bleu" },
  { key: "MO", label: "Modestes", color: "jaune" },
  { key: "IT", label: "Intermédiaires", color: "violet" },
  { key: "CL", label: "Classiques", color: "rose" },
];

/** Catégorie de revenus du foyer d'après la couleur MaPrimeRénov' de la fiche. */
export function incomeCategory(color: string | null | undefined): IncomeCategory | null {
  return INCOME_CATEGORIES.find((c) => c.color === color)?.key ?? null;
}

export interface CeeBareme {
  kwhc: Record<EtasBand, number>;
  zone_factor: Record<CeeZone, number>;
  shab: { lt70: number; "70_90": number; gte90: number };
  cdp_multiplier: number;
  /** € par MWhc cumac, selon la catégorie de revenus. */
  price_mwhc: Record<IncomeCategory, number>;
}

export const DEFAULT_BAREME: CeeBareme = {
  kwhc: { "111_140": 90900, "140_plus": 109200 },
  zone_factor: { H1: 1.2, H2: 1, H3: 0.7 },
  shab: { lt70: 0.5, "70_90": 0.7, gte90: 1 },
  cdp_multiplier: 5,
  price_mwhc: { TMO: 14, MO: 7.5, IT: 7.5, CL: 7.5 },
};

export function normalizeBareme(v: unknown): CeeBareme {
  const b = (v && typeof v === "object" ? v : {}) as Partial<CeeBareme>;
  return {
    kwhc: { ...DEFAULT_BAREME.kwhc, ...(b.kwhc || {}) },
    zone_factor: { ...DEFAULT_BAREME.zone_factor, ...(b.zone_factor || {}) },
    shab: { ...DEFAULT_BAREME.shab, ...(b.shab || {}) },
    cdp_multiplier: Number(b.cdp_multiplier) || DEFAULT_BAREME.cdp_multiplier,
    price_mwhc: { ...DEFAULT_BAREME.price_mwhc, ...(b.price_mwhc || {}) },
  };
}

export function shabFactor(surface: number, b: CeeBareme): number {
  if (surface < 70) return b.shab.lt70;
  if (surface < 90) return b.shab["70_90"];
  return b.shab.gte90;
}

export interface CeeInputs {
  cee_zone?: string | null;
  postal_code?: string | null;
  surface_m2?: number | string | null;
  color?: string | null;
}

export type CeePrime =
  | { source: "bareme"; amount: number; kwhc: number; zone: CeeZone; category: IncomeCategory; detail: string }
  | { source: "fiche"; amount: number; zone: CeeZone; missing: string[] }
  | { source: "aucune"; amount: null; missing: string[] };

/**
 * Prime CEE d'un dossier :
 * - barème Coup de pouce quand ETAS, zone, surface et catégorie de revenus sont connus ;
 * - sinon prime forfaitaire de la fiche PAC pour la zone (estimation) ;
 * - sinon aucune.
 */
export function ceePrime(model: PacModel | null | undefined, r: CeeInputs, bareme: CeeBareme): CeePrime {
  if (!model) return { source: "aucune", amount: null, missing: ["Modèle de PAC"] };
  const zone = zoneOf(r).zone;
  if (model.cee_mode === "forfait") {
    const flat = modelCee(model, zone) ?? sameEverywhere(model);
    return flat === null
      ? { source: "aucune", amount: null, missing: ["Zone H1/H2/H3"] }
      : { source: "fiche", amount: flat, zone: zone ?? "H1", missing: [] };
  }
  const surface = isBlank(r.surface_m2) ? null : Number(r.surface_m2);
  const category = incomeCategory(r.color);
  const missing: string[] = [];
  if (!model.etas_band) missing.push("ETAS de la PAC");
  if (!zone) missing.push("Zone H1/H2/H3");
  if (surface === null || !Number.isFinite(surface) || surface <= 0) missing.push("Surface habitable");
  if (!category) missing.push("Catégorie de revenus (couleur)");
  if (missing.length === 0 && model.etas_band && zone && category && surface !== null) {
    const kwhc = round2(
      bareme.kwhc[model.etas_band] * bareme.zone_factor[zone] * shabFactor(surface, bareme) * bareme.cdp_multiplier
    );
    const price = bareme.price_mwhc[category];
    const amount = round2((kwhc / 1000) * price);
    return {
      source: "bareme",
      amount,
      kwhc,
      zone,
      category,
      detail: `${kwhc.toLocaleString("fr-FR")} kWhc × ${price.toLocaleString("fr-FR")} €/MWhc (${category}, ${zone}, ${surface} m²)`,
    };
  }
  const flat = modelCee(model, zone);
  if (flat !== null && zone) return { source: "fiche", amount: flat, zone, missing };
  return { source: "aucune", amount: null, missing };
}

/** Prime forfaitaire identique dans les trois zones (utilisable sans connaître la zone). */
function sameEverywhere(m: PacModel): number | null {
  const v = [m.cee_h1, m.cee_h2, m.cee_h3];
  return v.every((x) => x !== null && x !== undefined) && v[0] === v[1] && v[1] === v[2] ? Number(v[0]) : null;
}

/** Montants numériques (PostgREST peut renvoyer les numeric en texte). */
export function normalizeModel(m: PacModel): PacModel {
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    ...m,
    cee_mode: m.cee_mode === "forfait" ? "forfait" : "bareme",
    cee_h1: n(m.cee_h1),
    cee_h2: n(m.cee_h2),
    cee_h3: n(m.cee_h3),
    cost_items: (Array.isArray(m.cost_items) ? m.cost_items : []).map((c) => ({ ...c, amount: Number(c.amount) || 0 })),
  };
}

export function modelCee(model: PacModel | null | undefined, zone: CeeZone | null): number | null {
  if (!model || !zone) return null;
  const v = zone === "H1" ? model.cee_h1 : zone === "H2" ? model.cee_h2 : model.cee_h3;
  return v === null || v === undefined ? null : Number(v);
}

/** Coûts de la fiche PAC regroupés par rubrique de la fiche client (montants tels que saisis, HT ou TTC). */
export function modelCosts(model: PacModel): Record<CostCategory, number> & { total: number } {
  const out = { materiel: 0, installation: 0, regie: 0, dossier: 0, total: 0 };
  for (const c of model.cost_items || []) {
    const a = num(c.amount);
    out[c.category] += a;
    out.total += a;
  }
  for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = round2(out[k]);
  return out;
}

/** Montants que la fiche PAC donnerait au dossier (prime selon la zone + coûts par rubrique). */
export function modelAmounts(
  model: PacModel,
  r: CeeInputs,
  bareme: CeeBareme
): Partial<Record<(typeof MONEY_FIELDS)[number], number>> {
  const costs = modelCosts(model);
  const out: Partial<Record<(typeof MONEY_FIELDS)[number], number>> = {};
  const cee = ceePrime(model, r, bareme).amount;
  if (cee !== null) out.benefit_cee = cee;
  for (const c of COST_CATEGORIES) if (costs[c.key] > 0) out[c.field] = costs[c.key];
  return out;
}

/**
 * Mise à jour proposée pour un dossier d'après sa fiche PAC.
 * - `fill` : seulement les montants vides ;
 * - `differs` : montants déjà saisis qui diffèrent de la fiche (remplacés si `replace`).
 */
export function modelPatch(
  model: PacModel,
  row: DossierMoney & CeeInputs,
  replace: boolean,
  bareme: CeeBareme
): { patch: Record<string, number>; differs: string[] } {
  const target = modelAmounts(model, row, bareme);
  const patch: Record<string, number> = {};
  const differs: string[] = [];
  for (const [field, value] of Object.entries(target)) {
    const cur = row[field as keyof DossierMoney];
    // Régie à 0 = valeur par défaut de la fiche : considérée comme vide.
    const empty = isBlank(cur) || (field === "regie_cost" && num(cur) === 0);
    if (empty) patch[field] = value as number;
    else if (round2(num(cur)) !== value) {
      differs.push(field);
      if (replace) patch[field] = value as number;
    }
  }
  return { patch, differs };
}

/** Ce qui manque pour que la rentabilité du dossier soit fiable. */
export function missingInfo(
  m: DossierMoney & {
    installateur?: string | null;
    installation_type?: string | null;
    pac_model_id?: string | null;
    cee_zone?: string | null;
    postal_code?: string | null;
    surface_m2?: number | string | null;
    color?: string | null;
  }
): string[] {
  const out: string[] = [];
  if (needsPac(m.installation_type) && !m.pac_model_id) out.push("Modèle de PAC");
  if (isBlank(m.benefit_cee)) {
    out.push("Prime CEE");
    // Ce qu'il faut pour que la prime soit calculée par le barème.
    if (m.pac_model_id) {
      if (!zoneOf(m).zone) out.push("Zone H1/H2/H3");
      if (isBlank(m.surface_m2)) out.push("Surface");
      if (!incomeCategory(m.color)) out.push("Catégorie de revenus");
    }
  }
  if (!num(m.installation_cost)) out.push("Coût installation");
  if (!num(m.material_cost)) out.push("Coût matériel");
  if (!m.installateur) out.push("Installateur");
  return out;
}

function parseMoney(raw: unknown, label: string): number | null | { error: string } {
  if (raw === null || raw === "" || raw === undefined) return null;
  const n = Number(typeof raw === "string" ? raw.replace(",", ".") : raw);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return { error: `${label} invalide` };
  return round2(n);
}

/** Validation des saisies d'une fiche PAC. */
export function parsePacModelInput(
  body: unknown,
  creating: boolean
): { values: Record<string, unknown> } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  if (creating || "name" in b) {
    const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return { error: "Nom du modèle obligatoire" };
    if (name.length > 120) return { error: "Nom trop long" };
    values.name = name;
  }
  for (const z of ["cee_h1", "cee_h2", "cee_h3"] as const) {
    if (!(z in b)) continue;
    const v = parseMoney(b[z], `Prime ${z.slice(4).toUpperCase()}`);
    if (v !== null && typeof v === "object") return v;
    values[z] = v;
  }
  if ("cost_items" in b) {
    if (!Array.isArray(b.cost_items) || b.cost_items.length > 30) return { error: "Postes de coût invalides" };
    const items: CostItem[] = [];
    for (const raw of b.cost_items as Record<string, unknown>[]) {
      const label = typeof raw?.label === "string" ? raw.label.trim() : "";
      if (!label) return { error: "Chaque poste de coût doit avoir un libellé" };
      const amount = parseMoney(raw.amount, `Montant « ${label} »`);
      if (amount !== null && typeof amount === "object") return amount;
      const basis = raw.basis === "TTC" ? "TTC" : "HT";
      const category = COST_CATEGORIES.some((c) => c.key === raw.category) ? (raw.category as CostCategory) : "materiel";
      items.push({ label: label.slice(0, 120), amount: amount ?? 0, basis, category });
    }
    values.cost_items = items;
  }
  if ("etas_band" in b) {
    if (b.etas_band !== null && b.etas_band !== "" && !ETAS_BANDS.some((e) => e.key === b.etas_band))
      return { error: "Tranche d'ETAS invalide" };
    values.etas_band = b.etas_band || null;
  }
  if ("cee_mode" in b) {
    if (b.cee_mode !== "bareme" && b.cee_mode !== "forfait") return { error: "Mode de prime invalide" };
    values.cee_mode = b.cee_mode;
  }
  if ("active" in b) values.active = b.active === true;
  if (!creating && Object.keys(values).length === 0) return { error: "Rien à modifier" };
  return { values };
}

export interface DossierRow extends DossierMoney, DossierFlags {
  id: string;
  pac_model_id: string | null;
  cee_zone: string | null;
  surface_m2: number | null;
  color: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  postal_code: string | null;
  installateur: string | null;
  delegataire_group: string | null;
  installation_type: string | null;
  category: string | null;
  installed_at: string | null;
  chantier_comment: string | null;
  /** Factures fournisseurs rattachées au client (HT). */
  supplier_invoices_ht: number;
  supplier_invoices_count: number;
}

export interface StageSummary {
  key: DossierStage;
  label: string;
  count: number;
  revenue: number;
  margin: number;
}

export interface DossiersSummary {
  count: number;
  complete: number;
  incomplete: number;
  revenue: number;
  cost: number;
  margin: number;
  /** Marge moyenne des dossiers complets (montants tous renseignés). */
  avgMargin: number;
  /** Primes encore à encaisser (dossiers non payés et non bloqués). */
  toCollect: number;
  collected: number;
  stages: StageSummary[];
}

export function summarize(rows: DossierRow[]): DossiersSummary {
  const stages: StageSummary[] = DOSSIER_STAGES.map((s) => ({ key: s.key, label: s.label, count: 0, revenue: 0, margin: 0 }));
  const byKey = new Map(stages.map((s) => [s.key, s]));
  let revenue = 0, cost = 0, margin = 0, complete = 0, toCollect = 0, collected = 0, completeMargin = 0;
  for (const r of rows) {
    const rev = revenueOf(r);
    const c = costOf(r);
    const p = computeProfitability(r);
    const stage = dossierStage(r);
    const s = byKey.get(stage)!;
    s.count += 1;
    s.revenue += rev;
    s.margin += p;
    const isComplete = missingInfo(r).length === 0;
    if (isComplete) {
      complete += 1;
      completeMargin += p;
    }
    revenue += rev;
    cost += c;
    margin += p;
    if (stage === "paye") collected += rev;
    else if (stage !== "bloque") toCollect += rev;
  }
  for (const s of stages) {
    s.revenue = round2(s.revenue);
    s.margin = round2(s.margin);
  }
  return {
    count: rows.length,
    complete,
    incomplete: rows.length - complete,
    revenue: round2(revenue),
    cost: round2(cost),
    margin: round2(margin),
    avgMargin: complete ? round2(completeMargin / complete) : 0,
    toCollect: round2(toCollect),
    collected: round2(collected),
    stages,
  };
}
