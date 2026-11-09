import { StatusBadge } from "@/components/StatusBadge";
import { formatDateParis, formatFullDateTimeParis } from "@/lib/date";
import type { LeadStatus } from "@/lib/types";

type ProfileRef = { full_name: string | null; email: string } | null;

export interface DistributionEntry {
  id: string;
  created_at: string;
  previous_status: LeadStatus | null;
  previous_nrp_count: number | null;
  previous_commentaire: string | null;
  previous_telepro_added_at: string | null;
  from: ProfileRef;
  to: ProfileRef;
}

const name = (p: ProfileRef) => (p ? p.full_name || p.email : "Télépro supprimé");

/**
 * Parcours réel du lead, visible uniquement par l'admin : vraie date d'ajout,
 * chaque télépro qui l'a eu et l'état du lead quand il lui a été retiré.
 */
export function RedistributionHistorySection({
  realAddedAt,
  distributions,
}: {
  realAddedAt: string | null;
  distributions: DistributionEntry[];
}) {
  if (distributions.length === 0) return null;

  return (
    <div className="bg-white rounded-[14px] border border-line p-5 shadow-card">
      <h2 className="text-lg font-semibold text-ink">Parcours du lead</h2>
      <p className="text-sm text-subtle mt-1 mb-4">
        Vraie date d&apos;ajout : <strong className="text-ink">{formatDateParis(realAddedAt)}</strong> ·
        redistribué {distributions.length} fois. Les télépros voient ce lead comme un lead neuf.
      </p>
      <ol className="space-y-3">
        {distributions.map((d, i) => (
          <li key={d.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-semibold text-subtle">#{i + 1}</span>
              <span className="text-subtle">{formatFullDateTimeParis(d.created_at)}</span>
              <span className="text-ink font-medium">
                {name(d.from)} → {name(d.to)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-subtle">
              <span>Chez {name(d.from)} depuis le {formatDateParis(d.previous_telepro_added_at)}</span>
              {d.previous_status && (
                <>
                  <span>· statut</span>
                  <StatusBadge status={d.previous_status} />
                </>
              )}
              {d.previous_nrp_count != null && <span>· appelé {d.previous_nrp_count} fois</span>}
            </div>
            {d.previous_commentaire && (
              <p className="mt-1.5 text-xs text-ink whitespace-pre-wrap bg-panel rounded-md px-2 py-1.5">
                {d.previous_commentaire}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
