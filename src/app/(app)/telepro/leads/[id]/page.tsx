import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTeleproLeadLogs } from "@/lib/telepro-logs";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TeleproLeadForm } from "../TeleproLeadForm";
import { LeadLogsSidebar } from "@/components/LeadLogsSidebar";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSessionUser } from "@/lib/supabase/session";

export default async function TeleproLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return null;

  const adminClient = createAdminClient();

  // Lectures en parallèle. Les documents et l'historique ne sont affichés que si
  // le lead appartient bien au télépro (notFound sinon, avant tout rendu).
  const [{ data: lead }, { data: teleproDocs }, { data: logs }] = await Promise.all([
    adminClient
      .from("leads")
      .select("*")
      .eq("id", id)
      .eq("assigned_to", user.id)
      .single(),
    adminClient
      .from("lead_documents")
      .select("id, type, file_name, storage_path, created_at")
      .eq("lead_id", id)
      .in("type", ["taxe_fonciere", "avis_imposition"]),
    fetchTeleproLeadLogs(adminClient, id),
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
      <div className="flex items-center justify-between">
        <Link
          href="/telepro/leads"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-[#64748b] hover:text-[#0b1f3a] -ml-1")}
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux leads
        </Link>
        <Link
          href={`/telepro/teleprospection?lead=${id}`}
          className={cn(buttonVariants({ variant: "default", size: "sm" }))}
        >
          Mode téléprospection
        </Link>
      </div>

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
        <div className="flex-1 min-w-0">
          <TeleproLeadForm
            lead={lead}
            leadId={id}
            teleproDocuments={teleproDocs || []}
          />
        </div>
        <LeadLogsSidebar logs={logEntries} />
      </div>
    </div>
  );
}
