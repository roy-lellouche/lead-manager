import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireRole } from "@/lib/finance/auth";
import { extractInvoice, toInvoiceFields, type ExtractedInvoiceFields } from "@/lib/supplier-invoices-ai";
import { INVOICE_MAX_SIZE, invoiceMimeType } from "@/lib/supplier-invoices";
import {
  resolveSupplierId,
  SUPPLIER_INVOICE_COLUMNS,
  SUPPLIER_INVOICES_BUCKET,
} from "@/lib/supplier-invoices-server";

// La lecture IA d'un PDF de plusieurs pages peut prendre une trentaine de secondes.
export const maxDuration = 120;

const EMPTY_FIELDS: ExtractedInvoiceFields = {
  supplier_name: null,
  invoice_number: null,
  invoice_date: null,
  due_date: null,
  amount_ht: null,
  amount_tva: null,
  amount_ttc: null,
  amount_paid: 0,
  description: null,
  needs_review: true,
};

/** Dépôt d'une facture : stockage du fichier, lecture IA, rattachement au fournisseur. */
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

  // 1. Lecture automatique. En cas d'échec, la facture est quand même enregistrée « à vérifier ».
  let fields = EMPTY_FIELDS;
  let extraction: Record<string, unknown> | null = null;
  let extractionError: string | null = null;
  try {
    const raw = await extractInvoice(bytes, mime);
    extraction = raw as unknown as Record<string, unknown>;
    fields = toInvoiceFields(raw);
  } catch (e) {
    extractionError = e instanceof Error ? e.message : String(e);
    console.error("[supplier-invoices] lecture IA impossible :", extractionError);
  }

  // 2. Doublon : même fournisseur + même numéro de facture.
  const supplier = await resolveSupplierId(admin, fields.supplier_name);
  if (supplier && fields.invoice_number) {
    const { data: dup } = await admin
      .from("supplier_invoices")
      .select("id")
      .eq("supplier_id", supplier.id)
      .eq("invoice_number", fields.invoice_number)
      .limit(1);
    if (dup && dup.length > 0) {
      return NextResponse.json(
        { error: `Facture n° ${fields.invoice_number} de ${supplier.name} déjà enregistrée`, duplicate: true },
        { status: 409 }
      );
    }
  }

  // 3. Stockage du fichier.
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}_${safeName}`;
  const { error: uploadError } = await admin.storage
    .from(SUPPLIER_INVOICES_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: `Erreur d'enregistrement du fichier : ${uploadError.message}` }, { status: 500 });
  }

  const { data, error } = await admin
    .from("supplier_invoices")
    .insert({
      supplier_id: supplier?.id ?? null,
      supplier_name: supplier?.name ?? fields.supplier_name,
      invoice_number: fields.invoice_number,
      invoice_date: fields.invoice_date,
      due_date: fields.due_date,
      amount_ht: fields.amount_ht,
      amount_tva: fields.amount_tva,
      amount_ttc: fields.amount_ttc,
      amount_paid: fields.amount_paid,
      description: fields.description,
      needs_review: fields.needs_review,
      extraction: extraction ?? (extractionError ? { error: extractionError } : null),
      file_name: file.name,
      storage_path: path,
      file_size: file.size,
      mime_type: mime,
      created_by: userId,
    })
    .select(SUPPLIER_INVOICE_COLUMNS)
    .single();

  if (error || !data) {
    await admin.storage.from(SUPPLIER_INVOICES_BUCKET).remove([path]);
    return NextResponse.json({ error: error?.message ?? "Erreur base de données" }, { status: 500 });
  }

  return NextResponse.json({
    invoice: data,
    supplier: supplier,
    extracted: !extractionError,
    warning: extractionError
      ? "Lecture automatique indisponible : complétez les informations à la main."
      : fields.needs_review
        ? "Certaines informations n'ont pas pu être lues : vérifiez la facture."
        : null,
  });
}
