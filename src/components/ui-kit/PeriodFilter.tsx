"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { endOfMonth, endOfWeek, endOfYear, format, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { CalendarDays } from "lucide-react";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Sélecteur de période commun aux tableaux de bord : raccourcis (aujourd'hui, semaine, mois, année)
 * + dates libres. Conserve les autres paramètres de l'URL (ex. mandataires).
 */
export function PeriodFilter({
  defaultFrom,
  defaultTo,
  children,
}: {
  /** Période appliquée par la page quand l'URL n'en précise pas (pour surligner le bon raccourci). */
  defaultFrom: string;
  defaultTo: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;

  const now = new Date();
  const presets = [
    { key: "jour", label: "Aujourd'hui", from: fmt(now), to: fmt(now) },
    {
      key: "semaine",
      label: "Semaine",
      from: fmt(startOfWeek(now, { weekStartsOn: 1 })),
      to: fmt(endOfWeek(now, { weekStartsOn: 1 })),
    },
    { key: "mois", label: "Mois", from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) },
    { key: "annee", label: "Année", from: fmt(startOfYear(now)), to: fmt(endOfYear(now)) },
  ];

  const push = (next: { from?: string; to?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.from !== undefined) params.set("from", next.from);
    if (next.to !== undefined) params.set("to", next.to);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white p-2 shadow-card">
      <div className="inline-flex rounded-lg bg-line-soft p-0.5" role="group" aria-label="Période">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => push({ from: p.from, to: p.to })}
              aria-pressed={active}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                active ? "bg-white text-ink shadow-card" : "text-subtle hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-[13px] text-subtle">
        <CalendarDays className="h-4 w-4 text-faint" aria-hidden="true" />
        <label className="sr-only" htmlFor="period-from">Du</label>
        <input
          id="period-from"
          type="date"
          value={from}
          onChange={(e) => e.target.value && push({ from: e.target.value })}
          className="h-8 rounded-lg border border-line bg-white px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <span aria-hidden="true">→</span>
        <label className="sr-only" htmlFor="period-to">Au</label>
        <input
          id="period-to"
          type="date"
          value={to}
          onChange={(e) => e.target.value && push({ to: e.target.value })}
          className="h-8 rounded-lg border border-line bg-white px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{children}</div> : null}
    </div>
  );
}

/** Puces de sélection multiple des mandataires (paramètre d'URL `delegataire`, répétable). */
export function DelegataireChips({ options }: { options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.getAll("delegataire");

  const toggle = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const next = selected.includes(value) ? selected.filter((d) => d !== value) : [...selected, value];
    params.delete("delegataire");
    next.forEach((d) => params.append("delegataire", d));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mandataires">
      <span className="mr-1 text-xs font-medium text-subtle">Mandataire</span>
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={active}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-brand bg-brand-soft text-brand-strong"
                : "border-line bg-white text-body hover:border-line-strong"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
