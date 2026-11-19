import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { SUPPLIER_INVOICE_COLUMNS } from "@/lib/supplier-invoices-server";

/** Annule un virement : les montants imputés sont retirés des factures. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin } = auth;

  const { data: payment } = await admin.from("supplier_payments").select("supplier_id").eq("id", id).single();
  if (!payment) return NextResponse.json({ error: "Virement introuvable" }, { status: 404 });

  const { error } = await admin.rpc("delete_supplier_payment", { p_payment_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: invoices } = await admin.from("supplier_invoices").select(SUPPLIER_INVOICE_COLUMNS).eq("supplier_id", payment.supplier_id);
  return NextResponse.json({ ok: true, invoices: invoices ?? [] });
}
