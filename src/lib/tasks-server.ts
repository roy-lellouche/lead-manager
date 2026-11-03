import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRole } from "@/lib/roles";
import type { UserRole } from "@/lib/types";

/** Utilisateur connecté + son rôle, lu en service role (même logique que les autres routes). */
export async function getTaskActor(): Promise<
  | { userId: string; role: UserRole | undefined; adminClient: ReturnType<typeof createAdminClient> }
  | null
> {
  const supabase = await createClient();
  const user = await getUserFromClient(supabase);
  if (!user) return null;

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, deleted_at")
    .eq("id", user.id)
    .single();
  if (!profile || profile.deleted_at) return null;

  return { userId: user.id, role: normalizeRole(profile.role), adminClient };
}
