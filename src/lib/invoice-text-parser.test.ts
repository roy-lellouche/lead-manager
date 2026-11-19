import { describe, expect, it } from "vitest";
import { frNumber, isReliable, parseClientReference, parseInvoicesFromText, parseLines } from "./invoice-text-parser";

const FOOTER = `7 Rue des Exemples
94000 Ville
0100000000 - contact@fournisseur-test.com - TVA :
FR00000000000 - SIRET : 12345678900012 RCS Créteil - SAS au Capital de
10 000€
SAS FOURNITEST`;

const P1 = `RS ECOLOGIE
12 IMPASSE DES IFS
SIRET : 92165306900010
Facture FC26-0001
Date de la facture :
12/11/2026
Date d'échéance
30/12/2026
Source
D1126-1
LIGNE DESCRIPTION QUANTITÉ PRIX UNITAIRE MONTANT
#1 CLIENT DUPONT 60 — À LIVRER CHEZ X
#2 [PAC9] PAC MONOBLOC 9 KW
1,00 2 150,0000 2 150,00 €
#3 [TK28] TUBE ISOLE (CARTONNAGE = 98 M /
CARTONS)
196,00 1,9000 372,40 €
${FOOTER}
Page : 1 / 2`;

const P2 = `Montant hors taxes 2 412,40 €
TVA 20% 482,48 €
Total 2 894,88 €
#4 [REMEX] REMISE EXCEPTIONNELLE 1,00 -110,0000 -110,00 €
Conditions de paiement: Fin du mois suivant
${FOOTER}
Page : 2 / 2`;

const P3 = `Montant hors taxes 870,00 €
TVA 20% 174,00 €
Total 1 044,00 €
Facture FC26-0002
Date de la facture :
26/10/2026
Date d'échéance
30/11/2026
LIGNE DESCRIPTION QUANTITÉ PRIX UNITAIRE MONTANT
#1 [LIAI1/2] LIAISON FRIGORIFIQUE 1/4 1/2 20 M 6,00 145,0000 870,00 €
${FOOTER}
Page : 1 / 1`;

describe("lecture texte des factures", () => {
  it("découpe un relevé en factures et lit tout", () => {
    const inv = parseInvoicesFromText([P1, P2, P3]);
    expect(inv).toHaveLength(2);
    expect(inv[0]).toMatchObject({
      start_page: 1,
      end_page: 2,
      supplier_name: "FOURNITEST",
      supplier_siret: "12345678900012",
      invoice_number: "FC26-0001",
      invoice_date: "2026-11-12",
      due_date: "2026-12-30",
      order_reference: "D1126-1",
      payment_terms: "Fin du mois suivant",
      amount_ht: 2412.4,
      amount_tva: 482.48,
      amount_ttc: 2894.88,
      client_name: "DUPONT",
      client_department: "60",
    });
    expect(inv[0].lines.map((l) => [l.position, l.reference, l.quantity, l.unit_price, l.amount, l.is_comment])).toEqual([
      [1, null, null, null, null, true],
      [2, "PAC9", 1, 2150, 2150, false],
      [3, "TK28", 196, 1.9, 372.4, false],
      [4, "REMEX", 1, -110, -110, false],
    ]);
    expect(inv[1]).toMatchObject({ start_page: 3, end_page: 3, invoice_number: "FC26-0002", amount_ttc: 1044, client_reference: null });
    expect(isReliable(inv)).toBe(true);
  });

  it("refuse un résultat dont les lignes ne tombent pas sur le HT", () => {
    const inv = parseInvoicesFromText([P3.replace("870,00 €\nTVA", "900,00 €\nTVA")]);
    expect(isReliable(inv)).toBe(false);
  });

  it("répare une quantité collée à la désignation", () => {
    const [l] = parseLines("#1 PACK 12 196,00 1,9000 372,40 €");
    expect(l).toMatchObject({ description: "PACK 12", quantity: 196 });
  });

  it("références client", () => {
    expect(parseClientReference("client ben ali 92")).toEqual({ name: "ben ali", department: "92" });
    expect(parseClientReference("CLIENT MEICHER 08 12 TRIPHASE")).toEqual({ name: "MEICHER", department: "08" });
    expect(parseClientReference("CLIENT FLECHET CHEZ ECO K")).toEqual({ name: "FLECHET", department: null });
    expect(parseClientReference("GROMFLED 57")).toEqual({ name: "GROMFLED", department: "57" });
    expect(parseClientReference("8 KIT SANS THERMOSTAT")).toBeNull();
  });

  it("nombres français", () => {
    expect(frNumber("2 150,0000")).toBe(2150);
    expect(frNumber("-110,00")).toBe(-110);
  });
});
