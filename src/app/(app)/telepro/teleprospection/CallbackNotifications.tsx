"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface CallbackLead {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  callback_at: string;
}

export function CallbackNotifications() {
  const [leads, setLeads] = useState<CallbackLead[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const router = useRouter();

  const fetchDue = useCallback(async () => {
    try {
      const res = await fetch("/api/telepro/callback-due", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch {
      // ignore
    }
  }, []);

  // Ne pas poller quand l'onglet est en arrière-plan ; polling 3 min quand visible
  useEffect(() => {
    fetchDue();
    let interval: ReturnType<typeof setInterval> | null = null;
    const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 min (réduit les requêtes si onglet ouvert / PC en veille)
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

  const visible = leads.filter((l) => !dismissed.has(l.id));

  const handleDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDismissed((prev) => new Set(prev).add(id));
  };

  const handleClick = (id: string) => {
    router.push(`/telepro/teleprospection?lead=${id}`);
  };

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {visible.map((lead) => (
        <div
          key={lead.id}
          role="button"
          tabIndex={0}
          onClick={() => handleClick(lead.id)}
          onKeyDown={(e) => e.key === "Enter" && handleClick(lead.id)}
          className="rounded-[14px] border border-rose-200 bg-white shadow-[0_4px_12px_rgba(190,18,60,.12)] hover:shadow-[0_4px_16px_rgba(190,18,60,.18)] cursor-pointer transition-all flex items-start gap-3 p-4"
        >
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink">
              {lead.first_name} {lead.last_name}
            </p>
            <p className="text-sm text-subtle mt-0.5">{lead.phone}</p>
            <p className="text-xs text-rose-600 mt-1 font-medium uppercase tracking-wide">
              Rappel à effectuer
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => handleDismiss(e, lead.id)}
            className="p-1 rounded-[6px] hover:bg-rose-50 text-subtle shrink-0 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
