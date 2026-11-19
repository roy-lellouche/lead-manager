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
  lead_id: string | null;
  client_reference: string | null;
  client_name: string | null;
  client_department: string | null;
  lead_match: LeadMatch;
  order_reference: string | null;
  source_pages: string | null;
  payment_terms?: string | null;
  delivery_date?: string | null;
  parse_source?: string | null;
  lead?: InvoiceLead | null;
}

export type LeadMatch = "auto" | "manuel" | "a_associer" | "stock";

export interface InvoiceLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  postal_code: string | null;
  status?: string | null;
}

export function leadDisplayName(lead: Pick<InvoiceLead, "first_name" | "last_name">): string {
  return [lead.last_name?.trim().toUpperCase(), lead.first_name?.trim()].filter(Boolean).join(" ") || "Client";
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
  toLinkCount: number;
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
    toLinkCount: 0,
  };
  for (const inv of invoices) {
    if (inv.needs_review) t.toReviewCount++;
    if (inv.lead_match === "a_associer") t.toLinkCount++;
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

/* ── Rapprochement facture → client (lead) ─────────────────────────── */

/** Mots d'un nom de personne : sans accents ni casse, sans « client », « chez »… */
export function personTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]+/g, " ")
    .split(/[\s'-]+/)
    .filter((w) => w.length >= 2 && !["client", "cliente", "clients", "chez", "mr", "mme", "m", "monsieur", "madame"].includes(w));
}

export interface LeadCandidate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  postal_code: string | null;
  city?: string | null;
  status?: string | null;
}

/** Département sur 2 caractères (« 8 » → « 08 »), ou null. */
export function normalizeDepartment(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toUpperCase();
  if (/^\d{1}$/.test(s)) return `0${s}`;
  if (/^(\d{2}|2A|2B|97\d)$/.test(s)) return s;
  return null;
}

function postalMatchesDepartment(postal: string | null | undefined, dep: string): boolean | null {
  const p = (postal ?? "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(p)) return null;
  if (dep === "2A" || dep === "2B") return p.startsWith("20");
  return p.startsWith(dep);
}

export interface LeadMatchResult {
  leadId: string | null;
  match: LeadMatch;
  candidates: LeadCandidate[];
}

/**
 * Retrouve le lead désigné par la référence client d'une facture
 * (« CLIENT BAROUDI 60 » → nom BAROUDI, département 60).
 * Rattachement automatique seulement s'il n'y a qu'un candidat crédible.
 */
export function matchLead(
  clientName: string | null | undefined,
  department: string | null | undefined,
  leads: LeadCandidate[]
): LeadMatchResult {
  const tokens = personTokens(clientName);
  if (tokens.length === 0) return { leadId: null, match: clientName?.trim() ? "a_associer" : "stock", candidates: [] };
  const dep = normalizeDepartment(department);
  const joined = tokens.join("");

  const scored = leads
    .map((lead) => {
      const leadTokens = [...personTokens(lead.last_name), ...personTokens(lead.first_name)];
      const lastJoined = personTokens(lead.last_name).join("");
      const firstJoined = personTokens(lead.first_name).join("");
      let name = 0;
      if (tokens.every((t) => leadTokens.includes(t)) || joined === lastJoined || joined === firstJoined) name = 2;
      else if (tokens.some((t) => t.length >= 3 && leadTokens.includes(t))) name = 1;
      if (name === 0) return null;
      let score = name * 2;
      if (dep) {
        const same = postalMatchesDepartment(lead.postal_code, dep);
        if (same === false) return null;
        if (same === true) score += 3;
      }
      if (lead.status === "annule" || lead.status === "pas_eligible") score -= 2;
      return { lead, score, name };
    })
    .filter((x): x is { lead: LeadCandidate; score: number; name: number } => x !== null)
    .sort((a, b) => b.score - a.score);

  const candidates = scored.slice(0, 5).map((x) => x.lead);
  if (scored.length === 0) return { leadId: null, match: "a_associer", candidates };
  const [best, second] = scored;
  const clearWinner = !second || best.score - second.score >= 2;
  // Sans département sur la facture, on exige un nom complet et un seul candidat.
  const confident = dep ? best.score >= 5 : best.name === 2 && scored.length === 1;
  if (clearWinner && confident) return { leadId: best.lead.id, match: "auto", candidates };
  return { leadId: null, match: "a_associer", candidates };
}

/* ── Doublons possibles et synthèse par client ──────────────────────── */

export function clientKey(inv: Pick<SupplierInvoice, "lead_id" | "client_name" | "client_reference">): string | null {
  if (inv.lead_id) return `lead:${inv.lead_id}`;
  const t = personTokens(inv.client_name || inv.client_reference).join(" ");
  return t ? `ref:${t}` : null;
}

/**
 * Factures suspectes : même fournisseur, même client et même montant TTC
 * sous deux numéros différents (double facturation possible).
 */
export function suspectedDuplicates(invoices: SupplierInvoice[]): Map<string, string[]> {
  const groups = new Map<string, SupplierInvoice[]>();
  for (const inv of invoices) {
    const client = clientKey(inv);
    if (!client || inv.amount_ttc === null || Number(inv.amount_ttc) === 0) continue;
    const k = `${supplierKey(inv)}|${client}|${Number(inv.amount_ttc).toFixed(2)}`;
    groups.set(k, [...(groups.get(k) ?? []), inv]);
  }
  const out = new Map<string, string[]>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const inv of list) {
      out.set(inv.id, list.filter((o) => o.id !== inv.id).map((o) => o.invoice_number ?? "sans n°"));
    }
  }
  return out;
}

export interface ClientSummary {
  key: string;
  leadId: string | null;
  label: string;
  sublabel: string | null;
  kind: "lead" | "a_associer" | "stock";
  invoiceCount: number;
  totalHt: number;
  totalTtc: number;
  remaining: number;
  suppliers: string[];
}

/** Synthèse par client (chantier) : ce que chaque chantier a coûté en matériel. */
export function summarizeByClient(
  invoices: SupplierInvoice[],
  supplierNames: Record<string, string>,
  today: string
): ClientSummary[] {
  const map = new Map<string, ClientSummary>();
  for (const inv of invoices) {
    const ck = clientKey(inv);
    const key = ck ?? "stock";
    let s = map.get(key);
    if (!s) {
      const lead = inv.lead;
      s = {
        key,
        leadId: inv.lead_id,
        label: lead ? leadDisplayName(lead) : ck ? (inv.client_name || inv.client_reference || "Client").toUpperCase() : "Stock / sans client",
        sublabel: lead ? [lead.postal_code, lead.city].filter(Boolean).join(" ") || null : ck ? inv.client_reference : "Matériel non affecté à un chantier",
        kind: inv.lead_id ? "lead" : ck ? "a_associer" : "stock",
        invoiceCount: 0,
        totalHt: 0,
        totalTtc: 0,
        remaining: 0,
        suppliers: [],
      };
      map.set(key, s);
    }
    s.invoiceCount++;
    s.totalHt = round2(s.totalHt + Number(inv.amount_ht ?? inv.amount_ttc ?? 0));
    s.totalTtc = round2(s.totalTtc + Number(inv.amount_ttc ?? 0));
    if (invoiceStatus(inv, today) !== "payee") s.remaining = round2(s.remaining + remainingAmount(inv));
    const sName = (inv.supplier_id && supplierNames[inv.supplier_id]) || inv.supplier_name;
    if (sName && !s.suppliers.includes(sName)) s.suppliers.push(sName);
  }
  const order = { a_associer: 0, lead: 1, stock: 2 };
  return [...map.values()].sort((a, b) => order[a.kind] - order[b.kind] || b.totalTtc - a.totalTtc);
}

export interface SupplierInvoiceLine {
  id: string;
  position: number;
  reference: string | null;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  is_comment: boolean;
}

/* ── Virements fournisseurs ─────────────────────────────────────────── */

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  amount: number;
  paid_on: string;
  label: string | null;
  created_at: string;
  allocations: { invoice_id: string; amount: number; invoice_number: string | null }[];
}

export function paymentUnallocated(p: Pick<SupplierPayment, "amount" | "allocations">): number {
  return Math.max(0, round2(Number(p.amount) - p.allocations.reduce((n, a) => n + Number(a.amount), 0)));
}

/** Ordre d'imputation d'un virement : échéance la plus ancienne d'abord (même règle que la base). */
export function allocationOrder(a: SupplierInvoice, b: SupplierInvoice): number {
  const k = (v: string | null) => v ?? "9999-12-31";
  return (
    k(a.due_date).localeCompare(k(b.due_date)) ||
    k(a.invoice_date).localeCompare(k(b.invoice_date)) ||
    (a.invoice_number ?? "").localeCompare(b.invoice_number ?? "")
  );
}

/**
 * Aperçu de l'imputation d'un virement sur les factures ouvertes choisies.
 * Retourne le montant imputé par facture et ce qui reste en avance.
 */
export function simulateAllocation(
  invoices: SupplierInvoice[],
  amount: number,
  selectedIds?: Set<string> | null
): { allocations: { invoice: SupplierInvoice; amount: number; settles: boolean }[]; left: number } {
  let left = round2(Math.max(0, amount));
  const allocations: { invoice: SupplierInvoice; amount: number; settles: boolean }[] = [];
  const open = invoices
    .filter((inv) => Number(inv.amount_ttc ?? 0) > 0 && remainingAmount(inv) > 0)
    .filter((inv) => !selectedIds || selectedIds.has(inv.id))
    .sort(allocationOrder);
  for (const inv of open) {
    if (left <= 0) break;
    const due = remainingAmount(inv);
    const a = round2(Math.min(left, due));
    allocations.push({ invoice: inv, amount: a, settles: a >= due - 0.005 });
    left = round2(left - a);
  }
  return { allocations, left };
}
