import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, getSessionUser } from "@/lib/supabase/session";
import { redirect } from "next/navigation";
import { Drawer } from "@/components/Drawer";
import { SaveOnLeaveProvider } from "@/contexts/SaveOnLeaveContext";
import { buildStatusCounts } from "@/lib/status-counts";
import { normalizeRole } from "@/lib/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getSessionUser();

  if (!user) redirect("/login");

  const profile = await getSessionProfile(user.id);

  if (profile?.deleted_at) {
    const supabaseSignOut = await createClient();
    await supabaseSignOut.auth.signOut();
    redirect("/login?message=Compte désactivé");
  }

  const role = normalizeRole(profile?.role);

  const adminClient = createAdminClient();
  const isAdminOrSecretaire = role === "admin" || role === "secretaire";

  // Ces deux requêtes ne dépendent que de user.id / role : les enchaîner coûtait
  // un aller-retour pour rien.
  const [notifRes, countsRes, tasksRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false),
    adminClient.rpc("lead_status_counts", {
      p_assigned_to: isAdminOrSecretaire ? null : user.id,
    }),
    // Tâches reçues et non validées : compteur affiché à côté de « Tâches » dans le menu.
    adminClient
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .is("completed_at", null),
  ]);

  const count = notifRes.count;
  // Sur erreur RPC, retour sur compteurs vides plutôt qu'une page cassée.
  // Le Drawer étant défensif (statusCounts[cat] ?? {} et statusCounts[cat]?.[s] ?? 0),
  // il affiche les mêmes zéros que l'ancien repli d'erreur, sans interrompre l'app.
  const statusCounts = countsRes.error
    ? {}
    : buildStatusCounts(countsRes.data ?? []);

  return (
    <SaveOnLeaveProvider>
      <div className="min-h-screen flex">
        <Suspense fallback={<div className="hidden lg:block w-64 shrink-0 gothic-surface" />}>
          <Drawer
            role={role ?? "telepro"}
            userName={profile?.full_name || user.email || undefined}
            unreadNotifications={count || 0}
            statusCounts={statusCounts}
            pendingTasks={tasksRes.count || 0}
          />
        </Suspense>
        <main className="flex-1 min-w-0 lg:ml-64 min-h-screen pt-16 lg:pt-8 pb-10 px-4 lg:px-10 bg-canvas">
          {children}
        </main>
      </div>
    </SaveOnLeaveProvider>
  );
}
