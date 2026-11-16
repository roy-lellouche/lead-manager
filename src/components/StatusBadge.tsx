import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";
import { statusClasses } from "@/lib/statusColors";

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClasses(status)}`}
    >
      {LEAD_STATUS_LABELS[status] ?? status}
    </span>
  );
}
