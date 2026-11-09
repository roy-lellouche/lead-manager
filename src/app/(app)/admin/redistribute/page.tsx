import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminLeadsTable } from "../leads/AdminLeadsTable";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { ChevronLeft } from "lucide-react";

export default async function AdminRedistributePage({
  searchParams,
}: {
  searchParams: Promise<{ telepro?: string; sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const teleproId = params.telepro;

  const statusSort = params.sort === "status_changed_at" && (params.dir === "asc" || params.dir === "desc")
    ? params.dir
    : "none";

  if (!teleproId) {
    redirect("/admin/leads");
  }

  const adminClient = createAdminClient();

  const { data: telepro } = await adminClient
    .from("profiles")
    .select("id, full_name, email, deleted_at")
    .eq("id", teleproId)
    .single();

  if (!telepro) {
    redirect("/admin/leads");
  }

  const leadsQuery = adminClient
    .from("leads")
    .select(`
      *,
      profile:profiles!assigned_to(full_name, email)
    `)
    .eq("assigned_to", teleproId);

  const { data: leads } = await (statusSort !== "none"
    ? leadsQuery.order("status_changed_at", { ascending: statusSort === "asc", nullsFirst: false })
    : leadsQuery.order("created_at", { ascending: false }));

  const { data: activeTelepros } = await adminClient
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "telepro")
    .is("deleted_at", null)
    .order("full_name");

  const teleproName = telepro.full_name || telepro.email;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand-hover font-medium"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour aux utilisateurs
      </Link>

      <PageHeader
        title="Redistribuer les leads"
        subtitle={<>Leads de <strong className="text-ink">{teleproName}</strong> à redistribuer. Sélectionnez les leads et transférez-les vers un autre télépro.</>}
      />

      <div className="rounded-[14px] border border-amber-200 bg-amber-50 shadow-card p-4">
        <p className="text-amber-800 text-sm font-medium">
          {leads?.length || 0} lead(s) à redistribuer
        </p>
      </div>

      <AdminLeadsTable
        leads={leads || []}
        telepros={activeTelepros || []}
        excludeTeleproId={teleproId}
        statusSort={statusSort}
      />
    </div>
  );
}
