"use client";

import { statusClasses } from "@/lib/statusColors";
import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LEAD_STATUS_LABELS, LEAD_STATUSES_TELEPRO_SELECTABLE, type LeadStatus } from "@/lib/types";
import { formatDateParis, formatFullDateTimeParis } from "@/lib/date";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

function getStatusSelectClass(status: string): string {
  return statusClasses(status);
}

export type StatusSortDirection = "none" | "desc" | "asc";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
  callback_at: string | null;
  nrp_count: number;
  is_duplicate: boolean;
  telepro_added_at: string | null;
  commentaire: string | null;
  status_changed_at: string | null;
}

interface TeleproLeadsTableProps {
  leads: Lead[];
  statusSort: StatusSortDirection;
}

export function TeleproLeadsTable({ leads, statusSort }: TeleproLeadsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // Cycle inchangé pour l'utilisateur (aucun → décroissant → croissant), mais l'ordre est
  // désormais appliqué par le serveur sur l'ensemble du résultat, pas sur la seule page affichée.
  const toggleStatusSort = () => {
    const next: StatusSortDirection =
      statusSort === "none" ? "desc" : statusSort === "desc" ? "asc" : "none";

    const params = new URLSearchParams(searchParams.toString());
    if (next === "none") {
      params.delete("sort");
      params.delete("dir");
    } else {
      params.set("sort", "status_changed_at");
      params.set("dir", next);
    }
    // Changer l'ordre invalide la position courante.
    params.delete("page");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleCommentSave = useCallback(async (leadId: string, value: string) => {
    setEditingCommentId(null);
    const res = await fetch(`/api/telepro/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ commentaire: value || null }),
    });
    if (res.ok) router.refresh();
    setCommentDrafts((d) => {
      const next = { ...d };
      delete next[leadId];
      return next;
    });
  }, [router]);

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus, oldStatus: string) => {
    if (newStatus === oldStatus) return;
    setUpdatingId(leadId);

    const body: Record<string, unknown> = {
      status: newStatus,
      logAction: "Changement de statut",
      logOldStatus: oldStatus,
      logNewStatus: newStatus,
    };
    if (newStatus === "a_rappeler") {
      body.callback_at = null;
    }

    const res = await fetch(`/api/telepro/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    setUpdatingId(null);
    if (res.ok) router.refresh();
  };

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-card overflow-hidden">
      <Table>
        <TableHeader className="bg-canvas border-b border-line">
          <TableRow className="hover:bg-transparent border-0">
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Nom
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Téléphone
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              <button
                type="button"
                onClick={toggleStatusSort}
                className="inline-flex items-center gap-1 hover:text-ink transition-colors"
              >
                Statut
                {statusSort === "none" && <ArrowUpDown className="w-3.5 h-3.5 text-subtle" />}
                {statusSort === "desc" && <ArrowDown className="w-3.5 h-3.5 text-brand" />}
                {statusSort === "asc" && <ArrowUp className="w-3.5 h-3.5 text-brand" />}
              </button>
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Rappel
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Date ajout
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide min-w-[180px]">
              Commentaires
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center text-subtle">
                Aucun lead trouvé
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
              <TableRow
                key={lead.id}
                onClick={() => router.push(`/telepro/leads/${lead.id}`)}
                className="border-b border-line cursor-pointer hover:bg-canvas transition-colors"
                data-testid="lead-row"
                data-lead-id={lead.id}
              >
                <TableCell className="py-3">
                  <span className="font-medium text-ink">
                    {lead.first_name} {lead.last_name}
                    {lead.is_duplicate && (
                      <span className="ml-2 text-xs text-amber-600">
                        Doublon
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-3 text-subtle">{lead.phone}</TableCell>
                <TableCell
                  className="py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <select
                    value={lead.status}
                    onChange={(e) =>
                      handleStatusChange(
                        lead.id,
                        e.target.value as LeadStatus,
                        lead.status
                      )
                    }
                    disabled={updatingId === lead.id}
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-[9px] border cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-1 disabled:opacity-50 ${getStatusSelectClass(lead.status)}`}
                  >
                    {LEAD_STATUSES_TELEPRO_SELECTABLE.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                        {s === "nrp" && lead.nrp_count > 0
                          ? ` (${lead.nrp_count})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="py-3 text-subtle">
                  {lead.callback_at
                    ? formatFullDateTimeParis(lead.callback_at)
                    : "-"}
                </TableCell>
                <TableCell className="py-3 text-subtle text-sm">
                  {lead.telepro_added_at
                    ? formatDateParis(lead.telepro_added_at)
                    : "-"}
                </TableCell>
                <TableCell
                  className="py-3 min-w-[180px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {editingCommentId === lead.id ? (
                    <input
                      type="text"
                      value={commentDrafts[lead.id] ?? lead.commentaire ?? ""}
                      onChange={(e) =>
                        setCommentDrafts((d) => ({
                          ...d,
                          [lead.id]: e.target.value,
                        }))
                      }
                      onBlur={() =>
                        handleCommentSave(
                          lead.id,
                          commentDrafts[lead.id] ?? lead.commentaire ?? ""
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      autoFocus
                      className="w-full px-2 py-1 text-sm border border-line rounded-[9px] focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCommentId(lead.id);
                        setCommentDrafts((d) => ({
                          ...d,
                          [lead.id]: lead.commentaire ?? "",
                        }));
                      }}
                      className="w-full text-left px-2 py-1 text-sm text-subtle hover:bg-canvas rounded-[9px] truncate block"
                      title={lead.commentaire ?? "Cliquer pour ajouter un commentaire"}
                    >
                      {lead.commentaire || "—"}
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
