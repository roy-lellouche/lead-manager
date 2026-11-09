"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEuro } from "@/lib/finance/format";

export function MonthlyChart({ data }: { data: { key: string; margin: number; realizedMargin: number }[] }) {
  const rows = data.map((d) => ({
    mois: /^\d{4}-\d{2}$/.test(d.key)
      ? new Date(`${d.key}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
      : d.key,
    "Marge prévisionnelle": d.margin,
    "Marge réalisée": d.realizedMargin,
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e8f2" vertical={false} />
          <XAxis dataKey="mois" tick={{ fontSize: 12, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)} k€`} width={48} />
          <Tooltip formatter={(v) => formatEuro(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Marge prévisionnelle" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Marge réalisée" fill="#0abab5" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
