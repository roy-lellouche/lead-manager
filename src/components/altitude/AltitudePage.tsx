"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Mountain, MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { Panel } from "@/components/ui-kit/Panel";
import { AddressAutocomplete } from "@/components/sav/AddressAutocomplete";
import { LABEL_CLS } from "@/components/sav/styles";
import { geoportailUrl } from "@/lib/altitude";

interface AltitudeResult {
  label: string;
  lat: number;
  lng: number;
  altitude: number | null;
}

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Recherche d'altitude d'une adresse (données IGN / Géoportail). */
export function AltitudePage() {
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AltitudeResult | null>(null);
  const [history, setHistory] = useState<AltitudeResult[]>([]);

  const lookup = async (addr: string, c: { lat: number; lng: number } | null) => {
    if (addr.trim().length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const qs = c
        ? `lat=${c.lat}&lng=${c.lng}&label=${encodeURIComponent(addr)}`
        : `q=${encodeURIComponent(addr.trim())}`;
      const res = await fetch(`/api/altitude?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur inconnue");
      const r = json as AltitudeResult;
      setResult(r);
      setHistory((h) => [r, ...h.filter((x) => x.label !== r.label)].slice(0, 8));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Altitude"
        subtitle="Saisissez une adresse : l'altitude est récupérée directement auprès de l'IGN (données Géoportail)."
      />

      <Panel>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(address, coords);
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="altitude-address" className={LABEL_CLS}>
              Adresse
            </label>
            <AddressAutocomplete
              id="altitude-address"
              value={address}
              onChange={(a, c) => {
                setAddress(a);
                setCoords(c);
                // Choix d'une suggestion : calcul immédiat, sans clic supplémentaire.
                if (c) void lookup(a, c);
              }}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || address.trim().length < 3}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mountain className="h-4 w-4" />}
            Calculer l&apos;altitude
          </button>
        </form>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {result && !error && (
          <div className="mt-5 rounded-xl border border-line bg-canvas p-5">
            <div className="flex items-start gap-2 text-sm text-subtle">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span>{result.label}</span>
            </div>
            <div className="mt-3 text-4xl font-bold tracking-tight text-ink">
              {result.altitude === null ? (
                <span className="text-xl font-semibold text-subtle">Altitude non disponible pour ce point</span>
              ) : (
                <>
                  {fmt(result.altitude)} <span className="text-xl font-semibold text-subtle">m</span>
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-subtle">
              <span>
                Lat {result.lat.toFixed(5)} · Lng {result.lng.toFixed(5)}
              </span>
              <a
                href={geoportailUrl(result.lat, result.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
              >
                Voir sur Géoportail <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </Panel>

      {history.length > 1 && (
        <Panel title="Recherches récentes" bodyClassName="px-5 pb-5 pt-3">
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">{h.label}</span>
                <span className="shrink-0 font-semibold text-ink">
                  {h.altitude === null ? "—" : `${fmt(h.altitude)} m`}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
