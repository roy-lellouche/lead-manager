import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { EQUIPE_DOC_MAX_BYTES, EQUIPE_DOCS_BUCKET, parseTeamDay, teamDayPrefix } from "@/lib/equipe";
import { safeFileName } from "@/lib/doc-cee";
import { requireEquipeStaff } from "@/lib/equipe-server";

export const dynamic = "force-dynamic";

/**
 * POST { team, day, name, size } : URL d'envoi signée. Le navigateur envoie le
 * fichier directement au stockage (pas de limite de 4,5 Mo des fonctions).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireEquipeStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const td = parseTeamDay(body?.team, body?.day);
  if (!td) return NextResponse.json({ error: "Équipe ou date invalide." }, { status: 400 });
  const size = Number(body?.size);
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
  if (size > EQUIPE_DOC_MAX_BYTES) return NextResponse.json({ error: "Fichier trop lourd (50 Mo max)." }, { status: 400 });

  const name = typeof body?.name === "string" ? body.name : "document";
  const path = `${teamDayPrefix(td.team, td.day)}${randomUUID()}-${safeFileName(name)}`;
  const { data, error } = await admin.storage.from(EQUIPE_DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
  return NextResponse.json({ path: data.path, token: data.token });
}
