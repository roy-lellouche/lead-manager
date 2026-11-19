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
import { toInvoiceFields } from "./supplier-invoices-ai";

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
    is_invoice: true,
    supplier_name: "Point P",
    supplier_siret: null,
    invoice_number: "F-12",
    invoice_date: "2026-11-01",
    due_date: null,
    amount_ht: 1000,
    amount_tva: 200,
    amount_ttc: null,
    amount_already_paid: null,
    description: "Isolant",
  };
  it("complète le TTC et l'échéance", () => {
    const f = toInvoiceFields(base);
    expect(f).toMatchObject({ amount_ttc: 1200, due_date: "2026-11-01", amount_paid: 0, needs_review: false });
  });
  it("demande une vérification si incohérent ou incomplet", () => {
    expect(toInvoiceFields({ ...base, amount_ttc: 5000 }).needs_review).toBe(true);
    expect(toInvoiceFields({ ...base, supplier_name: null }).needs_review).toBe(true);
    expect(toInvoiceFields({ ...base, is_invoice: false }).needs_review).toBe(true);
  });
});
