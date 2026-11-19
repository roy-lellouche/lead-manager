import type { SupabaseClient } from "@supabase/supabase-js";
import { matchSupplier } from "@/lib/supplier-invoices";

export const SUPPLIER_INVOICES_BUCKET = "supplier-invoices";

export const SUPPLIER_INVOICE_COLUMNS =
  "id, supplier_id, supplier_name, invoice_number, invoice_date, due_date, amount_ht, amount_tva, amount_ttc, amount_paid, paid_at, description, notes, needs_review, file_name, storage_path, mime_type, created_at";

/**
 * Rattache un nom de fournisseur à la table suppliers : fournisseur existant
 * si le nom correspond, sinon création. Retourne null si le nom est vide.
 */
export async function resolveSupplierId(
  admin: SupabaseClient,
  name: string | null | undefined
): Promise<{ id: string; name: string } | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const { data: suppliers } = await admin.from("suppliers").select("id, name");
  const found = matchSupplier(clean, suppliers ?? []);
  if (found) return { id: found.id, name: found.name };
  const { data, error } = await admin.from("suppliers").insert({ name: clean }).select("id, name").single();
  if (error || !data) return null;
  return data;
}
