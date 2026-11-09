"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDateParis } from "@/lib/date";
import { INSTALLATION_TYPE_LABELS, type InstallationType } from "@/lib/types";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  delegataire_group: string | null;
  profile: { full_name: string } | null;
  is_installe: boolean;
  is_depot_mpr: boolean;
  is_cee_paye: boolean;
  is_mpe_paye: boolean;
  profitability: number | null;
  added_at: string | null;
  commentaire: string | null;
  installation_type: InstallationType | null;
}

interface DocumentsRecusTableProps {
  leads: Lead[];
}

function BoolCell({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✓</span>
  ) : (
    <span className="text-subtle">—</span>
  );
}

export function DocumentsRecusTable({ leads }: DocumentsRecusTableProps) {
  const router = useRouter();
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const handleCommentSave = useCallback(async (leadId: string, value: string) => {
    setEditingCommentId(null);
    const res = await fetch(`/api/admin/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Lead-Form-Version": "2" },
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

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-card overflow-hidden">
      <Table>
        <TableHeader className="bg-canvas border-b border-line">
          <TableRow className="hover:bg-transparent border-0">
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Nom
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Mandataire
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Type d&apos;installation
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Télépro
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Installé
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Dépôt MPR
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              CEE payé
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              MPR payé
            </TableHead>
            <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
              Rentabilité
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
              <TableCell colSpan={11} className="py-12 text-center text-subtle">
                Aucun lead en Documents reçus
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
              <TableRow
                key={lead.id}
                onClick={() => router.push(`/admin/leads/${lead.id}`)}
                className="border-b border-line cursor-pointer hover:bg-canvas transition-colors"
              >
                <TableCell className="py-3">
                  <span className="font-medium text-ink">
                    {lead.first_name} {lead.last_name}
                  </span>
                </TableCell>
                <TableCell className="py-3 text-subtle">
                  {lead.delegataire_group || "—"}
                </TableCell>
                <TableCell className="py-3 text-subtle">
                  {lead.installation_type
                    ? INSTALLATION_TYPE_LABELS[lead.installation_type]
                    : "—"}
                </TableCell>
                <TableCell className="py-3 text-subtle">
                  {lead.profile?.full_name || "—"}
                </TableCell>
                <TableCell className="py-3">
                  <BoolCell value={lead.is_installe} />
                </TableCell>
                <TableCell className="py-3">
                  <BoolCell value={lead.is_depot_mpr} />
                </TableCell>
                <TableCell className="py-3">
                  <BoolCell value={lead.is_cee_paye} />
                </TableCell>
                <TableCell className="py-3">
                  <BoolCell value={lead.is_mpe_paye} />
                </TableCell>
                <TableCell className="py-3 font-medium text-ink">
                  {lead.profitability != null
                    ? `${Number(lead.profitability).toFixed(2)} €`
                    : "—"}
                </TableCell>
                <TableCell className="py-3 text-subtle text-sm">
                  {lead.added_at
                    ? formatDateParis(lead.added_at)
                    : "—"}
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
