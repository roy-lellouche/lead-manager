import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/finance/auth";
import { parseAmount, parseIsoDate, round2, todayParis } from "@/lib/supplier-invoices";
import {
  resolveSupplierId,
  SUPPLIER_INVOICE_COLUMNS,
  SUPPLIER_INVOICES_BUCKET,
} from "@/lib/supplier-invoices-server";

type Params = { params: Promise<{ id: string }> };

/** Détail d'une facture : lignes article par article. */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin
    .from("supplier_invoice_lines")
    .select("id, position, reference, description, quantity, unit_price, amount, is_comment")
    .eq("invoice_id", id)
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lines: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Modification d'une facture (correction des champs, paiement). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin } = auth;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const { data: current } = await admin
    .from("supplier_invoices")
    .select("amount_ttc, amount_paid, paid_at")
    .eq("id", id)
    .single();
  if (!current) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("supplier_name" in body) {
    const supplier = await resolveSupplierId(admin, typeof body.supplier_name === "string" ? body.supplier_name : null);
    update.supplier_id = supplier?.id ?? null;
    update.supplier_name = supplier?.name ?? null;
  }
  for (const k of ["invoice_number", "description", "notes"] as const) {
    if (k in body) update[k] = typeof body[k] === "string" && (body[k] as string).trim() ? (body[k] as string).trim() : null;
  }
  for (const k of ["invoice_date", "due_date"] as const) {
    if (k in body) update[k] = parseIsoDate(body[k]);
  }
  for (const k of ["amount_ht", "amount_tva", "amount_ttc"] as const) {
    if (k in body) update[k] = parseAmount(body[k]);
  }
  if ("needs_review" in body) update.needs_review = body.needs_review === true;

  // Client / chantier : un lead choisi à la main, ou « stock » (aucun client).
  if ("lead_id" in body) {
    const leadId = typeof body.lead_id === "string" && body.lead_id ? body.lead_id : null;
    if (leadId) {
      const { data: lead } = await admin.from("leads").select("id").eq("id", leadId).single();
      if (!lead) return NextResponse.json({ error: "Client introuvable" }, { status: 400 });
      update.lead_id = leadId;
      update.lead_match = "manuel";
    } else {
      update.lead_id = null;
      update.lead_match = "stock";
    }
  }

  const ttc = "amount_ttc" in update ? (update.amount_ttc as number | null) : current.amount_ttc;

  // « Marquer comme payée » : solde l'intégralité du TTC.
  if (body.mark_paid === true) {
    update.amount_paid = Math.max(0, Number(ttc ?? 0));
    update.paid_at = todayParis();
  } else if (body.mark_unpaid === true) {
    update.amount_paid = 0;
    update.paid_at = null;
  } else if ("amount_paid" in body) {
    const paid = Math.max(0, parseAmount(body.amount_paid) ?? 0);
    update.amount_paid = round2(paid);
    const fullyPaid = ttc !== null && Number(ttc) > 0 && paid >= Number(ttc) - 0.005;
    update.paid_at = fullyPaid ? (parseIsoDate(body.paid_at) ?? current.paid_at ?? todayParis()) : null;
  }

  const { data, error } = await admin
    .from("supplier_invoices")
    .update(update)
    .eq("id", id)
    .select(SUPPLIER_INVOICE_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireRole(request, ["admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin } = auth;

  const { data: inv } = await admin.from("supplier_invoices").select("storage_path").eq("id", id).single();
  if (!inv) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  const { error } = await admin.from("supplier_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (inv.storage_path) await admin.storage.from(SUPPLIER_INVOICES_BUCKET).remove([inv.storage_path]);
  return NextResponse.json({ ok: true });
}
