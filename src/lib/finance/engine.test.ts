import { describe, expect, it } from "vitest";
import {
  buildCostLines,
  computeProfitability,
  evaluateChantier,
  marginAlertLevel,
  roundMoney,
  selectCeeScale,
  sumCosts,
  toCents,
  type CeeScale,
  type ClimateZone,
  type StandardCostItem,
} from "./engine";

/** Coûts standards Méthode 1 — PAC Atlantic CEE (valeurs de référence RS Écologie). */
const PAC_ATLANTIC_COSTS: StandardCostItem[] = [
  { code: "pac_materiel", label: "PAC Atlantic + kit + ballon 200 L", category: "materiel", amount: 2000 },
  { code: "petites_fournitures", label: "Petites fournitures", category: "fournitures", amount: 700 },
  { code: "main_oeuvre", label: "Main-d'œuvre ouvriers", category: "main_oeuvre", amount: 700 },
  { code: "frais_dossier_cee", label: "Frais de dossier CEE", category: "dossier", amount: 70 },
  { code: "installation_employe", label: "Frais d'installation avec employé", category: "autres", amount: 200 },
];

const M = "pac_atlantic_cee";
const scale = (year: number, zone: ClimateZone, amount: number): CeeScale => ({
  id: `${year}-${zone}`,
  method_id: M,
  scale_year: year,
  climate_zone: zone,
  amount,
  valid_from: `${year}-01-01`,
  valid_to: `${year}-12-31`,
  validated: true,
});
const SCALES: CeeScale[] = [
  scale(2025, "H1", 8400),
  scale(2025, "H2", 8400),
  scale(2025, "H3", 8400),
  scale(2026, "H1", 7908),
  scale(2026, "H2", 6590),
  scale(2026, "H3", 4613),
];

const base = {
  methodId: M,
  methodConfigured: true,
  standardCosts: PAC_ATLANTIC_COSTS,
  scales: SCALES,
};

describe("coûts standards PAC Atlantic", () => {
  it("totalisent 3 670 €", () => {
    const costs = sumCosts(buildCostLines(PAC_ATLANTIC_COSTS));
    expect(costs).toEqual({
      materiel: 2000,
      fournitures: 700,
      main_oeuvre: 700,
      dossier: 70,
      autres: 200,
      total: 3670,
    });
  });

  it("appliquent un coût spécifique au chantier sans toucher au standard", () => {
    const lines = buildCostLines(PAC_ATLANTIC_COSTS, { pac_materiel: 2150 });
    const pac = lines.find((l) => l.code === "pac_materiel")!;
    expect(pac.amount).toBe(2150);
    expect(pac.standard_amount).toBe(2000);
    expect(pac.overridden).toBe(true);
    expect(sumCosts(lines).total).toBe(3820);
  });

  it("ajoute les autres coûts spécifiques à la catégorie « autres »", () => {
    const costs = sumCosts(buildCostLines(PAC_ATLANTIC_COSTS), 130.5);
    expect(costs.autres).toBe(330.5);
    expect(costs.total).toBe(3800.5);
  });
});

describe("marges de référence (tests de validation du moteur)", () => {
  const cases: [number, ClimateZone, number, number][] = [
    [2025, "H1", 8400, 4730],
    [2025, "H2", 8400, 4730],
    [2025, "H3", 8400, 4730],
    [2026, "H1", 7908, 4238],
    [2026, "H2", 6590, 2920],
    [2026, "H3", 4613, 943],
  ];
  it.each(cases)("barème %i %s : CEE %i € → marge brute %i €", (year, zone, cee, margin) => {
    const ev = evaluateChantier({ ...base, zone, engagementDate: `${year}-06-15` });
    expect(ev.status).toBe("calcule");
    expect(ev.scale?.scale_year).toBe(year);
    expect(ev.ceeForecast).toBe(cee);
    expect(ev.costs.total).toBe(3670);
    expect(ev.result?.revenue).toBe(cee);
    expect(ev.result?.gross_margin).toBe(margin);
    expect(ev.result?.margin_rate).toBe(Math.round((margin / cee) * 10000) / 100);
  });
});

describe("taux de marge", () => {
  it("est calculé sur le chiffre d'affaires, pas sur le coût (taux de marque ≠ marge sur coût)", () => {
    const r = computeProfitability({ totalCost: 3670, cee: 8400 });
    expect(r.margin_rate).toBe(56.31); // 4730 / 8400
    expect(r.margin_rate).not.toBe(128.88); // 4730 / 3670 (marge sur coût de revient)
  });

  it("intègre le reste à charge client et les autres recettes au CA", () => {
    const r = computeProfitability({ totalCost: 3670, cee: 6590, resteACharge: 500, otherRevenue: 100 });
    expect(r.revenue).toBe(7190);
    expect(r.gross_margin).toBe(3520);
  });

  it("est null quand le CA est nul (pas de division par zéro)", () => {
    expect(computeProfitability({ totalCost: 100, cee: 0 }).margin_rate).toBeNull();
  });
});

describe("arrondis monétaires", () => {
  it("évitent les erreurs des flottants", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(toCents(1.005)).toBe(101);
    expect(sumCosts([
      { category: "autres", amount: 0.1 },
      { category: "autres", amount: 0.2 },
    ]).total).toBe(0.3);
  });
});

describe("sélection du barème selon la date de signature du devis", () => {
  it("bascule au 1er janvier 2026", () => {
    expect(evaluateChantier({ ...base, zone: "H3", engagementDate: "2025-12-31" }).ceeForecast).toBe(8400);
    expect(evaluateChantier({ ...base, zone: "H3", engagementDate: "2026-01-01" }).ceeForecast).toBe(4613);
  });

  it("refuse de choisir entre deux barèmes qui se chevauchent", () => {
    const overlap = [...SCALES, { ...scale(2026, "H1", 9999), id: "dup" }];
    expect(selectCeeScale(overlap, M, "H1", "2026-03-01")).toEqual({ ok: false, reason: "plusieurs_baremes" });
  });

  it("ignore les barèmes d'une autre méthode", () => {
    const other = SCALES.map((s) => ({ ...s, method_id: "methode_2" }));
    expect(selectCeeScale(other, M, "H1", "2026-03-01").ok).toBe(false);
  });
});

describe("« Calcul en attente » plutôt qu'une valeur inventée", () => {
  it("sans date de signature du devis", () => {
    const ev = evaluateChantier({ ...base, zone: "H1", engagementDate: null });
    expect(ev.status).toBe("en_attente");
    expect(ev.result).toBeNull();
    expect(ev.pendingReasons).toContain("Date de signature du devis manquante");
    expect(ev.costs.total).toBe(3670); // les coûts restent connus
  });

  it("sans zone climatique", () => {
    const ev = evaluateChantier({ ...base, zone: null, zonePendingReason: "Commune ambiguë", engagementDate: "2026-02-01" });
    expect(ev.status).toBe("en_attente");
    expect(ev.pendingReasons).toEqual(["Commune ambiguë"]);
  });

  it("sans barème pour la date", () => {
    const ev = evaluateChantier({ ...base, zone: "H1", engagementDate: "2027-02-01" });
    expect(ev.status).toBe("en_attente");
    expect(ev.result).toBeNull();
  });

  it("pour une méthode non configurée (méthodes 2 et 3)", () => {
    const ev = evaluateChantier({
      methodId: "methode_2",
      methodConfigured: false,
      standardCosts: [],
      scales: [],
      zone: "H1",
      engagementDate: "2026-02-01",
    });
    expect(ev.status).toBe("en_attente");
    expect(ev.result).toBeNull();
  });

  it("un montant CEE confirmé permet le calcul même sans barème", () => {
    const ev = evaluateChantier({ ...base, zone: null, engagementDate: null, ceeConfirmed: 7000 });
    expect(ev.status).toBe("calcule");
    expect(ev.ceeForecast).toBe(7000);
    expect(ev.result?.gross_margin).toBe(3330);
  });

  it("le montant CEE confirmé prime sur le barème", () => {
    const ev = evaluateChantier({ ...base, zone: "H2", engagementDate: "2026-05-01", ceeConfirmed: 6500 });
    expect(ev.ceeScaleAmount).toBe(6590);
    expect(ev.ceeForecast).toBe(6500);
    expect(ev.result?.gross_margin).toBe(2830);
  });
});

describe("alertes de rentabilité", () => {
  it("rouge < 1 000 €, orange 1 000–2 000 €, vert > 2 000 €", () => {
    expect(marginAlertLevel(943)).toBe("rouge");
    expect(marginAlertLevel(999.99)).toBe("rouge");
    expect(marginAlertLevel(1000)).toBe("orange");
    expect(marginAlertLevel(2000)).toBe("orange");
    expect(marginAlertLevel(2000.01)).toBe("vert");
    expect(marginAlertLevel(4730)).toBe("vert");
  });

  it("respecte des seuils personnalisés", () => {
    expect(marginAlertLevel(1500, { red_below: 2000, orange_below: 3000 })).toBe("rouge");
  });
});
