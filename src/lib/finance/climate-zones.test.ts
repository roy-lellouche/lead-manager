import { describe, expect, it } from "vitest";
import {
  DEPARTMENT_CLIMATE_ZONES,
  normalizeCommuneName,
  resolveZoneFromCommunes,
  zoneForDepartment,
} from "./climate-zones";

describe("table départements → zones", () => {
  it("couvre exactement les 96 départements métropolitains", () => {
    const expected = [
      ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, "0")).filter((d) => d !== "20"),
      "2A",
      "2B",
    ];
    expect(Object.keys(DEPARTMENT_CLIMATE_ZONES).sort()).toEqual(expected.sort());
  });

  it("donne quelques zones connues", () => {
    expect(zoneForDepartment("75")).toBe("H1");
    expect(zoneForDepartment("33")).toBe("H2");
    expect(zoneForDepartment("13")).toBe("H3");
    expect(zoneForDepartment("2a")).toBe("H3");
    expect(zoneForDepartment("971")).toBeNull();
  });
});

describe("résolution de la zone depuis le code postal + commune", () => {
  // 05110 : communes des Alpes-de-Haute-Provence (04 → H2) et des Hautes-Alpes (05 → H1).
  const c05110 = [
    { nom: "Claret", code: "04058", codeDepartement: "04" },
    { nom: "Curbans", code: "04066", codeDepartement: "04" },
    { nom: "La Saulce", code: "05162", codeDepartement: "05" },
    { nom: "Vitrolles", code: "05184", codeDepartement: "05" },
  ];

  it("ne déduit pas la zone du préfixe du code postal", () => {
    const r = resolveZoneFromCommunes(c05110, "Claret");
    expect(r).toMatchObject({ status: "ok", zone: "H2", insee_code: "04058", department_code: "04" });
  });

  it("identifie la commune malgré accents/majuscules/tirets", () => {
    expect(resolveZoneFromCommunes(c05110, "LA-SAULCE")).toMatchObject({ status: "ok", zone: "H1" });
  });

  it("demande confirmation si la commune est ambiguë", () => {
    const r = resolveZoneFromCommunes(c05110, "");
    expect(r.status).toBe("ambigu");
    if (r.status === "ambigu") expect(r.candidates).toHaveLength(4);
  });

  it("ne demande rien si toutes les communes sont dans la même zone", () => {
    const r = resolveZoneFromCommunes(
      [
        { nom: "Ajaccio", code: "2A004", codeDepartement: "2A" },
        { nom: "Bastia", code: "2B033", codeDepartement: "2B" },
      ],
      "Inconnue"
    );
    expect(r).toMatchObject({ status: "ok", zone: "H3" });
  });

  it("signale un code postal inconnu ou outre-mer", () => {
    expect(resolveZoneFromCommunes([], "X").status).toBe("introuvable");
    expect(
      resolveZoneFromCommunes([{ nom: "Saint-Denis", code: "97411", codeDepartement: "974" }], "Saint-Denis").status
    ).toBe("introuvable");
  });

  it("normalise St/Ste", () => {
    expect(normalizeCommuneName("St-Étienne")).toBe("saint etienne");
    expect(normalizeCommuneName("Ste Foy")).toBe("sainte foy");
  });
});
