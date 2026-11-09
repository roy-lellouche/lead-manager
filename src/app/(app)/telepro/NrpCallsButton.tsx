"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_DURATION_MS = 120000;

export function NrpCallsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noAnswer, setNoAnswer] = useState(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setPolling(false);
  }, []);

  const pollPendingLead = useCallback(() => {
    if (Date.now() - pollStartRef.current > POLL_MAX_DURATION_MS) {
      stopPolling();
      return;
    }
    fetch("/api/telepro/pending-lead", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.noAnswer) {
          stopPolling();
          setNoAnswer(true);
          return;
        }
        if (data.leadId) {
          stopPolling();
          router.push(`/telepro/leads/${data.leadId}`);
          return;
        }
        pollTimeoutRef.current = setTimeout(pollPendingLead, POLL_INTERVAL_MS);
      })
      .catch(() => {
        pollTimeoutRef.current = setTimeout(pollPendingLead, POLL_INTERVAL_MS);
      });
  }, [router, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleStartCalls = async () => {
    setError(null);
    setSuccess(null);
    setNoAnswer(false);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Session expirée. Reconnectez-vous.");
        return;
      }

      const res = await fetch("/api/telepro/nrp-calls/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text);
      } catch {
        /* response is not JSON */
      }

      if (!res.ok) {
        setError(
          (data?.error as string) ??
          `Erreur ${res.status}: ${text.slice(0, 200)}`
        );
        return;
      }

      setSuccess((data.message as string) || "Appels lancés.");
      pollStartRef.current = Date.now();
      setPolling(true);
      pollPendingLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        onClick={handleStartCalls}
        disabled={loading || polling}
        className="h-auto px-6 py-3 bg-emerald-600 text-white hover:bg-emerald-700 gap-2 disabled:cursor-not-allowed"
      >
        <Phone className="w-4 h-4" />
        {loading
          ? "Lancement…"
          : polling
            ? "En attente d'un décrochage…"
            : "Lancer les appels NRP (2 numéros)"}
      </Button>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {noAnswer && (
        <p className="text-sm text-amber-600 font-medium">
          Personne n&apos;a répondu. Vous pouvez relancer les appels.
        </p>
      )}
      {success && !error && !noAnswer && (
        <p className="text-sm text-subtle">{success}</p>
      )}
    </div>
  );
}
