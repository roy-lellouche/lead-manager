import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFromClient } from "@/lib/supabase/session";
import { normalizeRole } from "@/lib/roles";
import type { UserRole } from "@/lib/types";

/* ── Authentification des routes ─────────────────────────────────────── */

export async function requireRole(
  request: NextRequest,
  roles: UserRole[]
): Promise<{ ok: true; userId: string; role: UserRole; admin: SupabaseClient } | { ok: false; status: number; error: string }> {
  const { supabase } = await createClientFromRequest(request);
  const user = await getUserFromClient(supabase);
  if (!user) return { ok: false, status: 401, error: "Non authentifié" };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const role = normalizeRole(profile?.role);
  if (!role || !roles.includes(role)) return { ok: false, status: 403, error: "Accès refusé" };
  return { ok: true, userId: user.id, role, admin };
}

