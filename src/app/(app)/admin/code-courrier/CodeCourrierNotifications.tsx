"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { X, Calendar as CalendarIcon } from "lucide-react";
import { formatDateParis, fromDatetimeLocalValueParis, toDatetimeLocalValueParis } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DISMISSED_STORAGE_KEY = "code-courrier-notifications-dismissed";

const SELECT_CLS =
  "w-full h-8 px-2.5 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40";

function loadDismissedFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedToStorage(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

interface CodeCourrierDue {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
  callback_at: string | null;
}

function getDaysSinceCreation(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

export function CodeCourrierNotifications() {
  const [entries, setEntries] = useState<CodeCourrierDue[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [dismissedLoaded, setDismissedLoaded] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CodeCourrierDue | null>(null);
  const [followUpAction, setFollowUpAction] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const router = useRouter();

  const fetchDue = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/code-courrier-due", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setDismissed(loadDismissedFromStorage());
    setDismissedLoaded(true);
  }, []);

  // Ne pas poller quand l'onglet est en arrière-plan ; 3 min quand visible (réduit requêtes si PC en veille)
  const POLL_INTERVAL_MS = 3 * 60 * 1000;
  useEffect(() => {
    fetchDue();
    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (!interval) interval = setInterval(fetchDue, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stopPolling();
      else {
        fetchDue();
        startPolling();
      }
    };
    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchDue]);

  const visible = dismissedLoaded ? entries.filter((e) => !dismissed.has(e.id)) : [];

  const handleDismiss = (ev: React.MouseEvent, id: string) => {
    ev.stopPropagation();
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      saveDismissedToStorage(next);
      return next;
    });
  };

  const handleClick = (entry: CodeCourrierDue) => {
    setSelectedEntry(entry);
    setFollowUpAction("");
    setCallbackDate("");
  };

  const closeModal = () => {
    setSelectedEntry(null);
    setFollowUpAction("");
    setCallbackDate("");
  };

  const handleFollowUp = async () => {
    if (!selectedEntry || !followUpAction) return;
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = { action: followUpAction };
      if (followUpAction === "a_rappeler" && callbackDate) {
        body.callback_at = fromDatetimeLocalValueParis(callbackDate);
      }
      await fetch(`/api/admin/code-courrier/${selectedEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      closeModal();
      setDismissed((prev) => {
        const next = new Set(prev).add(selectedEntry.id);
        saveDismissedToStorage(next);
        return next;
      });
      fetchDue();
      router.refresh();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {visible.length > 0 && (
        <>
          {/* Photo uniquement pour les rappels code courrier */}
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-2xl shrink-0">
            <Image
              src="/code-courrier-avatar.png"
              alt="Rappels code courrier"
              width={112}
              height={112}
              className="w-full h-full object-cover"
            />
          </div>
          {visible.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onClick={() => handleClick(entry)}
              onKeyDown={(e) => e.key === "Enter" && handleClick(entry)}
              className="rounded-[14px] bg-[#fff5f5] border border-[#fecaca] shadow-card p-4 hover:bg-[#fff1f2] cursor-pointer transition-colors flex items-start gap-3 w-full"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#991b1b]">
                  {entry.first_name} {entry.last_name}
                </p>
                <p className="text-sm text-[#b91c1c]">{entry.phone}</p>
                <p className="text-xs text-[#dc2626] mt-1">Rappel code courrier</p>
              </div>
              <button
                type="button"
                onClick={(e) => handleDismiss(e, entry.id)}
                className="p-1 rounded-lg hover:bg-[#fecaca] text-[#dc2626] shrink-0"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
        </>
      )}

      {/* Modal suivi */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="rounded-[14px] border border-line bg-white shadow-card w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-line">
              <h3 className="text-lg font-semibold text-ink">Code courrier</h3>
              <Button variant="ghost" size="icon-sm" onClick={closeModal}>
                <X />
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-subtle">Nom</p>
                  <p className="font-medium text-ink">{selectedEntry.last_name}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Prénom</p>
                  <p className="font-medium text-ink">{selectedEntry.first_name}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Téléphone</p>
                  <p className="font-medium text-ink">{selectedEntry.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Date de création</p>
                  <p className="font-medium text-ink">{formatDateParis(selectedEntry.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Jours écoulés</p>
                  <p className="font-medium text-ink">{getDaysSinceCreation(selectedEntry.created_at)} jour(s)</p>
                </div>
              </div>

              {selectedEntry.callback_at && (
                <div className="bg-brand-soft border border-brand-line rounded-[10px] p-3">
                  <p className="text-sm text-brand-strong">
                    <CalendarIcon className="w-4 h-4 inline mr-1" />
                    Rappel prévu le {formatDateParis(selectedEntry.callback_at)}
                  </p>
                </div>
              )}

              <div className="border-t border-line pt-3">
                <label className="block text-sm font-medium text-ink mb-2">Suivi</label>
                <select
                  value={followUpAction}
                  onChange={(e) => {
                    setFollowUpAction(e.target.value);
                    if (e.target.value === "a_rappeler") {
                      setCallbackDate(toDatetimeLocalValueParis(new Date().toISOString()));
                    } else {
                      setCallbackDate("");
                    }
                  }}
                  className={SELECT_CLS}
                >
                  <option value="">Sélectionner une action...</option>
                  <option value="nrp">NRP</option>
                  <option value="a_rappeler">À rappeler</option>
                  <option value="annule">Annulé</option>
                </select>

                {followUpAction === "a_rappeler" && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-ink mb-1">Date et heure du rappel</label>
                    <Input
                      type="datetime-local"
                      value={callbackDate}
                      onChange={(e) => setCallbackDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-line flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal}>
                Fermer
              </Button>
              <Button
                onClick={handleFollowUp}
                disabled={actionLoading || !followUpAction || (followUpAction === "a_rappeler" && !callbackDate)}
              >
                {actionLoading ? "En cours..." : "Valider"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
