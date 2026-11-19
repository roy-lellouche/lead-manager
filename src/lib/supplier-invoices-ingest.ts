import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isReliable, parseInvoicesFromText, type ParsedInvoice } from "@/lib/invoice-text-parser";
import {
  extractInvoicesWithAI,
  MAX_PDF_PAGES,
  normalizePageRanges,
  pdfPageTexts,
  toInvoiceFields,
} from "@/lib/supplier-invoices-ai";
import { matchLead, type LeadMatch } from "@/lib/supplier-invoices";
import {
  extractPdfPages,
  findLeadCandidates,
  supplierResolver,
  SUPPLIER_INVOICE_COLUMNS,
  SUPPLIER_INVOICES_BUCKET,
} from "@/lib/supplier-invoices-server";

export interface DocumentAnalysis {
  invoices: ParsedInvoice[];
  source: "texte" | "ia" | null;
  totalPages: number;
  error: string | null;
}

/**
 * Lit toutes les factures d'un document.
 * 1. PDF avec texte : lecture directe (instantanée, gratuite, exacte au centime).
 * 2. Sinon (scan, photo, format inconnu) : lecture par IA.
 */
export async function analyzeDocument(bytes: Uint8Array, mime: string): Promise<DocumentAnalysis> {
  let pageTexts: string[] | null = null;
  if (mime === "application/pdf") {
    try {
      pageTexts = await pdfPageTexts(bytes);
    } catch (e) {
      console.error("[supplier-invoices] lecture du texte PDF impossible :", e);
    }
    if (pageTexts && pageTexts.length > MAX_PDF_PAGES) {
      return {
        invoices: [],
        source: null,
        totalPages: pageTexts.length,
        error: `Document de ${pageTexts.length} pages : découpez-le en fichiers de ${MAX_PDF_PAGES} pages maximum.`,
      };
    }
  }
  const totalPages = pageTexts?.length ?? 1;

  let fromText: ParsedInvoice[] = [];
  if (pageTexts) {
    fromText = parseInvoicesFromText(pageTexts);
    if (isReliable(fromText)) return { invoices: fromText, source: "texte", totalPages, error: null };
  }

  try {
    const fromAI = await extractInvoicesWithAI(bytes, mime, pageTexts);
    if (fromAI.length > 0) return { invoices: fromAI, source: "ia", totalPages, error: null };
    throw new Error("Aucune facture reconnue dans le document");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[supplier-invoices] lecture IA impossible :", msg);
    // Lecture texte partielle : mieux que rien, chaque facture sera marquée « à vérifier ».
    if (fromText.length > 0) return { invoices: fromText, source: "texte", totalPages, error: null };
    const aiBlocked = /credit card|insufficient|quota|unauthorized|authentication/i.test(msg);
    return {
      invoices: [],
      source: null,
      totalPages,
      error: aiBlocked
        ? "Ce document n'a pas de texte lisible (scan ou photo) et la lecture par IA n'est pas activée."
        : `Lecture impossible : ${msg}`,
    };
  }
}

export interface IngestResult {
  created: Record<string, unknown>[];
  duplicates: string[];
  errors: string[];
  counts: { auto: number; a_associer: number; stock: number; review: number };
}

/** Enregistre les factures lues : un PDF et une ligne par facture, avec ses lignes de détail. */
export async function persistInvoices(
  admin: SupabaseClient,
  args: {
    bytes: Uint8Array;
    mime: string;
    fileName: string;
    userId: string;
    analysis: DocumentAnalysis;
  }
): Promise<IngestResult> {
  const { bytes, mime, fileName: originalName, userId, analysis } = args;
  const isPdf = mime === "application/pdf";
  const ranges = normalizePageRanges(analysis.invoices, analysis.totalPages);
  const entries = analysis.invoices.map((raw, i) => ({ raw, fields: toInvoiceFields(raw), ...ranges[i] }));

  const resolveSupplier = supplierResolver(admin);
  const leads = await findLeadCandidates(admin, entries.map((e) => e.fields.client_name ?? e.fields.client_reference));

  const batchId = randomUUID();
  const month = new Date().toISOString().slice(0, 7);
  const baseName = originalName.replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "_").slice(-80);
  const ext = originalName.split(".").pop()?.toLowerCase() || "pdf";
  const splitPdf = isPdf && entries.length > 1;
  const seen = new Set<string>();
  const result: IngestResult = { created: [], duplicates: [], errors: [], counts: { auto: 0, a_associer: 0, stock: 0, review: 0 } };

  for (const entry of entries) {
    const f = entry.fields;
    const supplier = await resolveSupplier(f.supplier_name);

    // Doublon : même fournisseur + même numéro, déjà en base ou deux fois dans le lot.
    if (f.invoice_number) {
      const k = `${supplier?.id ?? f.supplier_name}|${f.invoice_number}`;
      if (seen.has(k)) continue;
      seen.add(k);
      let q = admin.from("supplier_invoices").select("id").eq("invoice_number", f.invoice_number).limit(1);
      q = supplier ? q.eq("supplier_id", supplier.id) : q.is("supplier_id", null);
      const { data: dup } = await q;
      if (dup && dup.length > 0) {
        result.duplicates.push(f.invoice_number);
        continue;
      }
    }

    const m = f.client_reference
      ? matchLead(f.client_name ?? f.client_reference, f.client_department, leads)
      : { leadId: null, match: "stock" as LeadMatch };

    let fileBytes: Uint8Array = bytes;
    let fileName = originalName;
    if (splitPdf) {
      try {
        fileBytes = await extractPdfPages(bytes, entry.start, entry.end);
        fileName = `${f.invoice_number ?? `${baseName}_p${entry.start}`}.pdf`;
      } catch (e) {
        console.error("[supplier-invoices] découpage PDF impossible :", e);
      }
    }
    const path = `${month}/${randomUUID()}_${fileName.replace(/[^\w.\-]+/g, "_").slice(-100) || `facture.${ext}`}`;
    const { error: uploadError } = await admin.storage
      .from(SUPPLIER_INVOICES_BUCKET)
      .upload(path, fileBytes, { contentType: mime, upsert: false });
    if (uploadError) {
      result.errors.push(`${f.invoice_number ?? fileName} : ${uploadError.message}`);
      continue;
    }

    const { lines, ...rawWithoutLines } = entry.raw;
    const { data, error } = await admin
      .from("supplier_invoices")
      .insert({
        supplier_id: supplier?.id ?? null,
        supplier_name: supplier?.name ?? f.supplier_name,
        invoice_number: f.invoice_number,
        invoice_date: f.invoice_date,
        due_date: f.due_date,
        delivery_date: f.delivery_date,
        order_reference: f.order_reference,
        payment_terms: f.payment_terms,
        amount_ht: f.amount_ht,
        amount_tva: f.amount_tva,
        amount_ttc: f.amount_ttc,
        amount_paid: 0,
        description: f.description,
        client_reference: f.client_reference,
        client_name: f.client_name,
        client_department: f.client_department,
        lead_id: m.leadId,
        lead_match: m.match,
        needs_review: f.needs_review,
        parse_source: analysis.source,
        extraction: rawWithoutLines,
        file_name: fileName,
        storage_path: path,
        file_size: fileBytes.byteLength,
        mime_type: mime,
        batch_id: batchId,
        source_pages: analysis.totalPages > 1 ? `${entry.start}-${entry.end}` : null,
        created_by: userId,
      })
      .select(SUPPLIER_INVOICE_COLUMNS)
      .single();

    if (error || !data) {
      await admin.storage.from(SUPPLIER_INVOICES_BUCKET).remove([path]);
      result.errors.push(`${f.invoice_number ?? fileName} : ${error?.message ?? "erreur base de données"}`);
      continue;
    }

    if (lines.length > 0) {
      const { error: linesError } = await admin.from("supplier_invoice_lines").insert(
        lines.map((l, i) => ({
          invoice_id: data.id,
          position: l.position || i + 1,
          reference: l.reference,
          description: l.description || "—",
          quantity: l.quantity,
          unit_price: l.unit_price,
          amount: l.amount,
          is_comment: l.is_comment,
        }))
      );
      if (linesError) console.error("[supplier-invoices] lignes non enregistrées :", linesError.message);
    }

    result.created.push(data);
    result.counts[m.match === "manuel" ? "auto" : m.match]++;
    if (f.needs_review) result.counts.review++;
  }
  return result;
}

/** Dépôt sans lecture possible : le fichier est gardé, à compléter à la main. */
export async function persistUnreadDocument(
  admin: SupabaseClient,
  args: { bytes: Uint8Array; mime: string; fileName: string; userId: string; error: string }
) {
  const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}_${args.fileName.replace(/[^\w.\-]+/g, "_").slice(-100)}`;
  const { error: uploadError } = await admin.storage
    .from(SUPPLIER_INVOICES_BUCKET)
    .upload(path, args.bytes, { contentType: args.mime, upsert: false });
  if (uploadError) return { data: null, error: uploadError.message };
  const { data, error } = await admin
    .from("supplier_invoices")
    .insert({
      needs_review: true,
      parse_source: "manuel",
      extraction: { error: args.error },
      file_name: args.fileName,
      storage_path: path,
      file_size: args.bytes.byteLength,
      mime_type: args.mime,
      created_by: args.userId,
    })
    .select(SUPPLIER_INVOICE_COLUMNS)
    .single();
  if (error) await admin.storage.from(SUPPLIER_INVOICES_BUCKET).remove([path]);
  return { data, error: error?.message ?? null };
}
