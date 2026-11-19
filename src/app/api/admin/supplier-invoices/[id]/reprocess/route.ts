import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { analyzeDocument, persistInvoices } from "@/lib/supplier-invoices-ingest";
import { SUPPLIER_INVOICES_BUCKET } from "@/lib/supplier-invoices-server";

export const maxDuration = 300;

/**
 * Relit le fichier d'une facture restée illisible : si la lecture réussit, elle
 * est remplacée par les factures trouvées (une par facture du document).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin, userId } = auth;

  const { data: inv } = await admin
    .from("supplier_invoices")
    .select("id, storage_path, mime_type, file_name, amount_paid, lead_id, lead_match")
    .eq("id", id)
    .single();
  if (!inv?.storage_path) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  const { data: blob, error: dlError } = await admin.storage.from(SUPPLIER_INVOICES_BUCKET).download(inv.storage_path);
  if (dlError || !blob) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = inv.mime_type || "application/pdf";

  const analysis = await analyzeDocument(bytes, mime);
  if (analysis.invoices.length === 0) {
    return NextResponse.json({ error: analysis.error ?? "Aucune facture reconnue dans ce document" }, { status: 422 });
  }

  // L'ancienne fiche est remplacée : on la retire avant, sinon elle passerait pour un doublon.
  await admin.from("supplier_invoices").delete().eq("id", id);
  const result = await persistInvoices(admin, {
    bytes,
    mime,
    fileName: inv.file_name || "facture.pdf",
    userId,
    analysis,
  });
  if (result.created.length > 0) {
    await admin.storage.from(SUPPLIER_INVOICES_BUCKET).remove([inv.storage_path]);
  }

  return NextResponse.json({
    removedId: id,
    invoices: result.created,
    found: analysis.invoices.length,
    source: analysis.source,
    counts: result.counts,
    duplicates: result.duplicates,
    errors: result.errors,
  });
}
