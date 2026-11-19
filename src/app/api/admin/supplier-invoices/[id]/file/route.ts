import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { SUPPLIER_INVOICES_BUCKET } from "@/lib/supplier-invoices-server";

/** Ouvre le fichier de la facture via une URL signée de courte durée. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: inv } = await auth.admin.from("supplier_invoices").select("storage_path").eq("id", id).single();
  if (!inv?.storage_path) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  const { data, error } = await auth.admin.storage
    .from(SUPPLIER_INVOICES_BUCKET)
    .createSignedUrl(inv.storage_path, 300);
  if (error || !data) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
