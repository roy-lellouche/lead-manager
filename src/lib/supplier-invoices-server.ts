import type { SupabaseClient } from "@supabase/supabase-js";
import { matchSupplier, personTokens, type LeadCandidate } from "@/lib/supplier-invoices";

export const SUPPLIER_INVOICES_BUCKET = "supplier-invoices";

export const SUPPLIER_INVOICE_COLUMNS =
  "id, supplier_id, supplier_name, invoice_number, invoice_date, due_date, amount_ht, amount_tva, amount_ttc, amount_paid, paid_at, description, notes, needs_review, file_name, storage_path, mime_type, created_at, lead_id, client_reference, client_name, client_department, lead_match, order_reference, source_pages, payment_terms, delivery_date, parse_source, lead:leads(id, first_name, last_name, city, postal_code, status)";

/** Cache des fournisseurs pour un dépôt : évite de relire la table à chaque facture d'un lot. */
export function supplierResolver(admin: SupabaseClient) {
  let list: { id: string; name: string }[] | null = null;
  return async (name: string | null | undefined): Promise<{ id: string; name: string } | null> => {
    const clean = name?.trim();
    if (!clean) return null;
    if (!list) list = (await admin.from("suppliers").select("id, name")).data ?? [];
    const found = matchSupplier(clean, list);
    if (found) return { id: found.id, name: found.name };
    const { data, error } = await admin.from("suppliers").insert({ name: clean }).select("id, name").single();
    if (error || !data) return null;
    list.push(data);
    return data;
  };
}

/**
 * Rattache un nom de fournisseur à la table suppliers : fournisseur existant
 * si le nom correspond, sinon création. Retourne null si le nom est vide.
 */
export async function resolveSupplierId(admin: SupabaseClient, name: string | null | undefined) {
  return supplierResolver(admin)(name);
}

/** Leads dont le nom ou le prénom contient l'un des mots donnés (candidats au rapprochement). */
export async function findLeadCandidates(admin: SupabaseClient, names: (string | null | undefined)[]): Promise<LeadCandidate[]> {
  const tokens = [...new Set(names.flatMap((n) => personTokens(n)).filter((t) => t.length >= 3))];
  if (tokens.length === 0) return [];
  const out = new Map<string, LeadCandidate>();
  for (let i = 0; i < tokens.length; i += 15) {
    const chunk = tokens.slice(i, i + 15);
    const { data } = await admin
      .from("leads")
      .select("id, first_name, last_name, postal_code, city, status")
      .or(chunk.flatMap((t) => [`last_name.ilike.%${t}%`, `first_name.ilike.%${t}%`]).join(","))
      .limit(1000);
    for (const l of data ?? []) out.set(l.id, l);
  }
  return [...out.values()];
}

/** Extrait les pages [start, end] (1-indexées) d'un PDF dans un nouveau PDF. */
export async function extractPdfPages(src: Uint8Array, start: number, end: number): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(src, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  const pages = await out.copyPages(doc, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}
