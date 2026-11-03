import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthShell } from "@/components/auth/AuthShell";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import { getSessionUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  if (user) {
    let profile: { role?: string } | null = null;
    try {
      const adminClient = createAdminClient();
      const res = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      profile = res.data;
    } catch {
      const res = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      profile = res.data;
    }

    const role = normalizeRole(profile?.role);
    if (role) {
      redirect(roleLandingPath(role));
    }
    // Rôle inconnu ou profil introuvable : afficher les deux accès
    return (
      <AuthShell title="Choisir votre espace" subtitle={`Connecté en tant que ${user.email}`}>
        <div className="flex flex-col gap-3">
          <Link
            href="/admin"
            className={cn(buttonVariants(), "w-full justify-center")}
          >
            Espace administrateur
          </Link>
          <Link
            href="/telepro"
            className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center")}
          >
            Espace télépro
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Lead Manager"
      subtitle="Plateforme de gestion des leads pour téléprospection"
    >
      <div className="flex flex-col gap-3">
        <Link
          href="/login"
          className={cn(buttonVariants(), "w-full justify-center")}
        >
          Se connecter
        </Link>
        <Link
          href="/setup"
          className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center")}
        >
          Première configuration
        </Link>
      </div>
    </AuthShell>
  );
}
