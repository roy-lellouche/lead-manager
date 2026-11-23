import { NextRequest, NextResponse } from "next/server";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFromClient } from "@/lib/supabase/session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const { supabase } = await createClientFromRequest(_request);
  const user = await getUserFromClient(supabase);

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role?.toString().trim().toLowerCase();
  if (role !== "admin" && role !== "secretaire") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { data, error } = await adminClient
    .from("lead_materials")
    .select(`
      id,
      product_id,
      quantity,
      products (
        id,
        name,
        price,
        product_types (
          id,
          name
        )
      )
    `)
    .eq("lead_id", leadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

/** En-tête requis pour éviter les anciens clients en boucle (sans ce header = 403). */
const CLIENT_VERSION_HEADER = "x-lead-form-version";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (request.headers.get(CLIENT_VERSION_HEADER) !== "2") {
    return NextResponse.json(
      { error: "Client obsolète. Merci de rafraîchir la page (F5)." },
      { status: 403 }
    );
  }
  const { id: leadId } = await params;
  const { supabase } = await createClientFromRequest(request);
  const user = await getUserFromClient(supabase);

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role?.toString().trim().toLowerCase();
  if (role !== "admin" && role !== "secretaire") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await request.json();
  const materials = Array.isArray(body.materials) ? body.materials : [];

  // Récupérer les anciennes entrées pour calculer le delta de stock
  const { data: oldMaterials } = await adminClient
    .from("lead_materials")
    .select("product_id, quantity")
    .eq("lead_id", leadId);

  const oldByProduct: Record<string, number> = {};
  for (const m of oldMaterials || []) {
    oldByProduct[m.product_id] = (oldByProduct[m.product_id] || 0) + (m.quantity || 1);
  }

  // Supprimer les anciennes entrées
  await adminClient
    .from("lead_materials")
    .delete()
    .eq("lead_id", leadId);

  const newByProduct: Record<string, number> = {};
  if (materials.length > 0) {
    const toInsert = materials
      .filter((m: { product_id: string; quantity?: number }) => m.product_id)
      .map((m: { product_id: string; quantity?: number }) => {
        const qty = Math.max(1, m.quantity ?? 1);
        newByProduct[m.product_id] = (newByProduct[m.product_id] || 0) + qty;
        return {
          lead_id: leadId,
          product_id: m.product_id,
          quantity: qty,
        };
      });

    const { error: insertError } = await adminClient
      .from("lead_materials")
      .insert(toInsert);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Mettre à jour le stock : delta = ancienne_qty - nouvelle_qty (positif = on remet en stock)
  const allProductIds = new Set([
    ...Object.keys(oldByProduct),
    ...Object.keys(newByProduct),
  ]);
  for (const productId of allProductIds) {
    const oldQty = oldByProduct[productId] || 0;
    const newQty = newByProduct[productId] || 0;
    const delta = oldQty - newQty;
    if (delta !== 0) {
      const { data: product } = await adminClient
        .from("products")
        .select("quantity")
        .eq("id", productId)
        .single();
      const currentQty = product?.quantity ?? 0;
      const newQuantity = Math.max(0, currentQty + delta);
      await adminClient
        .from("products")
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq("id", productId);
    }
  }

  const { data } = await adminClient
    .from("lead_materials")
    .select(`
      id,
      product_id,
      quantity,
      products (
        id,
        name,
        price,
        product_types (
          id,
          name
        )
      )
    `)
    .eq("lead_id", leadId);

  return NextResponse.json(data || []);
}
