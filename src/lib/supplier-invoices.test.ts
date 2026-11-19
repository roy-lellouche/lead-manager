import { describe, expect, it } from "vitest";
import {
  computeTotals,
  daysUntil,
  invoiceMimeType,
  invoiceStatus,
  matchSupplier,
  normalizeSupplierName,
  parseAmount,
  parseIsoDate,
  remainingAmount,
  summarizeBySupplier,
  type SupplierInvoice,
} from "./supplier-invoices";
import { normalizePageRanges, toInvoiceFields } from "./supplier-invoices-ai";
import { matchLead, suspectedDuplicates, summarizeByClient, personTokens } from "./supplier-invoices";

const TODAY = "2026-11-19";

function inv(p: Partial<SupplierInvoice>): SupplierInvoice {
  return {
    id: Math.random().toString(),
    supplier_id: "s1",
    supplier_name: "Point P",
    invoice_number: null,
    invoice_date: "2026-11-01",
    due_date: "2026-12-01",
    amount_ht: null,
    amount_tva: null,
    amount_ttc: 1000,
    amount_paid: 0,
    paid_at: null,
    description: null,
    notes: null,
    needs_review: false,
    file_name: null,
    storage_path: null,
    mime_type: null,
    created_at: "2026-11-01T00:00:00Z",
    lead_id: null,
    client_reference: null,
    client_name: null,
    client_department: null,
    lead_match: "stock",
    order_reference: null,
    source_pages: null,
    ...p,
  };
}

describe("invoiceStatus", () => {
  it("distingue à payer, partielle, en retard et payée", () => {
    expect(invoiceStatus(inv({}), TODAY)).toBe("a_payer");
    expect(invoiceStatus(inv({ amount_paid: 300 }), TODAY)).toBe("partielle");
    expect(invoiceStatus(inv({ due_date: "2026-11-18" }), TODAY)).toBe("en_retard");
    expect(invoiceStatus(inv({ due_date: "2026-11-19" }), TODAY)).toBe("a_payer");
    expect(invoiceStatus(inv({ amount_paid: 1000, due_date: "2026-01-01" }), TODAY)).toBe("payee");
  });
  it("reste dû jamais négatif", () => {
    expect(remainingAmount(inv({ amount_paid: 1200 }))).toBe(0);
    expect(remainingAmount(inv({ amount_paid: 250.5 }))).toBe(749.5);
  });
});

describe("daysUntil", () => {
  it("compte en jours calendaires", () => {
    expect(daysUntil("2026-11-26", TODAY)).toBe(7);
    expect(daysUntil("2026-11-10", TODAY)).toBe(-9);
  });
});

describe("rapprochement fournisseur", () => {
  const suppliers = [
    { id: "a", name: "POINT.P" },
    { id: "b", name: "Atlantic France SAS" },
  ];
  it("ignore casse, accents, ponctuation et forme juridique", () => {
    expect(normalizeSupplierName("Établissements Dupont SARL")).toBe("dupont");
    expect(matchSupplier("Point P", suppliers)?.id).toBe("a");
    expect(matchSupplier("ATLANTIC", suppliers)?.id).toBe("b");
    expect(matchSupplier("Point P Saint-Denis", suppliers)?.id).toBe("a");
    expect(matchSupplier("Cedeo", suppliers)).toBeUndefined();
  });
});

describe("synthèses", () => {
  const list = [
    inv({ amount_ttc: 1000 }),
    inv({ amount_ttc: 500, due_date: "2026-11-10" }),
    inv({ amount_ttc: 200, amount_paid: 200 }),
    inv({ supplier_id: "s2", supplier_name: "Cedeo", amount_ttc: 300, due_date: "2026-11-22", needs_review: true }),
  ];
  it("par fournisseur", () => {
    const s = summarizeBySupplier(list, { s1: "Point P", s2: "Cedeo" }, TODAY);
    expect(s[0]).toMatchObject({ name: "Point P", invoiceCount: 3, openCount: 2, remaining: 1500, overdueAmount: 500, totalPaid: 200, nextDueDate: "2026-12-01" });
    expect(s[1]).toMatchObject({ name: "Cedeo", remaining: 300, nextDueDate: "2026-11-22" });
  });
  it("totaux", () => {
    expect(computeTotals(list, TODAY)).toEqual({
      remaining: 1800,
      openCount: 3,
      overdueAmount: 500,
      overdueCount: 1,
      dueSoonAmount: 300,
      dueSoonCount: 1,
      toReviewCount: 1,
      toLinkCount: 0,
    });
  });
});

describe("saisie", () => {
  it("montants et dates", () => {
    expect(parseAmount("1 234,56 €")).toBe(1234.56);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-02-28")).toBe("2026-02-28");
  });
  it("types de fichiers", () => {
    expect(invoiceMimeType("f.PDF", "")).toBe("application/pdf");
    expect(invoiceMimeType("photo", "image/jpg")).toBe("image/jpeg");
    expect(invoiceMimeType("f.heic", "image/heic")).toBeNull();
  });
});

describe("toInvoiceFields", () => {
  const base = {
    start_page: 1,
    end_page: 1,
    is_credit_note: false,
    order_reference: null,
    client_reference: "CLIENT BAROUDI 60",
    client_name: "BAROUDI",
    client_department: "60",
    supplier_name: "Point P",
    supplier_siret: null,
    delivery_date: null,
    payment_terms: null,
    lines: [],
    invoice_number: "F-12",
    invoice_date: "2026-11-01",
    due_date: null,
    amount_ht: 1000,
    amount_tva: 200,
    amount_ttc: null,
    description: "Isolant",
  };
  it("complète le TTC et l'échéance", () => {
    const f = toInvoiceFields(base);
    expect(f).toMatchObject({ amount_ttc: 1200, due_date: "2026-11-01", needs_review: false, client_department: "60" });
  });
  it("demande une vérification si incohérent ou incomplet", () => {
    expect(toInvoiceFields({ ...base, amount_ttc: 5000 }).needs_review).toBe(true);
    expect(toInvoiceFields({ ...base, supplier_name: null }).needs_review).toBe(true);
    expect(toInvoiceFields({ ...base, client_reference: null }).client_name).toBeNull();
  });
});

describe("matchLead", () => {
  const leads = [
    { id: "baroudi", first_name: "Zin", last_name: "Baroudi", postal_code: "60180", status: "installe" },
    { id: "boudemia", first_name: "Baroudi", last_name: "Boudemia", postal_code: null, status: "a_rappeler" },
    { id: "benali-m", first_name: "MONIQUE", last_name: "BEN ALI", postal_code: "92160", status: "installe" },
    { id: "benali-s", first_name: "soufiane", last_name: "benali", postal_code: null, status: "annule" },
    { id: "lamy-31", first_name: "lamy", last_name: "nathalie", postal_code: "31390", status: "documents_recus" },
    { id: "lamy-54", first_name: "corinne", last_name: "lamy", postal_code: "54690", status: "valide" },
    { id: "lamy-x", first_name: "Stephen", last_name: "Lamy", postal_code: null, status: "annule" },
    { id: "ammar", first_name: "nadia ", last_name: "Ammar", postal_code: "61000", status: "installe" },
    { id: "meicher", first_name: "Thierry", last_name: "Meicher", postal_code: "08400", status: "valide" },
    { id: "royer-1", first_name: "Pascal", last_name: "Royer", postal_code: null, status: "annule" },
    { id: "royer-2", first_name: "Sébastien", last_name: "Royer", postal_code: null, status: "annule" },
  ];
  it("rattache grâce au nom et au département", () => {
    expect(matchLead("BAROUDI", "60", leads)).toMatchObject({ leadId: "baroudi", match: "auto" });
    expect(matchLead("BEN ALI", "92", leads)).toMatchObject({ leadId: "benali-m", match: "auto" });
    expect(matchLead("LAMY", "54", leads)).toMatchObject({ leadId: "lamy-54", match: "auto" });
    expect(matchLead("AMMAR NADIA", "61", leads)).toMatchObject({ leadId: "ammar", match: "auto" });
    expect(matchLead("MEICHER", "8", leads)).toMatchObject({ leadId: "meicher", match: "auto" });
  });
  it("laisse à associer quand c'est ambigu ou introuvable", () => {
    expect(matchLead("ROYER", "39", leads)).toMatchObject({ leadId: null, match: "a_associer" });
    expect(matchLead("LAMY", null, leads).match).toBe("a_associer");
    expect(matchLead("GROMFLED", "57", leads)).toMatchObject({ leadId: null, match: "a_associer", candidates: [] });
    expect(matchLead(null, null, leads).match).toBe("stock");
  });
  it("nettoie les références", () => {
    expect(personTokens("CLIENT Ben-Ali")).toEqual(["ben", "ali"]);
  });
});

describe("doublons et clients", () => {
  const a = inv({ invoice_number: "FC-1", client_name: "BAROUDI", client_reference: "client BAROUDI 60", amount_ttc: 3168, lead_id: "l1" });
  const b = inv({ invoice_number: "FC-2", client_name: "BAROUDI", client_reference: "client BAROUDI 60", amount_ttc: 3168, lead_id: "l1" });
  const c = inv({ invoice_number: "FC-3", amount_ttc: 3168 });
  it("repère une double facturation possible", () => {
    const d = suspectedDuplicates([a, b, c]);
    expect(d.get(a.id)).toEqual(["FC-2"]);
    expect(d.has(c.id)).toBe(false);
  });
  it("synthèse par client", () => {
    const s = summarizeByClient([a, b, c], {}, TODAY);
    expect(s.map((x) => [x.kind, x.invoiceCount, x.totalTtc])).toEqual([
      ["lead", 2, 6336],
      ["stock", 1, 3168],
    ]);
  });
  it("pages sans chevauchement", () => {
    expect(normalizePageRanges([{ start_page: 1, end_page: 3 }, { start_page: 3, end_page: 3 }, { start_page: 4, end_page: 9 }], 5)).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 3 },
      { start: 4, end: 5 },
    ]);
  });
});

describe("virements", () => {
  it("impute sur les échéances les plus anciennes, puis garde le reste en avance", async () => {
    const { simulateAllocation, paymentUnallocated } = await import("./supplier-invoices");
    const a = inv({ invoice_number: "A", due_date: "2026-12-30", amount_ttc: 1000 });
    const b = inv({ invoice_number: "B", due_date: "2026-10-30", amount_ttc: 500, amount_paid: 200 });
    const c = inv({ invoice_number: "C", due_date: "2026-11-12", amount_ttc: 800 });
    const paid = inv({ invoice_number: "D", due_date: "2026-01-01", amount_ttc: 100, amount_paid: 100 });
    const r = simulateAllocation([a, b, c, paid], 1500);
    expect(r.allocations.map((x) => [x.invoice.invoice_number, x.amount, x.settles])).toEqual([
      ["B", 300, true],
      ["C", 800, true],
      ["A", 400, false],
    ]);
    expect(r.left).toBe(0);
    const only = simulateAllocation([a, b, c], 2000, new Set([a.id]));
    expect(only.allocations.map((x) => x.amount)).toEqual([1000]);
    expect(only.left).toBe(1000);
    expect(paymentUnallocated({ amount: 2000, allocations: [{ invoice_id: "x", amount: 1000, invoice_number: "A" }] })).toBe(1000);
  });
});

describe("rapprochement par code postal et nom mal orthographié", () => {
  const leads = [
    { id: "lamy", first_name: "corinne", last_name: "lamy", postal_code: "54690", status: "valide" },
    { id: "leite-59300", first_name: "Sabine", last_name: "Putéanus LEITE", postal_code: "59300", status: "valide" },
    { id: "leite-x", first_name: "Paula", last_name: "leite", postal_code: null, status: "nrp" },
    { id: "gromfeld", first_name: "BERNADETTE", last_name: "GROMFELD", postal_code: "57560", status: "valide" },
    { id: "gromfeld-x", first_name: "Gromfeld", last_name: "Inconnu", postal_code: null, status: "nrp" },
  ];
  it("tolère une faute quand le code postal est identique", () => {
    expect(matchLead("LAMI", "54", leads, "54690")).toMatchObject({ leadId: "lamy", match: "auto" });
    expect(matchLead("GROMFLED", "57", leads, "57560")).toMatchObject({ leadId: "gromfeld", match: "auto" });
  });
  it("même département mais autre code postal : on demande confirmation", () => {
    expect(matchLead("LEITE", "59", leads, "59200").match).toBe("a_associer");
  });
});
