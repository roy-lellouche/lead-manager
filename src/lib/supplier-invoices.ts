/**
 * Suivi des factures fournisseurs : types et calculs purs (partagés client / serveur).
 */

export interface SupplierInvoice {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  amount_paid: number;
  paid_at: string | null;
  description: string | null;
  notes: string | null;
  needs_review: boolean;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  created_at: string;
}

export type InvoiceStatus = "payee" | "en_retard" | "partielle" | "a_payer";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  a_payer: "À payer",
  partielle: "Partiellement payée",
  en_retard: "En retard",
  payee: "Payée",
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  a_payer: "bg-blue-50 text-blue-700 border-blue-200",
  partielle: "bg-amber-50 text-amber-700 border-amber-200",
  en_retard: "bg-red-50 text-red-700 border-red-200",
  payee: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

/** Arrondi au centime, pour éviter les 0,0000001 € restants. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Date du jour (YYYY-MM-DD) à Paris. */
export function todayParis(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
}

/** Nombre de jours entre aujourd'hui et une date YYYY-MM-DD (négatif = passé). */
export function daysUntil(date: string, today: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function remainingAmount(inv: Pick<SupplierInvoice, "amount_ttc" | "amount_paid">): number {
  const ttc = Number(inv.amount_ttc ?? 0);
  const paid = Number(inv.amount_paid ?? 0);
  return Math.max(0, round2(ttc - paid));
}

export function invoiceStatus(
  inv: Pick<SupplierInvoice, "amount_ttc" | "amount_paid" | "due_date" | "paid_at">,
  today: string
): InvoiceStatus {
  const ttc = Number(inv.amount_ttc ?? 0);
  const paid = Number(inv.amount_paid ?? 0);
  if ((ttc > 0 && paid >= ttc - 0.005) || (ttc <= 0 && inv.paid_at)) return "payee";
  if (inv.due_date && inv.due_date < today) return "en_retard";
  if (paid > 0) return "partielle";
  return "a_payer";
}

/** Clé de comparaison d'un nom de fournisseur : sans accents, casse, ponctuation ni forme juridique. */
export function normalizeSupplierName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(sas|sasu|sarl|eurl|sa|sci|snc|ets|etablissements|societe|ste|france|groupe)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Retrouve un fournisseur existant correspondant au nom lu sur la facture. */
export function matchSupplier<T extends { id: string; name: string }>(
  name: string | null | undefined,
  suppliers: T[]
): T | undefined {
  if (!name) return undefined;
  const key = normalizeSupplierName(name);
  if (!key) return undefined;
  const exact = suppliers.find((s) => normalizeSupplierName(s.name) === key);
  if (exact) return exact;
  // « Point P » vs « Point P Saint-Denis » : l'un contient l'autre (au moins 4 caractères).
  return suppliers.find((s) => {
    const k = normalizeSupplierName(s.name);
    return k.length >= 4 && key.length >= 4 && (key.startsWith(k + " ") || k.startsWith(key + " "));
  });
}

export interface SupplierSummary {
  key: string;
  supplierId: string | null;
  name: string;
  invoiceCount: number;
  openCount: number;
  totalTtc: number;
  totalPaid: number;
  remaining: number;
  overdueAmount: number;
  overdueCount: number;
  nextDueDate: string | null;
}

export function supplierKey(inv: Pick<SupplierInvoice, "supplier_id" | "supplier_name">): string {
  return inv.supplier_id ?? `nom:${inv.supplier_name ?? ""}`;
}

/** Synthèse par fournisseur, triée par montant restant dû décroissant. */
export function summarizeBySupplier(
  invoices: SupplierInvoice[],
  supplierNames: Record<string, string>,
  today: string
): SupplierSummary[] {
  const map = new Map<string, SupplierSummary>();
  for (const inv of invoices) {
    const key = supplierKey(inv);
    let s = map.get(key);
    if (!s) {
      s = {
        key,
        supplierId: inv.supplier_id,
        name: (inv.supplier_id && supplierNames[inv.supplier_id]) || inv.supplier_name || "Fournisseur inconnu",
        invoiceCount: 0,
        openCount: 0,
        totalTtc: 0,
        totalPaid: 0,
        remaining: 0,
        overdueAmount: 0,
        overdueCount: 0,
        nextDueDate: null,
      };
      map.set(key, s);
    }
    const status = invoiceStatus(inv, today);
    const rest = remainingAmount(inv);
    s.invoiceCount++;
    s.totalTtc = round2(s.totalTtc + Number(inv.amount_ttc ?? 0));
    s.totalPaid = round2(s.totalPaid + Number(inv.amount_paid ?? 0));
    if (status !== "payee") {
      s.openCount++;
      s.remaining = round2(s.remaining + rest);
      if (status === "en_retard") {
        s.overdueCount++;
        s.overdueAmount = round2(s.overdueAmount + rest);
      } else if (inv.due_date && (!s.nextDueDate || inv.due_date < s.nextDueDate)) {
        s.nextDueDate = inv.due_date;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "fr"));
}

export interface InvoiceTotals {
  remaining: number;
  openCount: number;
  overdueAmount: number;
  overdueCount: number;
  dueSoonAmount: number;
  dueSoonCount: number;
  toReviewCount: number;
}

/** Indicateurs globaux. « Bientôt » = échéance dans les `soonDays` prochains jours. */
export function computeTotals(invoices: SupplierInvoice[], today: string, soonDays = 7): InvoiceTotals {
  const t: InvoiceTotals = {
    remaining: 0,
    openCount: 0,
    overdueAmount: 0,
    overdueCount: 0,
    dueSoonAmount: 0,
    dueSoonCount: 0,
    toReviewCount: 0,
  };
  for (const inv of invoices) {
    if (inv.needs_review) t.toReviewCount++;
    const status = invoiceStatus(inv, today);
    if (status === "payee") continue;
    const rest = remainingAmount(inv);
    t.openCount++;
    t.remaining = round2(t.remaining + rest);
    if (status === "en_retard") {
      t.overdueCount++;
      t.overdueAmount = round2(t.overdueAmount + rest);
    } else if (inv.due_date && daysUntil(inv.due_date, today) <= soonDays) {
      t.dueSoonCount++;
      t.dueSoonAmount = round2(t.dueSoonAmount + rest);
    }
  }
  return t;
}

/** Montant saisi en texte (« 1 234,56 », « 1234.56 € ») → nombre, ou null. */
export function parseAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? round2(v) : null;
  const s = String(v).replace(/[\s €]/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : null;
}

/** Date YYYY-MM-DD valide, ou null. */
export function parseIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export const INVOICE_ACCEPTED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
export const INVOICE_MAX_SIZE = 15 * 1024 * 1024;

/** Type MIME accepté pour un fichier déposé, ou null s'il n'est pas pris en charge. */
export function invoiceMimeType(fileName: string, mime: string | undefined): string | null {
  const m = (mime ?? "").toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  if (Object.values(INVOICE_ACCEPTED_TYPES).includes(m)) return m;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return INVOICE_ACCEPTED_TYPES[ext] ?? null;
}
