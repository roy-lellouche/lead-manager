import { describe, expect, it } from "vitest";
import { computeProfitability, dossierStage, missingInfo, patchForStage, summarize, type DossierRow } from "./dossiers";

const row = (o: Partial<DossierRow>): DossierRow => ({
  id: "x", first_name: "A", last_name: "B", city: null, postal_code: null, installateur: "Eco Klim",
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
});
