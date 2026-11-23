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
