import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { INVOICE_MAX_SIZE, invoiceMimeType } from "@/lib/supplier-invoices";
import { analyzeDocument, persistInvoices, persistUnreadDocument } from "@/lib/supplier-invoices-ingest";

// Un scan lu par IA peut prendre une à deux minutes ; un PDF texte, quelques secondes.
export const maxDuration = 300;

/**
 * Dépôt d'un document : lecture de toutes les factures qu'il contient,
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
  if (!mime) return NextResponse.json({ error: "Format non pris en charge (PDF, JPG, PNG, WebP)" }, { status: 400 });
  if (file.size > INVOICE_MAX_SIZE) return NextResponse.json({ error: "Le fichier dépasse 15 Mo" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const analysis = await analyzeDocument(bytes, mime);

  if (analysis.invoices.length === 0) {
    // Illisible : on garde le fichier pour une saisie manuelle.
    const { data, error } = await persistUnreadDocument(admin, {
      bytes,
      mime,
      fileName: file.name,
      userId,
      error: analysis.error ?? "Aucune facture reconnue",
    });
    if (error || !data) return NextResponse.json({ error: error ?? "Enregistrement impossible" }, { status: 500 });
    return NextResponse.json({
      invoices: [data],
      found: 0,
      counts: { auto: 0, a_associer: 0, stock: 1, review: 1 },
      duplicates: [],
      errors: [],
      warning: `${analysis.error ?? "Aucune facture reconnue"} Complétez la facture à la main.`,
    });
  }

  const result = await persistInvoices(admin, { bytes, mime, fileName: file.name, userId, analysis });

  if (result.created.length === 0 && result.duplicates.length > 0 && result.errors.length === 0) {
    return NextResponse.json(
      { error: `Déjà enregistrée(s) : ${result.duplicates.join(", ")}`, duplicate: true, duplicates: result.duplicates },
      { status: 409 }
    );
  }
  if (result.created.length === 0) {
    return NextResponse.json({ error: result.errors[0] ?? "Aucune facture enregistrée" }, { status: 500 });
  }

  return NextResponse.json({
    invoices: result.created,
    found: analysis.invoices.length,
    source: analysis.source,
    counts: result.counts,
    duplicates: result.duplicates,
    errors: result.errors,
    warning: null,
  });
}
