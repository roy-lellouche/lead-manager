import type { MarginAlert } from "./engine";

const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatEuro(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? EUR.format(n) : "—";
}

export function formatPercent(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %` : "—";
}

export const ALERT_STYLES: Record<MarginAlert, { label: string; badge: string; text: string; dot: string }> = {
  rouge: { label: "Marge faible", badge: "bg-red-50 text-red-700 border-red-200", text: "text-red-700", dot: "bg-red-500" },
  orange: { label: "Vigilance", badge: "bg-amber-50 text-amber-700 border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  vert: { label: "Rentable", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
};
