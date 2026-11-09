import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";

const STATUS_BADGE: Record<LeadStatus, string> = {
  nouveau: "bg-slate-100 text-slate-700",
  nrp: "bg-[#fef9c3] text-[#a16207]",
  a_rappeler: "bg-[#ffedd5] text-[#c2410c]",
  en_attente_doc: "bg-[#ede9fe] text-[#6d28d9]",
  documents_recus: "bg-[#e0e7ff] text-[#1a40ad]",
  devis_a_envoyer: "bg-[#f3e8ff] text-[#7e22ce]",
  devis_envoye: "bg-[#fce7f3] text-[#be185d]",
  incomplet: "bg-[#fef3c7] text-[#b45309]",
  bloque_mpr: "bg-[#fee2e2] text-[#b91c1c]",
  avis_2025_bloque: "bg-[#ffe4e6] text-[#9f1239]",
  pas_eligible: "bg-[#e7e5e4] text-[#44403c]",
  valide: "bg-[#dcfce7] text-[#15803d]",
  installe: "bg-[#ccfbf1] text-[#0f766e]",
  ancien_documents_recus: "bg-slate-100 text-slate-500",
  transfert: "bg-[#e0f2fe] text-[#0369a1]",
  annule: "bg-[#fee2e2] text-[#b91c1c]",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}
