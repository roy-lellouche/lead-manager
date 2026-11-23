import { createAdminClient } from "@/lib/supabase/admin";
import { CreateUserForm } from "./CreateUserForm";
import { UsersTable } from "./UsersTable";
import { PageHeader } from "@/components/ui-kit/PageHeader";

export default async function AdminUsersPage() {
  const adminClient = createAdminClient();

  const { data: usersWithDeleted, error } = await adminClient
    .from("profiles")
    .select("id, full_name, email, role, created_at, deleted_at")
    .order("created_at", { ascending: false });

  let users: { id: string; full_name: string | null; email: string; role: string; created_at: string; deleted_at?: string | null }[] = [];

  if (error) {
    const fallback = await adminClient
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .order("created_at", { ascending: false });
    users = fallback.data || [];
  } else {
    users = usersWithDeleted || [];
  }

  const activeUsers = users.filter((u) => !u.deleted_at);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Utilisateurs"
        subtitle="Créez des comptes télépro, secrétaire, stockage ou responsable CEE et gérez les utilisateurs"
      />

      <CreateUserForm />

      <UsersTable users={activeUsers} />
    </div>
  );
}
