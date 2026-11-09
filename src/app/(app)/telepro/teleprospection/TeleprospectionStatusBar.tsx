"use client";

import { useState, useEffect } from "react";
import { LEAD_STATUS_LABELS, LEAD_STATUSES_TELEPRO_SELECTABLE, type LeadStatus } from "@/lib/types";
import {
  toDatetimeLocalValueParis,
  fromDatetimeLocalValueParis,
} from "@/lib/date";

const CARD_CLS =
  "rounded-[14px] border border-line bg-white shadow-card";

function formatPhoneDisplay(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("33") && digits.length >= 11) {
    return `+33 ${digits.slice(2, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+33 ${digits.slice(1, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
  }
  return String(phone ?? "");
}

function getStatusButtonClass(status: LeadStatus, isSelected: boolean): string {
  if (!isSelected) return "bg-panel hover:bg-line-soft border border-line text-subtle";
  switch (status) {
    case "nouveau": return "bg-slate-100 text-slate-700 border border-slate-200";
    case "nrp": return "bg-[#fef9c3] text-[#a16207] border border-[#fde68a]";
    case "a_rappeler": return "bg-ink-soft text-white border border-ink-soft";
    case "en_attente_doc": return "bg-[#d1fae5] text-[#065f46] border border-[#6ee7b7]";
    case "documents_recus": return "bg-[#065f46] text-white border border-[#065f46]";
    case "devis_a_envoyer": return "bg-[#f3e8ff] text-[#7e22ce] border border-[#e9d5ff]";
    case "devis_envoye": return "bg-[#fce7f3] text-[#be185d] border border-[#f9a8d4]";
    case "incomplet": return "bg-[#fef3c7] text-[#b45309] border border-[#fcd34d]";
    case "bloque_mpr": return "bg-[#7f1d1d] text-white border border-[#7f1d1d]";
    case "valide": return "bg-[#14532d] text-white border border-[#14532d]";
    case "installe": return "bg-[#99f6e4] text-[#134e4a] border border-[#5eead4]";
    case "ancien_documents_recus": return "bg-faint text-white border border-faint";
    case "transfert": return "bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]";
    case "annule": return "bg-[#fee2e2] text-[#b91c1c] border border-[#fca5a5]";
    default: return "bg-panel text-subtle border border-line";
  }
}

function getDefaultCallbackDatetime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  d.setMinutes(0);
  return toDatetimeLocalValueParis(d.toISOString());
}

function StatusButton({
  status,
  currentStatus,
  initialCallbackAt,
  onSelect,
  disabled,
}: {
  status: LeadStatus;
  currentStatus: LeadStatus;
  initialCallbackAt?: string | null;
  onSelect: (callbackAt?: string) => void;
  disabled: boolean;
}) {
  const isAlreadyRappeler = currentStatus === "a_rappeler";
  const [showCallback, setShowCallback] = useState(isAlreadyRappeler);
  const [callbackAt, setCallbackAt] = useState(() =>
    initialCallbackAt ? toDatetimeLocalValueParis(initialCallbackAt) : getDefaultCallbackDatetime()
  );

  useEffect(() => {
    if (initialCallbackAt) {
      setCallbackAt(toDatetimeLocalValueParis(initialCallbackAt));
    }
  }, [initialCallbackAt]);

  const handleSaveCallback = () => {
    if (!callbackAt) return;
    const iso = fromDatetimeLocalValueParis(callbackAt);
    if (!iso) return;
    onSelect(iso);
    setShowCallback(false);
  };

  if (status === "a_rappeler") {
    return (
      <div className="inline-block">
        {showCallback && (
          <div className="flex gap-2 items-center">
            <input
              type="datetime-local"
              value={callbackAt}
              onChange={(e) => setCallbackAt(e.target.value)}
              className="h-9 px-3 border border-line rounded-[9px] text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
            <button
              type="button"
              onClick={handleSaveCallback}
              disabled={disabled || !callbackAt}
              className="h-9 px-4 bg-ink-soft text-white rounded-[9px] text-sm font-medium hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              OK
            </button>
            {!isAlreadyRappeler && (
              <button
                type="button"
                onClick={() => setShowCallback(false)}
                className="text-subtle text-sm hover:text-ink"
              >
                Annuler
              </button>
            )}
          </div>
        )}
        {!showCallback && (
          <button
            type="button"
            onClick={() => setShowCallback(true)}
            disabled={disabled}
            className={`px-4 py-2 rounded-[9px] text-sm font-medium transition-colors ${getStatusButtonClass(status, currentStatus === status)}`}
          >
            {LEAD_STATUS_LABELS[status]}
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect()}
      disabled={disabled}
      className={`px-4 py-2 rounded-[9px] text-sm font-medium transition-colors ${getStatusButtonClass(status, currentStatus === status)}`}
    >
      {LEAD_STATUS_LABELS[status]}
    </button>
  );
}

interface TeleprospectionStatusBarProps {
  lead: Record<string, unknown>;
  leadId: string;
  nextLeadId: string | null;
  onStatusChangeSuccess: (nextId: string | null) => void;
  onNrpClickSuccess: (nextId: string | null) => void;
  onLeadUpdate: (updates: Record<string, unknown>) => void;
}

export function TeleprospectionStatusBar({
  lead,
  leadId,
  nextLeadId,
  onStatusChangeSuccess,
  onNrpClickSuccess,
  onLeadUpdate,
}: TeleprospectionStatusBarProps) {
  const [saving, setSaving] = useState(false);

  const handleStatusChange = async (newStatus: LeadStatus, callbackAt?: string) => {
    if (!lead || saving) return;
    setSaving(true);
    const updates = {
      status: newStatus,
      callback_at: newStatus === "a_rappeler" && callbackAt ? callbackAt : null,
    };
    const res = await fetch(`/api/telepro/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...updates,
        logAction: "Changement de statut",
        logOldStatus: lead.status,
        logNewStatus: newStatus,
      }),
    });
    setSaving(false);
    if (res.ok) {
      onLeadUpdate(updates);
      onStatusChangeSuccess(nextLeadId ?? null);
    }
  };

  const handleNrpClick = async () => {
    if (!lead || saving) return;
    setSaving(true);
    const newCount = ((lead.nrp_count as number) || 0) + 1;
    const res = await fetch(`/api/telepro/lead/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        nrp_count: newCount,
        logAction: "NRP - Lead rappelé sans réponse",
        logOldStatus: "nrp",
        logNewStatus: "nrp",
      }),
    });
    setSaving(false);
    if (res.ok) {
      onLeadUpdate({ nrp_count: newCount });
      onNrpClickSuccess(nextLeadId ?? null);
    }
  };

  return (
    <div className={`${CARD_CLS} p-6 mt-4`}>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-3">
            Disposition de l&apos;appel
          </p>
          <p className="text-xl font-semibold text-ink">
            {String(lead.first_name ?? "")} {String(lead.last_name ?? "")}
          </p>
          <p className="text-2xl font-bold text-ink mt-1">
            {formatPhoneDisplay(lead.phone as string)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES_TELEPRO_SELECTABLE.map((s) => (
            <StatusButton
              key={s}
              status={s}
              currentStatus={lead.status as LeadStatus}
              initialCallbackAt={lead.callback_at as string | null | undefined}
              onSelect={(callbackAt) => handleStatusChange(s, callbackAt)}
              disabled={saving}
            />
          ))}
        </div>
        {(lead.status as string) === "nrp" && (
          <button
            type="button"
            onClick={handleNrpClick}
            disabled={saving}
            className="px-4 py-2 bg-[#fef9c3] text-[#a16207] border border-[#fde68a] rounded-[9px] hover:bg-[#fef3c7] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Toujours NRP (appelé {(lead.nrp_count as number) || 0} fois)
          </button>
        )}
      </div>
    </div>
  );
}
