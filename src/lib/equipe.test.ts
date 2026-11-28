import { describe, expect, it } from "vitest";
import { mondayOf, parseTeamInstallationInput, stockDeltas, toIsoDate } from "./equipe";

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";

describe("stockDeltas", () => {
  it("retire du stock à la création « pris du stock »", () => {
    expect([...stockDeltas(null, { product_id: P1, quantity: 2, stock_status: "stock" })]).toEqual([[P1, -2]]);
  });

  it("ne touche pas au stock pour « à commander » ou « commandé »", () => {
    expect(stockDeltas(null, { product_id: P1, quantity: 1, stock_status: "a_commander" }).size).toBe(0);
    expect(stockDeltas(null, { product_id: P1, quantity: 1, stock_status: "commande" }).size).toBe(0);
  });

  it("rend le stock à la suppression", () => {
    expect([...stockDeltas({ product_id: P1, quantity: 1, stock_status: "stock" }, null)]).toEqual([[P1, 1]]);
  });

  it("gère un changement de produit et de quantité", () => {
    const d = stockDeltas(
      { product_id: P1, quantity: 1, stock_status: "stock" },
      { product_id: P2, quantity: 2, stock_status: "stock" }
    );
    expect(d.get(P1)).toBe(1);
    expect(d.get(P2)).toBe(-2);
  });

  it("aucune variation si rien ne change", () => {
    const r = { product_id: P1, quantity: 1, stock_status: "stock" as const };
    expect(stockDeltas(r, r).size).toBe(0);
  });

  it("passer de « commandé » à « pris du stock » retire du stock", () => {
    const d = stockDeltas(
      { product_id: P1, quantity: 1, stock_status: "commande" },
      { product_id: P1, quantity: 1, stock_status: "stock" }
    );
    expect(d.get(P1)).toBe(-1);
  });
});

describe("parseTeamInstallationInput", () => {
  const base = { team: 1, install_date: "2026-12-01", client_name: "Dupont", product_id: P1, quantity: 1, stock_status: "stock" };

  it("accepte une saisie valide", () => {
    expect("value" in parseTeamInstallationInput(base)).toBe(true);
  });

  it("refuse une équipe inconnue ou un client vide", () => {
    expect("error" in parseTeamInstallationInput({ ...base, team: 5 })).toBe(true);
    expect("error" in parseTeamInstallationInput({ ...base, client_name: "  " })).toBe(true);
  });

  it("exige un produit du stock pour « pris du stock »", () => {
    expect("error" in parseTeamInstallationInput({ ...base, product_id: null })).toBe(true);
    expect(
      "value" in parseTeamInstallationInput({ ...base, product_id: null, product_label: "PAC X", stock_status: "a_commander" })
    ).toBe(true);
  });
});

describe("mondayOf", () => {
  it("renvoie le lundi de la semaine", () => {
    expect(toIsoDate(mondayOf(new Date(2026, 10, 28)))).toBe("2026-11-23"); // samedi
    expect(toIsoDate(mondayOf(new Date(2026, 10, 29)))).toBe("2026-11-23"); // dimanche
    expect(toIsoDate(mondayOf(new Date(2026, 10, 23)))).toBe("2026-11-23"); // lundi
  });
});

describe("toWinAnsi", () => {
  it("garde les accents français et simplifie le reste", async () => {
    const { toWinAnsi } = await import("./equipe-pdf");
    expect(toWinAnsi("Équipe à côté — œuvre")).toBe("Équipe à côté - œuvre");
    expect(toWinAnsi("Nguyễn 😀")).toBe("Nguyen ");
  });
});
