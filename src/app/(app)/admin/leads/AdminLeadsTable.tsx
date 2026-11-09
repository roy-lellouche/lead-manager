"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LEAD_STATUS_LABELS, LEAD_STATUSES_ADMIN, LEAD_CATEGORIES, LEAD_CATEGORY_LABELS, type LeadCategory, type LeadStatus } from "@/lib/types";
import { formatDateParis } from "@/lib/date";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CategoryChip } from "@/components/CategoryChip";

function getStatusSelectClass(status: string): string {
  switch (status) {
    case "nouveau": return "bg-blue-100 text-blue-800 border-blue-200";
    case "nrp": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "a_rappeler": return "bg-blue-800 text-white border-blue-900";
    case "en_attente_doc": return "bg-green-100 text-green-800 border-green-200";
    case "documents_recus": return "bg-green-700 text-white border-green-800";
    case "devis_a_envoyer": return "bg-[#f3e8ff] text-[#7e22ce] border-[#e9d5ff]";
    case "devis_envoye": return "bg-[#fce7f3] text-[#be185d] border-[#f9a8d4]";
    case "incomplet": return "bg-amber-100 text-amber-800 border-amber-200";
    case "bloque_mpr": return "bg-red-800 text-white border-red-900";
    case "valide": return "bg-emerald-700 text-white border-emerald-800";
    case "installe": return "bg-teal-200 text-teal-900 border-teal-300";
    case "ancien_documents_recus": return "bg-slate-500 text-white border-slate-600";
    case "transfert": return "bg-sky-100 text-sky-800 border-sky-200";
    case "annule": return "bg-red-100 text-red-800 border-red-200";
    default: return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export type StatusSortDirection = "none" | "desc" | "asc";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
  category: LeadCategory | null;
  nrp_count: number;
  is_duplicate: boolean;
  profile: { full_name: string; email: string } | null;
  added_at: string | null;
  commentaire: string | null;
  status_changed_at: string | null;
}

interface AdminLeadsTableProps {
  leads: Lead[];
  telepros: { id: string; full_name: string | null; email: string }[];
  /** Exclure ce télépro de la liste des cibles (ex: page redistribution) */
  excludeTeleproId?: string;
  statusSort: StatusSortDirection;
}

export function AdminLeadsTable({ leads, telepros, excludeTeleproId, statusSort }: AdminLeadsTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const handleStatusChange = useCallback(async (leadId: string, newStatus: LeadStatus, oldStatus: string) => {
    if (newStatus === oldStatus) return;
    setUpdatingId(leadId);
    const body: Record<string, unknown> = {
      status: newStatus,
      logAction: "Changement de statut",
      logOldStatus: oldStatus,
      logNewStatus: newStatus,
    };
    if (newStatus === "a_rappeler") body.callback_at = null;
    const res = await fetch(`/api/admin/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Lead-Form-Version": "2" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    setUpdatingId(null);
    if (res.ok) router.refresh();
  }, [router]);

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

  const targetTelepros = excludeTeleproId
    ? telepros.filter((t) => t.id !== excludeTeleproId)
    : telepros;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  };

  const [deleting, setDeleting] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleBulkStatusChange = async () => {
    if (selected.size === 0 || !bulkStatus) return;
    setUpdatingStatus(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/update-leads-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadIds: Array.from(selected),
          newStatus: bulkStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSelected(new Set());
        setBulkStatus("");
        setError(null);
        router.refresh();
      } else {
        setError(data?.error || `Erreur ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const [bulkCategory, setBulkCategory] = useState("");
  const [updatingCategory, setUpdatingCategory] = useState(false);

  const handleBulkCategoryChange = async () => {
    if (selected.size === 0 || !bulkCategory) return;
    setUpdatingCategory(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/update-leads-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadIds: Array.from(selected),
          newCategory: bulkCategory,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSelected(new Set());
        setBulkCategory("");
        setError(null);
        router.refresh();
      } else {
        setError(data?.error || `Erreur ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setUpdatingCategory(false);
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Supprimer ${selected.size} lead(s) ? Cette action est irréversible.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/delete-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSelected(new Set());
        setError(null);
        router.refresh();
      } else {
        setError(data?.error || `Erreur ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setDeleting(false);
    }
  };

  const handleTransfer = async () => {
    if (selected.size === 0 || !targetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/transfer-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadIds: Array.from(selected),
          targetTeleproId: targetId,
        }),
      });
      const text = await res.text();
      let data: { error?: string; message?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text || `Réponse invalide (${res.status})` };
      }
      if (res.ok) {
        setSelected(new Set());
        setTargetId("");
        setError(null);
        router.refresh();
      } else {
        const msg = data?.error || data?.message || `Erreur ${res.status}: ${text.slice(0, 200) || res.statusText}`;
        setError(msg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 rounded-[14px] border border-red-200 bg-red-50 text-red-800 text-sm flex items-center gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 underline hover:no-underline text-red-700"
          >
            Fermer
          </button>
        </div>
      )}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-[14px] border border-line bg-canvas">
          <span className="font-medium text-ink text-sm">
            {selected.size} lead(s) sélectionné(s)
          </span>
          <select
            value={bulkStatus}
            onChange={(e) => {
              setBulkStatus(e.target.value);
              setError(null);
            }}
            className="h-8 px-3 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            <option value="">Changer le statut...</option>
            {LEAD_STATUSES_ADMIN.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Button
            onClick={handleBulkStatusChange}
            disabled={!bulkStatus || updatingStatus}
            variant="secondary"
            size="sm"
          >
            {updatingStatus ? "Mise à jour..." : "Appliquer statut"}
          </Button>
          <select
            value={bulkCategory}
            onChange={(e) => {
              setBulkCategory(e.target.value);
              setError(null);
            }}
            data-testid="bulk-category-select"
            className="h-8 px-3 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            <option value="">Changer la catégorie...</option>
            {LEAD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {LEAD_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <Button
            onClick={handleBulkCategoryChange}
            disabled={!bulkCategory || updatingCategory}
            variant="secondary"
            size="sm"
          >
            {updatingCategory ? "Mise à jour..." : "Appliquer catégorie"}
          </Button>
          <select
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setError(null);
            }}
            className="h-8 px-3 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            <option value="">
              {targetTelepros.length === 0
                ? "Aucun télépro disponible"
                : "Transférer vers..."}
            </option>
            {targetTelepros.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || t.email}
              </option>
            ))}
          </select>
          <Button
            onClick={handleTransfer}
            disabled={!targetId || loading || targetTelepros.length === 0}
            size="sm"
          >
            {loading ? "Transfert..." : "Transférer"}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            variant="destructive"
            size="sm"
          >
            {deleting ? "Suppression..." : "Supprimer"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setError(null);
            }}
            className="text-sm text-subtle hover:text-ink"
          >
            Annuler
          </button>
        </div>
      )}

      <div className="rounded-[14px] border border-line bg-white shadow-card overflow-hidden">
        <Table>
          <TableHeader className="bg-canvas border-b border-line">
            <TableRow className="hover:bg-transparent border-0">
              <TableHead className="w-10 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === leads.length && leads.length > 0}
                  onChange={toggleAll}
                  className="rounded border-line"
                />
              </TableHead>
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
                Catégorie
              </TableHead>
              <TableHead className="py-3 text-xs font-semibold text-subtle uppercase tracking-wide">
                Télépro
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
                <TableCell colSpan={8} className="py-12 text-center text-subtle">
                  Aucun lead trouvé
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  onClick={() => router.push(`/admin/leads/${lead.id}`)}
                  className="border-b border-line cursor-pointer hover:bg-canvas transition-colors"
                  data-testid="lead-row"
                  data-lead-id={lead.id}
                >
                  <TableCell className="py-3 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded border-line"
                    />
                  </TableCell>
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
                        {LEAD_STATUSES_ADMIN.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_STATUS_LABELS[s]}
                            {s === "nrp" && lead.nrp_count > 0
                              ? ` (${lead.nrp_count})`
                              : ""}
                          </option>
                        ))}
                      </select>
                  </TableCell>
                  <TableCell className="py-3">
                    {lead.category ? (
                      <CategoryChip category={lead.category} />
                    ) : (
                      <span className="text-subtle text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-subtle">
                    {lead.profile?.full_name || lead.profile?.email || "-"}
                  </TableCell>
                  <TableCell className="py-3 text-subtle text-sm">
                    {lead.added_at
                      ? formatDateParis(lead.added_at)
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
    </div>
  );
}
