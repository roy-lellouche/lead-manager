import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireRole } from "@/lib/finance/auth";
import {
  extractInvoices,
  MAX_PDF_PAGES,
  normalizePageRanges,
  pdfPageTexts,
  toInvoiceFields,
  type ExtractedInvoiceFields,
} from "@/lib/supplier-invoices-ai";
import { INVOICE_MAX_SIZE, invoiceMimeType, matchLead, type LeadMatch } from "@/lib/supplier-invoices";
import {
  extractPdfPages,
  findLeadCandidates,
  supplierResolver,
  SUPPLIER_INVOICE_COLUMNS,
  SUPPLIER_INVOICES_BUCKET,
} from "@/lib/supplier-invoices-server";

// Un relevé de plusieurs dizaines de factures se lit en une à deux minutes.
export const maxDuration = 300;

const EMPTY_FIELDS: ExtractedInvoiceFields = {
  supplier_name: null,
  invoice_number: null,
  invoice_date: null,
  due_date: null,
  order_reference: null,
  amount_ht: null,
  amount_tva: null,
  amount_ttc: null,
  amount_paid: 0,
  description: null,
  client_reference: null,
  client_name: null,
  client_department: null,
  needs_review: true,
};

/**
 * Dépôt d'un document : lecture IA de toutes les factures qu'il contient,
 * découpage du PDF par facture, rattachement fournisseur et client (lead).
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin, userId } = auth;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  const mime = invoiceMimeType(file.name, file.type);
  if (!mime) {
    return NextResponse.json({ error: "Format non pris en charge (PDF, JPG, PNG, WebP)" }, { status: 400 });
  }
  if (file.size > INVOICE_MAX_SIZE) {
    return NextResponse.json({ error: "Le fichier dépasse 15 Mo" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = mime === "application/pdf";

  let pageTexts: string[] | null = null;
  if (isPdf) {
    try {
      pageTexts = await pdfPageTexts(bytes);
    } catch (e) {
      console.error("[supplier-invoices] lecture du texte PDF impossible :", e);
    }
    if (pageTexts && pageTexts.length > MAX_PDF_PAGES) {
      return NextResponse.json(
        { error: `Document de ${pageTexts.length} pages : découpez-le en fichiers de ${MAX_PDF_PAGES} pages maximum.` },
        { status: 400 }
      );
    }
  }
  const totalPages = pageTexts?.length ?? 1;

  // 1. Lecture automatique. En cas d'échec, le document est enregistré tel quel « à vérifier ».
  let entries: { fields: ExtractedInvoiceFields; raw: unknown; start: number; end: number }[];
  let extractionError: string | null = null;
  try {
    const found = await extractInvoices(bytes, mime, pageTexts);
    if (found.length === 0) throw new Error("Aucune facture reconnue dans le document");
    const ranges = normalizePageRanges(found, totalPages);
    entries = found.map((raw, i) => ({ fields: toInvoiceFields(raw), raw, ...ranges[i] }));
  } catch (e) {
    extractionError = e instanceof Error ? e.message : String(e);
    console.error("[supplier-invoices] lecture IA impossible :", extractionError);
    entries = [{ fields: EMPTY_FIELDS, raw: { error: extractionError }, start: 1, end: totalPages }];
  }

  // 2. Rapprochement fournisseur + client, une seule fois pour tout le lot.
  const resolveSupplier = supplierResolver(admin);
  const leads = await findLeadCandidates(admin, entries.map((e) => e.fields.client_name ?? e.fields.client_reference));

  const batchId = randomUUID();
  const month = new Date().toISOString().slice(0, 7);
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").replace(/\.[^.]+$/, "").slice(-80);
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const splitPdf = isPdf && entries.length > 1;
  const seenNumbers = new Set<string>();

  const created: unknown[] = [];
  const duplicates: string[] = [];
  const errors: string[] = [];
  const counts = { auto: 0, a_associer: 0, stock: 0, review: 0 };

  for (const entry of entries) {
    const f = entry.fields;
    const supplier = await resolveSupplier(f.supplier_name);

    // Doublon : même fournisseur + même numéro, déjà en base ou deux fois dans le lot.
    if (supplier && f.invoice_number) {
      const k = `${supplier.id}|${f.invoice_number}`;
      if (seenNumbers.has(k)) continue;
      seenNumbers.add(k);
      const { data: dup } = await admin
        .from("supplier_invoices")
        .select("id")
        .eq("supplier_id", supplier.id)
        .eq("invoice_number", f.invoice_number)
        .limit(1);
      if (dup && dup.length > 0) {
        duplicates.push(f.invoice_number);
        continue;
      }
    }

    const m = f.client_reference
      ? matchLead(f.client_name ?? f.client_reference, f.client_department, leads)
      : { leadId: null, match: "stock" as LeadMatch };

    // Fichier : la facture seule si le document en contenait plusieurs.
    let fileBytes: Uint8Array = bytes;
    let fileName = file.name;
    if (splitPdf) {
      try {
        fileBytes = await extractPdfPages(bytes, entry.start, entry.end);
        fileName = `${f.invoice_number ?? `${safeName}_p${entry.start}`}.pdf`;
      } catch (e) {
        console.error("[supplier-invoices] découpage PDF impossible :", e);
      }
    }
    const path = `${month}/${randomUUID()}_${fileName.replace(/[^\w.\-]+/g, "_").slice(-100) || `facture.${ext}`}`;
    const { error: uploadError } = await admin.storage
      .from(SUPPLIER_INVOICES_BUCKET)
      .upload(path, fileBytes, { contentType: mime, upsert: false });
    if (uploadError) {
      errors.push(`${f.invoice_number ?? fileName} : ${uploadError.message}`);
      continue;
    }

    const { data, error } = await admin
      .from("supplier_invoices")
      .insert({
        supplier_id: supplier?.id ?? null,
        supplier_name: supplier?.name ?? f.supplier_name,
        invoice_number: f.invoice_number,
        invoice_date: f.invoice_date,
        due_date: f.due_date,
        order_reference: f.order_reference,
        amount_ht: f.amount_ht,
        amount_tva: f.amount_tva,
        amount_ttc: f.amount_ttc,
        amount_paid: f.amount_paid,
        description: f.description,
        client_reference: f.client_reference,
        client_name: f.client_name,
        client_department: f.client_department,
        lead_id: m.leadId,
        lead_match: m.match,
        needs_review: f.needs_review,
        extraction: entry.raw as Record<string, unknown>,
        file_name: fileName,
        storage_path: path,
        file_size: fileBytes.byteLength,
        mime_type: mime,
        batch_id: batchId,
        source_pages: entries.length > 1 || totalPages > 1 ? `${entry.start}-${entry.end}` : null,
        created_by: userId,
      })
      .select(SUPPLIER_INVOICE_COLUMNS)
      .single();

    if (error || !data) {
      await admin.storage.from(SUPPLIER_INVOICES_BUCKET).remove([path]);
      errors.push(`${f.invoice_number ?? fileName} : ${error?.message ?? "erreur base de données"}`);
      continue;
    }
    created.push(data);
    counts[m.match === "manuel" ? "auto" : m.match]++;
    if (f.needs_review) counts.review++;
  }

  if (created.length === 0 && duplicates.length > 0 && errors.length === 0) {
    return NextResponse.json(
      { error: `Déjà enregistrée(s) : ${duplicates.join(", ")}`, duplicate: true, duplicates },
      { status: 409 }
    );
  }
  if (created.length === 0) {
    return NextResponse.json({ error: errors[0] ?? "Aucune facture enregistrée" }, { status: 500 });
  }

  return NextResponse.json({
    invoices: created,
    found: entries.length,
    counts,
    duplicates,
    errors,
    extracted: !extractionError,
    warning: extractionError ? "Lecture automatique indisponible : complétez les informations à la main." : null,
  });
}
