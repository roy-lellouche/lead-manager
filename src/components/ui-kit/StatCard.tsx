import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

export type StatTone = "neutral" | "brand" | "success" | "warning" | "danger" | "amethyst";

// Tons « pierres précieuses » : saphir, émeraude, or, rubis, améthyste.
const TONE_ICON: Record<StatTone, string> = {
  neutral: "bg-line-soft text-body",
  brand: "bg-brand-soft text-brand",
  success: "bg-emerald-soft text-emerald",
  warning: "bg-gold-soft text-gold",
  danger: "bg-ruby-soft text-ruby",
  amethyst: "bg-amethyst-soft text-amethyst",
};

const TONE_VALUE: Record<StatTone, string> = {
  neutral: "text-ink",
  brand: "text-ink",
  success: "text-emerald",
  warning: "text-ink",
  danger: "text-ruby",
  amethyst: "text-ink",
};

const TONE_BAR: Record<StatTone, string> = {
  neutral: "bg-line-strong",
  brand: "bg-brand",
  success: "bg-emerald",
  warning: "bg-gold",
  danger: "bg-ruby",
  amethyst: "bg-amethyst",
};

/** Carte d'indicateur (KPI) : libellé, grande valeur, précision facultative. Cliquable si `href`. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
  size = "md",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  href?: string;
  size?: "md" | "lg";
}) {
  const body = (
    <div
      className={`group relative h-full overflow-hidden rounded-[14px] border border-line bg-white p-4 shadow-card transition-all ${
        href ? "hover:border-brand-line hover:shadow-md" : ""
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-[3px] ${TONE_BAR[tone]}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-medium text-subtle leading-snug">{label}</div>
        {Icon ? (
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_ICON[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        ) : href ? (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-brand" />
        ) : null}
      </div>
      <div
        className={`mt-2 font-bold tracking-tight tabular-nums ${size === "lg" ? "text-3xl" : "text-2xl"} ${TONE_VALUE[tone]}`}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-subtle">{hint}</div> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-[14px]">
      {body}
    </Link>
  ) : (
    body
  );
}
