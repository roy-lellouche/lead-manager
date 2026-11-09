"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { formatDateParis, formatTimeParis } from "@/lib/date";

const DISMISSED_STORAGE_KEY = "rappels-notifications-dismissed";

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

interface RappelDue {
  id: string;
  name: string;
  description: string | null;
  callback_at: string;
  created_at: string;
}

export function RappelsNotifications() {
  const [entries, setEntries] = useState<RappelDue[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [dismissedLoaded, setDismissedLoaded] = useState(false);
  const router = useRouter();

  const fetchDue = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/rappels-due", { credentials: "include" });
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

  const handleClick = (id: string) => {
    router.push(`/admin/agenda-courrier`);
  };

  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((entry) => (
        <div
          key={entry.id}
          role="button"
          tabIndex={0}
          onClick={() => handleClick(entry.id)}
          onKeyDown={(e) => e.key === "Enter" && handleClick(entry.id)}
          className="rounded-[14px] bg-white border border-line shadow-card p-4 hover:bg-panel cursor-pointer transition-colors flex items-start gap-3 w-full"
        >
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink">{entry.name}</p>
            {entry.description && (
              <p className="text-sm text-subtle mt-0.5 line-clamp-2">{entry.description}</p>
            )}
            <p className="text-xs text-faint mt-1">
              {formatDateParis(entry.callback_at)} à {formatTimeParis(entry.callback_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => handleDismiss(e, entry.id)}
            className="p-1 rounded-lg hover:bg-line text-subtle shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ))}
    </>
  );
}
