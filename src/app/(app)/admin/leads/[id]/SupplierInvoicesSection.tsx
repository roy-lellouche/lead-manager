import Link from "next/link";
import { FileText } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel } from "@/components/ui-kit/Panel";
import { formatEuro } from "@/lib/finance/format";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  invoiceStatus,
  round2,
  todayParis,
  type SupplierInvoice,
} from "@/lib/supplier-invoices";

function formatDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** Factures fournisseurs rattachées au chantier : le matériel réellement facturé. */
export async function SupplierInvoicesSection({ leadId }: { leadId: string }) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("supplier_invoices")
    .select("id, supplier_name, invoice_number, invoice_date, due_date, amount_ht, amount_ttc, amount_paid, paid_at, description, storage_path")
    .eq("lead_id", leadId)
    .order("invoice_date", { ascending: true });
  const invoices = (data ?? []) as Pick<
    SupplierInvoice,
    "id" | "supplier_name" | "invoice_number" | "invoice_date" | "due_date" | "amount_ht" | "amount_ttc" | "amount_paid" | "paid_at" | "description" | "storage_path"
  >[];
  if (invoices.length === 0) return null;

  const today = todayParis();
  const totalHt = round2(invoices.reduce((n, i) => n + Number(i.amount_ht ?? i.amount_ttc ?? 0), 0));
  const totalTtc = round2(invoices.reduce((n, i) => n + Number(i.amount_ttc ?? 0), 0));

  return (
    <Panel
      title="Factures fournisseurs (matériel et pose)"
      description={`${invoices.length} facture(s) · ${formatEuro(totalHt)} HT · ${formatEuro(totalTtc)} TTC`}
      action={
        <Link href="/admin/factures-fournisseurs" className="text-xs font-medium text-brand hover:underline">
          Toutes les factures
        </Link>
      }
      bodyClassName="px-0 pb-2 pt-3 overflow-x-auto"
    >
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-subtle">
            <th className="px-5 py-2 font-medium">Fournisseur</th>
            <th className="px-2 py-2 font-medium">N° / objet</th>
            <th className="px-2 py-2 font-medium">Date</th>
            <th className="px-2 py-2 font-medium text-right">HT</th>
            <th className="px-2 py-2 font-medium">Statut</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const status = invoiceStatus(inv, today);
            return (
              <tr key={inv.id} className="border-t border-line">
                <td className="px-5 py-2 font-medium text-ink">{inv.supplier_name ?? "—"}</td>
                <td className="px-2 py-2">
                  <div>{inv.invoice_number ?? "—"}</div>
                  {inv.description && <div className="max-w-[240px] truncate text-xs text-subtle">{inv.description}</div>}
                </td>
                <td className="px-2 py-2 tabular-nums">{formatDate(inv.invoice_date)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatEuro(inv.amount_ht ?? inv.amount_ttc)}</td>
                <td className="px-2 py-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[status]}`}>
                    {INVOICE_STATUS_LABELS[status]}
                  </span>
                </td>
                <td className="px-5 py-2 text-right">
                  {inv.storage_path && (
                    <a
                      href={`/api/admin/supplier-invoices/${inv.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Voir la facture"
                      className="inline-flex rounded-md p-1.5 text-subtle hover:bg-line-soft hover:text-ink"
                    >
                      <FileText className="h-4 w-4" />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
