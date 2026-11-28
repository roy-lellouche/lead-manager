import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEquipeStaff } from "@/lib/equipe-server";
import { computeWeekKm } from "@/lib/equipe-km-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET ?from=yyyy-MM-dd&to=yyyy-MM-dd : kilométrage de la période par équipe. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
    return NextResponse.json({ error: "Période invalide." }, { status: 400 });
  if (Date.parse(to) - Date.parse(from) > 31 * 86400000)
    return NextResponse.json({ error: "Période trop longue." }, { status: 400 });

  return NextResponse.json({ teams: await computeWeekKm(admin, from, to) });
}
