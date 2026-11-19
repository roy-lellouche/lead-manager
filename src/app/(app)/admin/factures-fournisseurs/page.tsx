import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/session";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { loadSupplierPayments, SUPPLIER_INVOICE_COLUMNS } from "@/lib/supplier-invoices-server";
import type { SupplierInvoice } from "@/lib/supplier-invoices";
import { SupplierInvoicesClient } from "./SupplierInvoicesClient";

export default async function SupplierInvoicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const role = normalizeRole(profile?.role);
  if (role !== "admin") redirect(roleLandingPath(role));

  const [invoicesRes, suppliersRes, paymentsRes] = await Promise.all([
    admin
      .from("supplier_invoices")
      .select(SUPPLIER_INVOICE_COLUMNS)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    admin.from("suppliers").select("id, name").order("name", { ascending: true }),
    loadSupplierPayments(admin),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Factures fournisseurs"
        subtitle="Glissez vos factures : fournisseur, montants et échéance sont lus automatiquement. Suivez ce qui reste à payer, fournisseur par fournisseur."
      />
      <SupplierInvoicesClient
        initialInvoices={(invoicesRes.data ?? []) as unknown as SupplierInvoice[]}
        initialSuppliers={suppliersRes.data ?? []}
        initialPayments={paymentsRes.data}
        loadError={invoicesRes.error?.message ?? null}
      />
    </div>
  );
}
