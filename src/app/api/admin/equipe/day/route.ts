import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTeamDay } from "@/lib/equipe";
import { loadTeamDayDocs, requireEquipeStaff } from "@/lib/equipe-server";

export const dynamic = "force-dynamic";

/** GET ?team=1&day=yyyy-MM-dd : note + fichiers (URLs signées 1 h). */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const td = parseTeamDay(req.nextUrl.searchParams.get("team"), req.nextUrl.searchParams.get("day"));
  if (!td) return NextResponse.json({ error: "Équipe ou date invalide." }, { status: 400 });
  return NextResponse.json(await loadTeamDayDocs(admin, td.team, td.day));
}

/** PUT { team, day, note } : enregistre la note écrite du jour. */
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const td = parseTeamDay(body?.team, body?.day);
  if (!td) return NextResponse.json({ error: "Équipe ou date invalide." }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.slice(0, 20000) : "";

  const { error } = await admin.from("team_day_notes").upsert({
    team: td.team,
    day: td.day,
    note,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "Impossible d'enregistrer la note." }, { status: 500 });
  return NextResponse.json({ ok: true, note });
}
