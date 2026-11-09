import { describe, expect, it } from "vitest";
import {
  buildCostLines,
  ceeVatSplit,
  evaluateChantier,
  marginAlertLevel,
  sumCosts,
  vatBreakdown,
  type CeeScale,
  type CeeVatConfig,
  type ClimateZone,
  type StandardCostItem,
} from "./engine";
import { selectMethod, type CatalogProduct, type SelectableMethod } from "./method-selection";

/** Méthode 2 — PAC Atlantic ETAS > 140 % : coûts fournis par RS Écologie, TVA 20 % récupérable. */
const M2_COSTS: StandardCostItem[] = [
  { code: "pac_materiel", label: "PAC Atlantic + kit + ballon 200 L", category: "materiel", amount: 3200, amount_basis: "HT", vat_rate: 20, vat_recovery_rate: 100 },
  { code: "petites_fournitures", label: "Petites fournitures", category: "fournitures", amount: 700, amount_basis: "TTC", vat_rate: 20, vat_recovery_rate: 100 },
  { code: "main_oeuvre", label: "Main-d'œuvre ouvriers", category: "main_oeuvre", amount: 700, amount_basis: "TTC", vat_rate: 20, vat_recovery_rate: 100 },
  { code: "frais_dossier_cee", label: "Frais de dossier CEE", category: "dossier", amount: 70, amount_basis: "HT", vat_rate: 20, vat_recovery_rate: 100 },
  { code: "installation_employe", label: "Frais d'installation avec employé", category: "autres", amount: 200, amount_basis: "HT", vat_rate: 20, vat_recovery_rate: 100 },
];
/** Prime CEE : montant HT, 50 % sans TVA + 50 % avec TVA 20 %. */
const CEE_VAT: CeeVatConfig = { basis: "HT", taxable_share: 50, vat_rate: 20 };
const M2 = "methode_2";
const scale = (zone: ClimateZone, amount: number): CeeScale => ({
  id: `m2-${zone}`, method_id: M2, scale_year: 2026, climate_zone: zone, amount,
  valid_from: "2026-01-01", valid_to: "2026-12-31", validated: false,
});
const M2_SCALES = [scale("H1", 9500), scale("H2", 7917), scale("H3", 5541)];

describe("Méthode 2 — contrôle arithmétique (montants d'origine, avant TVA)", () => {
  const costs = sumCosts(buildCostLines(M2_COSTS));
  it("total arithmétique des montants saisis = 4 870 € (bases mélangées)", () => {
    expect(costs.raw_total).toBe(4870);
  });
  it.each([
    ["H1", 9500, 4630],
    ["H2", 7917, 3047],
    ["H3", 5541, 671],
  ] as const)("zone %s : CEE %i € − 4 870 € = écart provisoire %i €", (_z, cee, gap) => {
    expect(cee - costs.raw_total).toBe(gap);
  });
});

describe("Méthode 2 — traitement de la TVA par poste", () => {
  it("convertit HT ↔ TTC selon la base de chaque poste", () => {
    const pac = vatBreakdown(3200, "HT", 20, 100);
    expect(pac).toEqual({ ht: 3200, ttc: 3840, vat: 640, recoverable_vat: 640, cost_price: 3200 });
    const four = vatBreakdown(700, "TTC", 20, 100);
    expect(four).toEqual({ ht: 583.33, ttc: 700, vat: 116.67, recoverable_vat: 116.67, cost_price: 583.33 });
  });

  it("gère une récupération partielle ou nulle de la TVA", () => {
    expect(vatBreakdown(1200, "TTC", 20, 50)).toMatchObject({ ht: 1000, vat: 200, recoverable_vat: 100, cost_price: 1100 });
    expect(vatBreakdown(1200, "TTC", 20, 0).cost_price).toBe(1200);
  });

  it("utilise un taux propre à chaque poste", () => {
    expect(vatBreakdown(1000, "HT", 5.5, 100).ttc).toBe(1055);
    expect(vatBreakdown(1000, "HT", 10, 100).ttc).toBe(1100);
  });

  it("totalise HT, TTC et coût de revient", () => {
    const c = sumCosts(buildCostLines(M2_COSTS));
    expect(c.total_ht).toBe(4636.66); // 3200 + 583,33 + 583,33 + 70 + 200
    expect(c.total_ttc).toBe(5564); // 3840 + 700 + 700 + 84 + 240
    expect(c.recoverable_vat).toBe(927.34);
    expect(c.total).toBe(4636.66); // TVA entièrement récupérée → coût de revient = HT
    expect(c.materiel).toBe(3200);
    expect(c.fournitures).toBe(583.33);
  });
});

describe("Méthode 2 — prime CEE : 50 % sans TVA + 50 % avec TVA 20 %", () => {
  it("montant HT : TVA collectée en plus", () => {
    expect(ceeVatSplit(9500, CEE_VAT)).toEqual({ ht: 9500, vat: 950, ttc: 10450 });
  });
  it("montant TTC : TVA extraite de la moitié taxable", () => {
    expect(ceeVatSplit(9500, { ...CEE_VAT, basis: "TTC" })).toEqual({ ht: 8708.33, vat: 791.67, ttc: 9500 });
  });
});

describe("Méthode 2 — marges après traitement de la TVA, zones H1/H2/H3", () => {
  const cases: [ClimateZone, number, number, number][] = [
    // zone, CEE, marge brute, taux
    ["H1", 9500, 4863.34, 51.19],
    ["H2", 7917, 3280.34, 41.43],
    ["H3", 5541, 904.34, 16.32],
  ];
  it.each(cases)("zone %s : CEE %i € → marge %d €", (zone, cee, margin, rate) => {
    const ev = evaluateChantier({
      methodId: M2, methodConfigured: true, standardCosts: M2_COSTS, scales: M2_SCALES,
      zone, engagementDate: "2026-04-15", ceeVat: CEE_VAT,
    });
    expect(ev.status).toBe("calcule");
    expect(ev.scale?.scale_year).toBe(2026);
    expect(ev.ceeForecast).toBe(cee);
    expect(ev.costs.total).toBe(4636.66);
    expect(ev.result?.revenue).toBe(cee);
    expect(ev.result?.gross_margin).toBe(margin);
    expect(ev.result?.margin_rate).toBe(rate);
    // trésorerie : encaissement TTC = CEE + TVA sur la moitié ; décaissement TTC = 5 564 €
    expect(ev.result?.cash_in_ttc).toBe(Math.round(cee * 1.1 * 100) / 100);
    expect(ev.costs.total_ttc).toBe(5564);
  });

  it("alertes : H1 et H2 vert, H3 rouge", () => {
    expect(marginAlertLevel(4863.34)).toBe("vert");
    expect(marginAlertLevel(3280.34)).toBe("vert");
    expect(marginAlertLevel(904.34)).toBe("rouge");
  });

  it("pas de barème 2025 pour la méthode 2 : calcul en attente", () => {
    const ev = evaluateChantier({
      methodId: M2, methodConfigured: true, standardCosts: M2_COSTS, scales: M2_SCALES,
      zone: "H1", engagementDate: "2025-06-01", ceeVat: CEE_VAT,
    });
    expect(ev.status).toBe("en_attente");
    expect(ev.result).toBeNull();
  });

  it("une hausse du prix PAC à 3 400 € HT s'applique aux nouveaux calculs", () => {
    const costs = M2_COSTS.map((c) => (c.code === "pac_materiel" ? { ...c, amount: 3400 } : c));
    expect(sumCosts(buildCostLines(costs)).total).toBe(4836.66);
  });
});

describe("Méthode 1 avec TVA 20 % récupérable (nouveaux chantiers)", () => {
  const M1_VAT: StandardCostItem[] = [
    ["pac_materiel", "materiel", 2000], ["petites_fournitures", "fournitures", 700], ["main_oeuvre", "main_oeuvre", 700],
    ["frais_dossier_cee", "dossier", 70], ["installation_employe", "autres", 200],
  ].map(([code, category, amount]) => ({
    code: code as string, label: code as string, category: category as StandardCostItem["category"],
    amount: amount as number, amount_basis: "TTC" as const, vat_rate: 20, vat_recovery_rate: 100,
  }));
  it("coût de revient HT = 3 058,33 €, marge 2026 H1 = 4 849,67 €", () => {
    const c = sumCosts(buildCostLines(M1_VAT));
    expect(c.raw_total).toBe(3670);
    expect(c.total_ttc).toBe(3670);
    expect(c.total).toBe(3058.33);
    const ev = evaluateChantier({
      methodId: "pac_atlantic_cee", methodConfigured: true, standardCosts: M1_VAT, zone: "H1", engagementDate: "2026-02-01",
      scales: [{ id: "x", method_id: "pac_atlantic_cee", scale_year: 2026, climate_zone: "H1", amount: 7908, valid_from: "2026-01-01", valid_to: "2026-12-31", validated: true }],
      ceeVat: CEE_VAT,
    });
    expect(ev.result?.gross_margin).toBe(4849.67);
  });
});

describe("sélection automatique de la méthode selon l'ETAS", () => {
  const methods: SelectableMethod[] = [
    { id: "pac_atlantic_cee", name: "M1", is_configured: true, active: true, auto_select: true, etas_min_exclusive: null, etas_max_inclusive: 140, eligibility_conditions: [] },
    { id: M2, name: "M2", is_configured: true, active: true, auto_select: true, etas_min_exclusive: 140, etas_max_inclusive: null, eligibility_conditions: ["Logement de plus de 2 ans", "Fiche technique PAC vérifiée"] },
  ];
  const periods = [
    { method_id: "pac_atlantic_cee", valid_from: "2025-01-01", valid_to: "2026-12-31" },
    { method_id: M2, valid_from: "2026-01-01", valid_to: "2026-12-31" },
  ];
  const pac = (etas: number | null, validated = true): CatalogProduct => ({ id: "p1", name: "PAC", is_pac_atlantic: true, etas, etas_validated: validated });
  const run = (products: CatalogProduct[], checks = {}, date: string | null = "2026-03-01") =>
    selectMethod({ products, methods, checks, engagementDate: date, scalePeriods: periods });

  it("ETAS > 140 % → méthode 2, mais conditions à confirmer avant application", () => {
    const r = run([pac(146)]);
    expect(r.status).toBe("candidate");
    if (r.status === "candidate") {
      expect(r.method.id).toBe(M2);
      expect(r.missing).toHaveLength(2);
    }
  });

  it("ETAS > 140 % + conditions cochées + date 2026 → méthode 2 applicable", () => {
    const r = run([pac(146)], { [M2]: { "Logement de plus de 2 ans": true, "Fiche technique PAC vérifiée": true } });
    expect(r).toMatchObject({ status: "candidate", method: { id: M2 }, missing: [] });
  });

  it("ETAS = 140 % → méthode 1 (seuil strict)", () => {
    expect(run([pac(140)])).toMatchObject({ status: "candidate", method: { id: "pac_atlantic_cee" }, missing: [] });
  });

  it("devis 2025 hors période de la méthode 2", () => {
    const r = run([pac(150)], { [M2]: { "Logement de plus de 2 ans": true, "Fiche technique PAC vérifiée": true } }, "2025-10-01");
    expect(r.status === "candidate" && r.missing[0]).toMatch(/hors de la période/);
  });

  it("ETAS absent ou non validé → confirmation demandée, aucune valeur inventée", () => {
    expect(run([pac(null)]).status).toBe("etas_a_confirmer");
    expect(run([pac(150, false)]).status).toBe("etas_a_confirmer");
  });

  it("ignore les produits qui ne sont pas des PAC Atlantic ; plusieurs PAC = ambigu", () => {
    expect(run([{ ...pac(150), is_pac_atlantic: false }]).status).toBe("aucune_pac");
    expect(run([pac(150), { ...pac(130), id: "p2" }]).status).toBe("plusieurs_pac");
  });
});
