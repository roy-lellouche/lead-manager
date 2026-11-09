/**
 * Sélection automatique de la méthode économique d'un chantier à partir de la
 * PAC Atlantic choisie sur la fiche (catalogue produits) et de son ETAS.
 *
 * Règles :
 * - Seuls les produits marqués « PAC Atlantic » dans le catalogue sont pris en compte.
 * - L'ETAS doit être renseigné ET validé dans le catalogue : sinon, confirmation demandée
 *   (jamais de valeur inventée).
 * - Chaque méthode déclare sa plage d'ETAS (min exclusif / max inclusif) et ses
 *   conditions d'éligibilité, qui doivent toutes être confirmées sur la fiche.
 * - La date de signature du devis doit tomber dans la période d'un barème de la méthode.
 * - L'ETAS seul ne suffit jamais à appliquer une méthode.
 */

export interface CatalogProduct {
  id: string;
  name: string;
  is_pac_atlantic: boolean;
  etas: number | null;
  etas_validated: boolean;
}

export interface SelectableMethod {
  id: string;
  name: string;
  is_configured: boolean;
  active: boolean;
  auto_select: boolean;
  etas_min_exclusive: number | null;
  etas_max_inclusive: number | null;
  eligibility_conditions: string[];
}

export interface ScalePeriod {
  method_id: string;
  valid_from: string;
  valid_to: string | null;
}

export type MethodSelection =
  | { status: "aucune_pac" }
  | { status: "plusieurs_pac"; products: CatalogProduct[] }
  | { status: "etas_a_confirmer"; product: CatalogProduct }
  | { status: "aucune_methode"; product: CatalogProduct; etas: number }
  | { status: "plusieurs_methodes"; product: CatalogProduct; etas: number; methods: SelectableMethod[] }
  | {
      status: "candidate";
      product: CatalogProduct;
      etas: number;
      method: SelectableMethod;
      /** Ce qui manque avant application automatique (vide = méthode applicable). */
      missing: string[];
    };

export function etasMatches(m: Pick<SelectableMethod, "etas_min_exclusive" | "etas_max_inclusive">, etas: number): boolean {
  if (m.etas_min_exclusive === null && m.etas_max_inclusive === null) return false;
  if (m.etas_min_exclusive !== null && !(etas > m.etas_min_exclusive)) return false;
  if (m.etas_max_inclusive !== null && !(etas <= m.etas_max_inclusive)) return false;
  return true;
}

export function selectMethod(input: {
  products: CatalogProduct[];
  methods: SelectableMethod[];
  /** Conditions cochées sur la fiche : methodId → condition → confirmée. */
  checks: Record<string, Record<string, boolean>>;
  engagementDate: string | null;
  scalePeriods: ScalePeriod[];
}): MethodSelection {
  const pacs = input.products.filter((p) => p.is_pac_atlantic);
  // Un même produit peut apparaître une seule fois ; plusieurs PAC différentes = ambigu.
  const unique = [...new Map(pacs.map((p) => [p.id, p])).values()];
  if (unique.length === 0) return { status: "aucune_pac" };
  if (unique.length > 1) return { status: "plusieurs_pac", products: unique };

  const product = unique[0];
  if (product.etas === null || !Number.isFinite(product.etas) || !product.etas_validated)
    return { status: "etas_a_confirmer", product };
  const etas = product.etas;

  const matches = input.methods.filter(
    (m) => m.active && m.is_configured && m.auto_select && etasMatches(m, etas)
  );
  if (matches.length === 0) return { status: "aucune_methode", product, etas };
  if (matches.length > 1) return { status: "plusieurs_methodes", product, etas, methods: matches };

  const method = matches[0];
  const missing: string[] = [];
  const checks = input.checks[method.id] || {};
  for (const c of method.eligibility_conditions) if (!checks[c]) missing.push(`Condition à confirmer : ${c}`);
  if (!input.engagementDate) missing.push("Date de signature du devis manquante");
  else {
    const d = input.engagementDate;
    const inPeriod = input.scalePeriods.some(
      (s) => s.method_id === method.id && s.valid_from <= d && (s.valid_to === null || d <= s.valid_to)
    );
    if (!inPeriod) missing.push(`Date du devis (${d}) hors de la période des barèmes de la méthode`);
  }
  return { status: "candidate", product, etas, method, missing };
}
