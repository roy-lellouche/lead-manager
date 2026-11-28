import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRole } from "@/lib/roles";
import type { UserRole } from "@/lib/types";
import { stockDeltas, type StockProductOption, type TeamInstallation } from "@/lib/equipe";

export const EQUIPE_ROLES = ["admin", "secretaire", "stockage"] as const;

export type EquipeCaller = { userId: string; role: UserRole };

export async function requireEquipeStaff(
  getUser: () => Promise<{ id: string } | null>,
  admin: SupabaseClient
): Promise<EquipeCaller | { error: string; status: number }> {
  const user = await getUser();
  if (!user) return { error: "Non autorisé", status: 401 };
  const { data: profile } = await admin.from("profiles").select("role, deleted_at").eq("id", user.id).single();
  if (!profile || profile.deleted_at) return { error: "Accès refusé", status: 403 };
  const role = normalizeRole(profile.role);
  if (!role || !(EQUIPE_ROLES as readonly string[]).includes(role)) return { error: "Accès refusé", status: 403 };
  return { userId: user.id, role };
}

export async function listStockProducts(admin: SupabaseClient): Promise<StockProductOption[]> {
  const { data } = await admin
    .from("products")
    .select("id, name, quantity, product_types ( name, display_order )")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  type Row = { id: string; name: string; quantity: number; product_types: { name: string } | { name: string }[] | null };
  return ((data ?? []) as Row[]).map((p) => {
    const t = Array.isArray(p.product_types) ? p.product_types[0] : p.product_types;
    return { id: p.id, name: p.name, quantity: p.quantity ?? 0, type_name: t?.name ?? null };
  });
}

/** Libellé lisible d'un produit du stock (« Type — Nom »). */
export async function productLabel(admin: SupabaseClient, productId: string): Promise<string | null> {
  const [p] = (await listStockProducts(admin)).filter((x) => x.id === productId);
  if (!p) return null;
  return p.type_name && p.type_name !== p.name ? `${p.type_name} — ${p.name}` : p.name;
}

/**
 * Applique les variations de stock entre deux états d'un créneau. Les remises
 * en stock passent d'abord ; si un retrait échoue (stock insuffisant), tout ce
 * qui a déjà été appliqué est annulé.
 */
export async function applyStockChange(
  admin: SupabaseClient,
  before: Pick<TeamInstallation, "product_id" | "quantity" | "stock_status"> | null,
  after: Pick<TeamInstallation, "product_id" | "quantity" | "stock_status"> | null
): Promise<{ ok: true; rollback: () => Promise<void> } | { ok: false; error: string }> {
  const entries = [...stockDeltas(before, after)].sort((a, b) => b[1] - a[1]);
  const applied: [string, number][] = [];
  const rollback = async () => {
    for (const [id, delta] of applied.reverse()) {
      await admin.rpc("adjust_product_stock", { p_product_id: id, p_delta: -delta });
    }
  };
  for (const [id, delta] of entries) {
    const { error } = await admin.rpc("adjust_product_stock", { p_product_id: id, p_delta: delta });
    if (error) {
      await rollback();
      return {
        ok: false,
        error: error.message.includes("STOCK_INSUFFISANT")
          ? "Stock insuffisant pour cette pompe à chaleur : marquez-la « à commander »."
          : "Impossible de mettre à jour le stock.",
      };
    }
    applied.push([id, delta]);
  }
  return { ok: true, rollback };
}
