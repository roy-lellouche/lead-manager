import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminLeadForm } from "./AdminLeadForm";
import { DocumentsSection } from "./DocumentsSection";
import { RedistributionHistorySection, type DistributionEntry } from "./RedistributionHistorySection";
import { LeadLogsSidebar } from "@/components/LeadLogsSidebar";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function AdminLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const adminClient = createAdminClient();

  // Les quatre lectures ne dépendent que de l'id : un seul aller-retour au lieu de quatre.
  const [{ data: lead }, { data: logs }, { data: documents }, { data: distributions }] = await Promise.all([
    adminClient
      .from("leads")
      .select("*")
      .eq("id", id)
      .single(),
    adminClient
      .from("lead_logs")
      .select(`
        *,
        profile:profiles!user_id(full_name)
      `)
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    adminClient
      .from("lead_documents")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    adminClient
      .from("lead_distributions")
      .select(`
        id,
        created_at,
        previous_status,
        previous_nrp_count,
        previous_commentaire,
        previous_telepro_added_at,
        from:profiles!from_telepro(full_name, email),
        to:profiles!to_telepro(full_name, email)
      `)
      .eq("lead_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!lead) notFound();

  const logEntries = (logs || []).map((log) => ({
    id: log.id,
    action: log.action,
    old_status: log.old_status,
    new_status: log.new_status,
    created_at: log.created_at,
    profile: log.profile,
  }));

  return (
    <div className="space-y-5">
      <Link
        href="/admin/leads"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-subtle hover:text-ink -ml-1")}
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux leads
      </Link>

      <PageHeader
        title={`${lead.first_name} ${lead.last_name}`}
        actions={
          lead.is_duplicate ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-0.5">
              Doublon
            </span>
          ) : undefined
        }
      />

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <AdminLeadForm lead={lead} />
          <RedistributionHistorySection
            realAddedAt={lead.added_at ?? lead.created_at}
            distributions={(distributions || []) as unknown as DistributionEntry[]}
          />
          <DocumentsSection leadId={id} documents={documents || []} />
        </div>
        <LeadLogsSidebar logs={logEntries} />
      </div>
    </div>
  );
}
