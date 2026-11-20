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

describe("format « Numéro / Envoyée par » (Pennylane, Qonto, Tiime…)", () => {
  const page = (num: string, client: string, address: string, rows: string, total: string) => `Facture
Numéro ${num}
Date d’émission 02 nov. 2026
Date d’échéance 02 déc. 2026
Envoyée par
POSEURS SAS
1 RUE DU TEST
93000 VILLE - France
À destination de
RS ECOLOGIE
921653069
12 IMPASSE DES IFS
95200 SARCELLES - France
N° de TVA FR21921653069
${client}
${address}
Produits Quantité Prix u. HT TVA (%) Total HT
${rows}
Détails TVA
Taux Montant TVA Base HT
Aucune 0,00 € ${total}
Récapitulatif
Total HT ${total}
Total TVA 0,00 €
Total TTC ${total}
Référence PLXXXX
POSEURS | SAS, société par actions simplifiée | N° SIREN 111.222.333 1 / 1`;

  it("une facture par page, lignes, client et code postal du chantier", () => {
    const inv = parseInvoicesFromText([
      page("F-2026-1", "DURAND", "58 All. des Plantes, 54690 Eulmont, France", "INSTALLATION PAC 1 unité 2 600,00 € Aucune 2 600,00 €", "2 600,00 €"),
      page(
        "F-2026-2",
        "MARTIN",
        "20 Rue Haute, 59127 Élincourt, France",
        "INSTALLATION PAC 1 unité 2 600,00 € Aucune 2 600,00 €\nPOSE POMPE A CHALEUR FOURNIE 1 unité 2 500,00 € Aucune 2 500,00 €\nAVEC ACCESSOIRES",
        "5 100,00 €"
      ),
    ]);
    expect(inv).toHaveLength(2);
    expect(inv[0]).toMatchObject({
      invoice_number: "F-2026-1",
      supplier_name: "POSEURS SAS",
      supplier_siret: "111222333",
      invoice_date: "2026-11-02",
      due_date: "2026-12-02",
      amount_ht: 2600,
      amount_tva: 0,
      amount_ttc: 2600,
      client_name: "DURAND",
      client_department: "54",
      client_postal_code: "54690",
    });
    expect(inv[1].lines.map((l) => [l.description, l.quantity, l.unit_price, l.amount])).toEqual([
      ["INSTALLATION PAC", 1, 2600, 2600],
      ["POSE POMPE A CHALEUR FOURNIE AVEC ACCESSOIRES", 1, 2500, 2500],
    ]);
    expect(isReliable(inv)).toBe(true);
  });

  it("dates en lettres", async () => {
    const { frDate } = await import("./invoice-text-parser");
    expect(frDate("02 déc. 2026")).toBe("2026-12-02");
    expect(frDate("1er février 2027")).toBe("2027-02-01");
    expect(frDate("5/3/2026")).toBe("2026-03-05");
  });
});

describe("format à libellés doublés, fournisseur seulement en pied de page", () => {
  const p1 = `RS ECOLOGIE
12 IMP DES IFS
95200 SARCELLES
SIRET : 92165306900010
Facture FAC/2026/00999
Date de la facture :Date de la facture :
17/06/2026
Date d'échéance :Date d'échéance :
01/07/2026
DESCRIPTION QUANTITÉ PRIX UNITAIRE TAXES MONTANT
POSE PAC 1,00 2 500,00 2 500,00 €
MARTIN 81
POSE BALLON 1,00 100,00 TVA 0% 100,00 €
Montant hors taxes 2 600,00 €
TVA 0% sur 100,00 € 0,00 €
TotalTotal 2 600,002 600,00 €€
POSETOUT
POSETOUT -27 rue des Lilas, 93220 Gagny - 06 00 00 00 00 -
contact.posetout@gmail.com
SAS au capital de 20000 € - SIRET : 880 461 041 00019 -APE : 4321A
FAC/2026/00999, Page : 1 / 2`;
  const p2 = `Conditions générales…
POSETOUT -27 rue des Lilas, 93220 Gagny
FAC/2026/00999, Page : 2 / 2`;

  it("lit fournisseur, dates, lignes et client", () => {
    const inv = parseInvoicesFromText([p1, p2]);
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({
      start_page: 1,
      end_page: 2,
      supplier_name: "POSETOUT",
      supplier_siret: "88046104100019",
      invoice_number: "FAC/2026/00999",
      invoice_date: "2026-06-17",
      due_date: "2026-07-01",
      amount_ht: 2600,
      amount_tva: 0,
      amount_ttc: 2600,
      client_name: "MARTIN",
      client_department: "81",
    });
    expect(inv[0].lines.filter((l) => !l.is_comment).map((l) => [l.description, l.amount])).toEqual([
      ["POSE PAC", 2500],
      ["POSE BALLON", 100],
    ]);
    expect(isReliable(inv)).toBe(true);
  });

  it("nom tiré d'une adresse gmail quand rien d'autre n'est trouvé", () => {
    const [inv] = parseInvoicesFromText([
      "Facture F-1\nDate de la facture : 01/01/2026\nTotal 10,00 €\nmail : ecoklim.compta@gmail.com",
    ]);
    expect(inv.supplier_name).toBe("ECOKLIM");
  });
});

describe("références client sur plusieurs lignes", () => {
  it("nom + département suivi de notes et d'adresse", async () => {
    const { parseTableLines } = await import("./invoice-text-parser");
    const lines = parseTableLines(`DESCRIPTION QUANTITÉ PRIX UNITAIRE TAXES MONTANT
POSE PAC 1,00 2 500,00 2 500,00 €
COUSIN 35 WOLF Lundi, 11 mai
4 Rue du Moulin, 35300 Fougères, France
POSE BALLON 1,00 100,00 TVA 0% 100,00 €
lapeyre
Montant hors taxes 2 600,00 €`);
    expect(lines.map((l) => [l.description, l.is_comment])).toEqual([
      ["POSE PAC", false],
      ["COUSIN 35 WOLF Lundi, 11 mai 4 Rue du Moulin, 35300 Fougères, France", true],
      ["POSE BALLON", false],
      ["lapeyre", true],
    ]);
  });
  it("le client et son code postal en ressortent", () => {
    const [inv] = parseInvoicesFromText([
      `Facture F-9\nDate de la facture : 01/01/2026\nDESCRIPTION QUANTITÉ PRIX UNITAIRE MONTANT\nPOSE PAC 1,00 2 500,00 2 500,00 €\nLEHURT PATRICK 35 RAC 3590EURO\nMontant hors taxes 2 500,00 €\nTotal 2 500,00 €`,
    ]);
    expect(inv).toMatchObject({ client_name: "LEHURT PATRICK", client_department: "35" });
    const [inv2] = parseInvoicesFromText([
      `Facture F-10\nDate de la facture : 01/01/2026\nDESCRIPTION QUANTITÉ PRIX UNITAIRE MONTANT\nPOSE PAC 1,00 2 500,00 2 500,00 €\nlapeyre\nMontant hors taxes 2 500,00 €\nTotal 2 500,00 €`,
    ]);
    expect(inv2).toMatchObject({ client_name: "lapeyre", client_department: null });
  });
});
