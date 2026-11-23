/**
 * Suivi des dossiers installés : étape du pipeline (après installation) et
 * rentabilité simple de chaque dossier, à partir des champs « chantier » de la fiche.
 *
 * Rentabilité = CEE + MPR − coût installation − coût matériel − coût régie
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
}

const num = (v: unknown): number => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? 0 : n;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const MONEY_FIELDS = ["benefit_cee", "benefit_mpr", "installation_cost", "material_cost", "regie_cost"] as const;

/** Rentabilité du dossier (identique au calcul de la fiche client). */
export function computeProfitability(m: DossierMoney): number {
  return round2(
    num(m.benefit_cee) + num(m.benefit_mpr) - num(m.installation_cost) - num(m.material_cost) - num(m.regie_cost)
  );
}

export function revenueOf(m: DossierMoney): number {
  return round2(num(m.benefit_cee) + num(m.benefit_mpr));
}

export function costOf(m: DossierMoney): number {
  return round2(num(m.installation_cost) + num(m.material_cost) + num(m.regie_cost));
}

/** Ce qui manque pour que la rentabilité du dossier soit fiable. */
export function missingInfo(m: DossierMoney & { installateur?: string | null }): string[] {
  const out: string[] = [];
  if (m.benefit_cee === null || m.benefit_cee === undefined || m.benefit_cee === "") out.push("Prime CEE");
  if (!num(m.installation_cost)) out.push("Coût installation");
  if (!num(m.material_cost)) out.push("Coût matériel");
  if (!m.installateur) out.push("Installateur");
  return out;
}

export interface DossierRow extends DossierMoney, DossierFlags {
  id: string;
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
