import Link from "next/link";

export interface BarListItem {
  label: string;
  value: number;
  color?: string;
  href?: string;
}

/**
 * Liste de barres horizontales (libellé, barre proportionnelle, valeur, %).
 * Plus lisible qu'un camembert dès qu'il y a plus de 3 catégories.
 */
export function BarList({
  items,
  total,
  sort = true,
  hideZero = false,
  emptyLabel = "Aucune donnée sur la période",
  defaultColor = "#1f4fd1",
}: {
  items: BarListItem[];
  /** Base du pourcentage ; par défaut la somme des valeurs. */
  total?: number;
  sort?: boolean;
  hideZero?: boolean;
  emptyLabel?: string;
  defaultColor?: string;
}) {
  const rows = (hideZero ? items.filter((i) => i.value > 0) : items).slice();
  if (sort) rows.sort((a, b) => b.value - a.value);
  const sum = total ?? rows.reduce((s, i) => s + i.value, 0);
  const max = Math.max(1, ...rows.map((i) => i.value));

  if (rows.length === 0 || rows.every((r) => r.value === 0)) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line text-sm text-faint">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((item) => {
        const pct = sum > 0 ? Math.round((item.value / sum) * 100) : 0;
        const width = item.value > 0 ? Math.max(2, (item.value / max) * 100) : 0;
        const inner = (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color ?? defaultColor }}
                aria-hidden="true"
              />
              <span className={`truncate text-sm ${item.value > 0 ? "text-ink" : "text-faint"}`}>{item.label}</span>
            </div>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className={`text-sm font-semibold ${item.value > 0 ? "text-ink" : "text-faint"}`}>{item.value}</span>
              <span className="w-9 text-right text-xs text-faint">{pct}%</span>
            </div>
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-line-soft">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, backgroundColor: item.color ?? defaultColor }}
              />
            </div>
          </div>
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <Link href={item.href} className="block rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-panel">
                {inner}
              </Link>
            ) : (
              <div className="px-2 py-2 -mx-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Barre empilée compacte (répartition), avec infobulle native par segment. */
export function StackedBar({
  segments,
  className = "h-2",
}: {
  segments: { label: string; value: number; color: string }[];
  className?: string;
}) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  if (sum === 0) return <div className={`w-full rounded-full bg-line-soft ${className}`} />;
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-line-soft ${className}`}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.label}
            title={`${s.label} : ${s.value} (${Math.round((s.value / sum) * 100)} %)`}
            style={{ width: `${(s.value / sum) * 100}%`, backgroundColor: s.color }}
          />
        ))}
    </div>
  );
}
