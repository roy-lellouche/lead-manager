import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { analyzeDocument, persistInvoices } from "@/lib/supplier-invoices-ingest";
import { SUPPLIER_INVOICE_COLUMNS, SUPPLIER_INVOICES_BUCKET } from "@/lib/supplier-invoices-server";

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
  if (Number(inv.amount_paid) > 0) {
    return NextResponse.json(
      { error: "Cette facture a déjà des paiements enregistrés : corrigez-la avec « Modifier » plutôt que de la relire." },
      { status: 409 }
    );
  }

  const { data: blob, error: dlError } = await admin.storage.from(SUPPLIER_INVOICES_BUCKET).download(inv.storage_path);
  if (dlError || !blob) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = inv.mime_type || "application/pdf";

  const analysis = await analyzeDocument(bytes, mime);
  if (analysis.invoices.length === 0) {
    return NextResponse.json({ error: analysis.error ?? "Aucune facture reconnue dans ce document" }, { status: 422 });
  }

  // Les nouvelles fiches sont créées d'abord ; l'ancienne n'est retirée qu'une fois la relecture réussie.
  const result = await persistInvoices(admin, {
    bytes,
    mime,
    fileName: inv.file_name || "facture.pdf",
    userId,
    analysis,
    replaceId: id,
  });
  if (result.created.length === 0) {
    return NextResponse.json(
      { error: result.errors[0] ?? (result.duplicates.length ? `Déjà enregistrée : ${result.duplicates.join(", ")}` : "Relecture impossible") },
      { status: 422 }
    );
  }
  await admin.from("supplier_invoices").delete().eq("id", id);
  await admin.storage.from(SUPPLIER_INVOICES_BUCKET).remove([inv.storage_path]);

  // Un client choisi à la main est conservé.
  if (inv.lead_match === "manuel" && inv.lead_id && result.created.length === 1) {
    const created = result.created[0] as { id: string };
    const { data } = await admin
      .from("supplier_invoices")
      .update({ lead_id: inv.lead_id, lead_match: "manuel" })
      .eq("id", created.id)
      .select(SUPPLIER_INVOICE_COLUMNS)
      .single();
    if (data) result.created[0] = data;
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
