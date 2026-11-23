import { describe, expect, it } from "vitest";
import { computeProfitability, dossierStage, gridCee, missingInfo, parsePacModelInput, patchForStage, summarize, type DossierRow } from "./dossiers";

const row = (o: Partial<DossierRow>): DossierRow => ({
  id: "x", pac_model_id: "m1", first_name: "A", last_name: "B", city: null, postal_code: null, installateur: "Eco Klim",
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
    expect(missingInfo(row({ benefit_cee: null, installateur: null, material_cost: 0 }))).toEqual(["Prime CEE", "Coût matériel", "Installateur"]);
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

  it("prime de la grille selon la PAC", () => {
    const models = [{ id: "m1", name: "S9", cee_amount: 8400, active: true }, { id: "m2", name: "X", cee_amount: null, active: true }];
    expect(gridCee("m1", models)).toBe(8400);
    expect(gridCee("m2", models)).toBeNull();
    expect(gridCee(null, models)).toBeNull();
  });

  it("valide les saisies de la grille", () => {
    expect(parsePacModelInput({ name: "  S9  atlantic ", cee_amount: "8400,5" }, true)).toEqual({ values: { name: "S9 atlantic", cee_amount: 8400.5 } });
    expect(parsePacModelInput({ cee_amount: "" }, false)).toEqual({ values: { cee_amount: null } });
    expect("error" in parsePacModelInput({ name: "" }, true)).toBe(true);
    expect("error" in parsePacModelInput({ cee_amount: -3 }, false)).toBe(true);
    expect("error" in parsePacModelInput({}, false)).toBe(true);
  });
});
