import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTeamInstallationInput, type TeamInstallation } from "@/lib/equipe";
import { applyStockChange, listStockProducts, productLabel, requireEquipeStaff } from "@/lib/equipe-server";

export const dynamic = "force-dynamic";

async function loadExisting(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await admin.from("team_installations").select("*").eq("id", id).maybeSingle();
  return data as TeamInstallation | null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const existing = await loadExisting(admin, id);
  if (!existing) return NextResponse.json({ error: "Créneau introuvable." }, { status: 404 });

  const parsed = parseTeamInstallationInput(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const value = { ...parsed.value };

  if (value.product_id) {
    const label =
      value.product_id === existing.product_id && existing.product_label
        ? existing.product_label
        : await productLabel(admin, value.product_id);
    if (!label) return NextResponse.json({ error: "Produit introuvable dans le stockage." }, { status: 400 });
    value.product_label = label;
  }

  const stock = await applyStockChange(admin, existing, value);
  if (!stock.ok) return NextResponse.json({ error: stock.error }, { status: 409 });

  const { data, error } = await admin
    .from("team_installations")
    .update({ ...value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    await stock.rollback();
    return NextResponse.json({ error: "Impossible de modifier le créneau." }, { status: 500 });
  }
  return NextResponse.json({ item: data, products: await listStockProducts(admin) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const existing = await loadExisting(admin, id);
  if (!existing) return NextResponse.json({ error: "Créneau introuvable." }, { status: 404 });

  const { error } = await admin.from("team_installations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Impossible de supprimer le créneau." }, { status: 500 });

  // Le matériel réservé retourne au stockage. Si le produit a été supprimé
  // entre-temps, product_id est NULL et il n'y a rien à rendre.
  await applyStockChange(admin, existing, null);
  return NextResponse.json({ ok: true, products: await listStockProducts(admin) });
}
