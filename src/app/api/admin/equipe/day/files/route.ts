import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { EQUIPE_DOCS_BUCKET, parseTeamDay, teamDayPrefix, type TeamDayFile } from "@/lib/equipe";
import { loadTeamDayDocs, requireEquipeStaff } from "@/lib/equipe-server";

export const dynamic = "force-dynamic";

/** POST { team, day, path, name, type, size } : enregistre un fichier déjà envoyé. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const td = parseTeamDay(body?.team, body?.day);
  if (!td) return NextResponse.json({ error: "Équipe ou date invalide." }, { status: 400 });
  const path = typeof body?.path === "string" ? body.path : "";
  const prefix = teamDayPrefix(td.team, td.day);
  if (!path.startsWith(prefix) || path.includes(".."))
    return NextResponse.json({ error: "Chemin de fichier invalide." }, { status: 400 });

  // Le fichier doit réellement exister dans le stockage.
  const fileName = path.slice(prefix.length);
  const { data: listed } = await admin.storage.from(EQUIPE_DOCS_BUCKET).list(prefix.slice(0, -1), { search: fileName });
  const obj = (listed ?? []).find((o) => o.name === fileName);
  if (!obj) return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 400 });

  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
  const { error } = await admin.from("team_day_files").insert({
    team: td.team,
    day: td.day,
    path,
    name: (typeof body?.name === "string" && body.name.trim().slice(0, 200)) || "document",
    type: meta.mimetype || (typeof body?.type === "string" && body.type) || "application/octet-stream",
    size: meta.size ?? (Number(body?.size) || 0),
    uploaded_by: auth.userId,
  });
  if (error) return NextResponse.json({ error: "Impossible d'enregistrer le fichier." }, { status: 500 });
  return NextResponse.json(await loadTeamDayDocs(admin, td.team, td.day));
}

/** DELETE ?id=... : supprime un fichier. */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  const { data: row } = await admin.from("team_day_files").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  const file = row as TeamDayFile;

  const { error } = await admin.from("team_day_files").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  await admin.storage.from(EQUIPE_DOCS_BUCKET).remove([file.path]);
  return NextResponse.json(await loadTeamDayDocs(admin, file.team, file.day));
}
