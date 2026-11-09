import { createAdminClient } from "@/lib/supabase/admin";
import { CreateLeadForm } from "./CreateLeadForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function AdminNewLeadPage() {
  const adminClient = createAdminClient();
  const { data: telepros } = await adminClient
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "telepro")
    .is("deleted_at", null)
    .order("full_name");

  return (
    <div className="space-y-5">
      <Link
        href="/admin/leads"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-subtle hover:text-ink -ml-1")}
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux leads
      </Link>

      <PageHeader title="Nouveau lead" />

      <CreateLeadForm telepros={telepros || []} />
    </div>
  );
}
