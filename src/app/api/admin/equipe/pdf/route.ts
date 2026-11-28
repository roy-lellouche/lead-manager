import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEAMS, teamName, type TeamId, type TeamInstallation } from "@/lib/equipe";
import { requireEquipeStaff } from "@/lib/equipe-server";
import { buildDayPlanningPdf } from "@/lib/equipe-pdf";

export const dynamic = "force-dynamic";

/** GET ?date=yyyy-MM-dd[&team=1..4] : planning du jour en PDF. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const teamParam = Number(req.nextUrl.searchParams.get("team"));
  const team = TEAMS.some((t) => t.id === teamParam) ? (teamParam as TeamId) : null;

  let query = admin.from("team_installations").select("*").eq("install_date", date).order("created_at");
  if (team) query = query.eq("team", team);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bytes = await buildDayPlanningPdf({ date, items: (data ?? []) as TeamInstallation[], team });
  const fileName = `planning-${date}${team ? `-equipe-${team}-${teamName(team).toLowerCase()}` : ""}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
