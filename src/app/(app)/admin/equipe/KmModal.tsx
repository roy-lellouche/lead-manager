"use client";

import { AlertTriangle, Car, Home, MapPin, X } from "lucide-react";
import {
  DEPOT,
  formatDuration,
  formatKm,
  formatTime,
  teamName,
  type KmTeamWeek,
} from "@/lib/equipe";

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function KmModal({ data, weekLabel, onClose }: { data: KmTeamWeek; weekLabel: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[16px] bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Kilométrage — Équipe {data.team} · {teamName(data.team)}
            </h2>
            <p className="text-sm text-subtle">{weekLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-subtle hover:bg-canvas">
            <X className="size-5" />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-[12px] bg-brand/5 p-3">
          <Car className="size-6 text-brand" />
          <div>
            <div className="text-2xl font-bold tabular-nums text-ink">{formatKm(data.km)}</div>
            <div className="text-xs text-subtle">
              {data.km > 0 ? `≈ ${formatDuration(data.minutes)} de route · ` : ""}
              départ et retour {DEPOT.label}
            </div>
          </div>
        </div>

        {data.days.length === 0 ? (
          <p className="text-sm text-subtle">Aucune installation cette semaine.</p>
        ) : (
          <div className="space-y-3">
            {data.days.map((d) => (
              <div key={d.day} className="rounded-[12px] border border-line p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div className="font-semibold text-ink">{dayLabel(d.day)}</div>
                  <div className="text-sm font-semibold tabular-nums text-ink">
                    {formatKm(d.km)}
                    {d.km > 0 && <span className="font-normal text-subtle"> · {formatDuration(d.minutes)}</span>}
                  </div>
                </div>
                <ol className="space-y-1 text-sm">
                  <li className="flex items-center gap-2 text-subtle">
                    <Home className="size-3.5 shrink-0" /> Départ : {DEPOT.label}
                  </li>
                  {d.stops.map((s, i) => (
                    <li key={s.id} className={`flex items-start gap-2 ${s.located ? "text-body" : "text-red-600"}`}>
                      {s.located ? (
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand" />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      )}
                      <span>
                        <span className="font-medium">
                          {i + 1}. {s.start_time ? `${formatTime(s.start_time)} · ` : ""}
                          {s.client_name}
                        </span>
                        <span className="text-subtle"> — {s.address || "adresse manquante"}</span>
                        {!s.located && <span className="block text-xs">Non compté : adresse absente ou introuvable.</span>}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-subtle">
                    <Home className="size-3.5 shrink-0" /> Retour : {DEPOT.label}
                  </li>
                </ol>
                {d.estimated && (
                  <p className="mt-2 text-xs text-orange-600">
                    Distance estimée (calculateur d&apos;itinéraire momentanément indisponible).
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-subtle">
          Les rendez-vous sont parcourus dans l&apos;ordre des heures (sans heure : à la fin, dans l&apos;ordre de saisie).
        </p>
      </div>
    </div>
  );
}
