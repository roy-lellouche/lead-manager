import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFromClient } from "@/lib/supabase/session";

export async function POST(request: NextRequest) {
  const { supabase } = await createClientFromRequest(request);
  const user = await getUserFromClient(supabase);

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Utiliser le service role pour vérifier le rôle (bypass RLS)
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role?.toString().trim().toLowerCase();
  if (role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await request.json();
  const { email, password, fullName, role: newUserRole } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email et mot de passe requis" },
      { status: 400 }
    );
  }

  const validRoles = ["telepro", "secretaire", "stockage", "cee"];
  const roleToCreate = validRoles.includes(newUserRole) ? newUserRole : "telepro";

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || "",
      role: roleToCreate,
    },
  });

  if (error) {
    const rawMessage = (error as { message?: string }).message ?? String(error);
    let message = rawMessage;
    if (
      rawMessage.toLowerCase().includes("check constraint") ||
      rawMessage.toLowerCase().includes("violates check")
    ) {
      message =
        roleToCreate === "cee"
          ? "Le rôle responsable CEE n'est pas encore activé. Appliquez la migration 060_doc_cee."
          : roleToCreate === "stockage"
          ? "Le rôle stockage n'est pas encore activé. Appliquez la migration 040_role_stockage (npx supabase db push ou supabase migration up)."
          : "Le rôle secrétaire n'est pas encore activé. Appliquez la migration 014_role_secretaire (npx supabase db push ou supabase migration up).";
    }
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }

  if (data.user) {
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName || email,
        role: roleToCreate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.user.id);

    if (profileError) {
      // Rollback : supprimer l'utilisateur auth créé (le profil existe via le trigger)
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json(
        {
          error:
            profileError.message ||
            `Erreur lors de la mise à jour du profil. Vérifiez que la migration ${
              roleToCreate === "cee"
                ? "060_doc_cee"
                : roleToCreate === "stockage"
                ? "040_role_stockage"
                : "014_role_secretaire"
            } a bien été appliquée.`,
        },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
