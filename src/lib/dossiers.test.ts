import { describe, expect, it } from "vitest";
import { computeProfitability, dossierStage, missingInfo, modelAmounts, modelCosts, modelPatch, parsePacModelInput, patchForStage, summarize, zoneOf, type DossierRow, type PacModel } from "./dossiers";

const row = (o: Partial<DossierRow>): DossierRow => ({
  id: "x", pac_model_id: "m1", cee_zone: null, first_name: "A", last_name: "B", city: null, postal_code: null, installateur: "Eco Klim",
  delegataire_group: null, installation_type: null, category: null, installed_at: null, chantier_comment: null,
  supplier_invoices_ht: 0, supplier_invoices_count: 0,
  benefit_cee: 6000, benefit_mpr: 0, installation_cost: 1500, material_cost: 2000, regie_cost: 0, ...o,
});

describe("dossiers", () => {
  it("déduit l'étape des cases chantier", () => {
    expect(dossierStage({})).toBe("a_deposer");
    expect(dossierStage({ is_depose: true })).toBe("depose");
    expect(dossierStage({ is_depose: true, is_controle_veritas: true })).toBe("controle");
    expect(dossierStage({ is_cee_paye: true })).toBe("paye");
    expect(dossierStage({ is_paye: true, is_rejete: true })).toBe("bloque");
  });

  it("les cases envoyées reproduisent l'étape choisie", () => {
    for (const s of ["a_deposer", "depose", "controle", "paye"] as const) {
      expect(dossierStage(patchForStage(s, {}))).toBe(s);
    }
    expect(patchForStage("bloque", { is_depose: true })).toEqual({ is_compte_bloque: true });
    expect(dossierStage({ is_depose: true, ...patchForStage("bloque", { is_depose: true }) })).toBe("bloque");
    // Sortie de blocage
    expect(patchForStage("depose", { is_compte_bloque: true }).is_compte_bloque).toBe(false);
  });

  it("calcule la rentabilité comme la fiche", () => {
    expect(computeProfitability({ benefit_cee: 6000, benefit_mpr: "1000", installation_cost: 1500, material_cost: 2000, regie_cost: 100 })).toBe(3400);
    expect(computeProfitability({})).toBe(0);
  });

  it("liste les informations manquantes", () => {
    expect(missingInfo(row({}))).toEqual([]);
    expect(missingInfo(row({ benefit_cee: null, installateur: null, material_cost: 0 }))).toEqual(["Prime CEE", "Zone H1/H2/H3", "Coût matériel", "Installateur"]);
  });

  it("agrège par étape", () => {
    const s = summarize([
      row({}),
      row({ is_paye: true }),
      row({ benefit_cee: null, installation_cost: null, material_cost: null }),
    ]);
    expect(s.count).toBe(3);
    expect(s.complete).toBe(2);
    expect(s.margin).toBe(5000);
    expect(s.avgMargin).toBe(2500);
    expect(s.collected).toBe(6000);
    expect(s.toCollect).toBe(6000);
    expect(s.stages.find((x) => x.key === "a_deposer")!.count).toBe(2);
  });

  it("modèle de PAC exigé seulement pour les installations PAC", () => {
    expect(missingInfo(row({ pac_model_id: null }))).toEqual(["Modèle de PAC"]);
    expect(missingInfo(row({ pac_model_id: null, installation_type: "pac_ballon" }))).toEqual(["Modèle de PAC"]);
    expect(missingInfo(row({ pac_model_id: null, installation_type: "ssc" }))).toEqual([]);
  });

  it("zone : manuelle, sinon d'après le code postal", () => {
    expect(zoneOf({ postal_code: "75011" }).zone).toBe("H1");
    expect(zoneOf({ postal_code: "33000" }).zone).toBe("H2");
    expect(zoneOf({ postal_code: "13001" }).zone).toBe("H3");
    expect(zoneOf({ postal_code: "20000" }).zone).toBe("H3");
    expect(zoneOf({ postal_code: null }).zone).toBeNull();
    expect(zoneOf({ postal_code: "33000", cee_zone: "H1" })).toEqual({ zone: "H1", manual: true });
  });

  const atlantic: PacModel = {
    id: "m1", name: "Atlantic Alfea Excellia S9", active: true, cee_h1: 9450, cee_h2: 7800, cee_h3: null,
    cost_items: [
      { label: "PAC", amount: 3200, basis: "HT", category: "materiel" },
      { label: "Installation", amount: 700, basis: "HT", category: "installation" },
      { label: "Employé chantier", amount: 600, basis: "TTC", category: "installation" },
      { label: "Régie commerciale", amount: 300, basis: "TTC", category: "regie" },
      { label: "Secrétariat CEE", amount: 70, basis: "TTC", category: "dossier" },
      { label: "Coût du lead", amount: 30, basis: "HT", category: "dossier" },
    ],
  };

  it("fiche PAC : coûts par rubrique et rentabilité", () => {
    expect(modelCosts(atlantic)).toEqual({ materiel: 3200, installation: 1300, regie: 300, dossier: 100, total: 4900 });
    const h1 = modelAmounts(atlantic, "H1");
    expect(h1).toEqual({ benefit_cee: 9450, material_cost: 3200, installation_cost: 1300, regie_cost: 300, dossier_cost: 100 });
    expect(computeProfitability(h1)).toBe(4550);
    expect(computeProfitability(modelAmounts(atlantic, "H2"))).toBe(2900);
    // Zone H3 sans prime : seuls les coûts sont proposés
    expect(modelAmounts(atlantic, "H3").benefit_cee).toBeUndefined();
  });

  it("fiche PAC : ne remplit que les montants vides, sauf remplacement demandé", () => {
    const r = { postal_code: "33000", benefit_cee: 8000, material_cost: null, installation_cost: 1300, regie_cost: 0, dossier_cost: null };
    expect(modelPatch(atlantic, r, false)).toEqual({
      patch: { material_cost: 3200, regie_cost: 300, dossier_cost: 100 },
      differs: ["benefit_cee"],
    });
    expect(modelPatch(atlantic, r, true).patch.benefit_cee).toBe(7800);
  });

  it("valide les saisies d'une fiche PAC", () => {
    expect(parsePacModelInput({ name: "  S9  atlantic ", cee_h1: "9450", cee_h2: "" }, true)).toEqual({ values: { name: "S9 atlantic", cee_h1: 9450, cee_h2: null } });
    expect(parsePacModelInput({ cost_items: [{ label: "Dégazeur", amount: "150", basis: "TTC", category: "materiel" }] }, false)).toEqual({
      values: { cost_items: [{ label: "Dégazeur", amount: 150, basis: "TTC", category: "materiel" }] },
    });
    expect("error" in parsePacModelInput({ name: "" }, true)).toBe(true);
    expect("error" in parsePacModelInput({ cee_h1: -3 }, false)).toBe(true);
    expect("error" in parsePacModelInput({ cost_items: [{ label: "", amount: 1 }] }, false)).toBe(true);
    expect("error" in parsePacModelInput({}, false)).toBe(true);
  });
});
