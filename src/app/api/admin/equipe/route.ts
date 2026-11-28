import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTeamInstallationInput } from "@/lib/equipe";
import { applyStockChange, listStockProducts, listTeamDaySummaries, productLabel, requireEquipeStaff } from "@/lib/equipe-server";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?from=yyyy-MM-dd&to=yyyy-MM-dd : créneaux de la période + état du stock. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to))
    return NextResponse.json({ error: "Période invalide." }, { status: 400 });

  const [{ data, error }, products, dayDocs] = await Promise.all([
    admin
      .from("team_installations")
      .select("*")
      .gte("install_date", from)
      .lte("install_date", to)
      .order("install_date")
      .order("created_at"),
    listStockProducts(admin),
    listTeamDaySummaries(admin, from, to),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [], products, dayDocs });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = parseTeamInstallationInput(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const value = { ...parsed.value };

  if (value.product_id) {
    const label = await productLabel(admin, value.product_id);
    if (!label) return NextResponse.json({ error: "Produit introuvable dans le stockage." }, { status: 400 });
    value.product_label = label;
  }

  const stock = await applyStockChange(admin, null, value);
  if (!stock.ok) return NextResponse.json({ error: stock.error }, { status: 409 });

  const { data, error } = await admin
    .from("team_installations")
    .insert({ ...value, created_by: auth.userId })
    .select()
    .single();
  if (error || !data) {
    await stock.rollback();
    return NextResponse.json({ error: "Impossible d'enregistrer le créneau." }, { status: 500 });
  }
  return NextResponse.json({ item: data, products: await listStockProducts(admin) });
}
