import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { parseAmount, parseIsoDate, todayParis } from "@/lib/supplier-invoices";
import { loadSupplierPayments, SUPPLIER_INVOICE_COLUMNS, toSupplierPayment, SUPPLIER_PAYMENT_COLUMNS } from "@/lib/supplier-invoices-server";

/**
 * Enregistre un virement à un fournisseur et l'impute sur ses factures
 * (échéances les plus anciennes d'abord, ou factures choisies).
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin, userId } = auth;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const supplierId = typeof body?.supplier_id === "string" ? body.supplier_id : null;
  const amount = parseAmount(body?.amount);
  if (!supplierId) return NextResponse.json({ error: "Choisissez le fournisseur" }, { status: 400 });
  if (amount === null || amount <= 0) return NextResponse.json({ error: "Indiquez le montant du virement" }, { status: 400 });
  const invoiceIds = Array.isArray(body?.invoice_ids) ? (body!.invoice_ids as unknown[]).filter((v): v is string => typeof v === "string") : null;

  const { data: supplier } = await admin.from("suppliers").select("id").eq("id", supplierId).single();
  if (!supplier) return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 400 });

  const { data: paymentId, error } = await admin.rpc("record_supplier_payment", {
    p_supplier_id: supplierId,
    p_amount: amount,
    p_paid_on: parseIsoDate(body?.paid_on) ?? todayParis(),
    p_label: typeof body?.label === "string" ? body.label : null,
    p_created_by: userId,
    p_invoice_ids: invoiceIds && invoiceIds.length > 0 ? invoiceIds : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [paymentRes, invoicesRes] = await Promise.all([
    admin.from("supplier_payments").select(SUPPLIER_PAYMENT_COLUMNS).eq("id", paymentId).single(),
    admin.from("supplier_invoices").select(SUPPLIER_INVOICE_COLUMNS).eq("supplier_id", supplierId),
  ]);
  return NextResponse.json({
    payment: paymentRes.data ? toSupplierPayment(paymentRes.data as never) : null,
    invoices: invoicesRes.data ?? [],
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await loadSupplierPayments(auth.admin, request.nextUrl.searchParams.get("supplier_id") ?? undefined);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ payments: data });
}
