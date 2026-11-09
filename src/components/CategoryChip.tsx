import { LEAD_CATEGORY_LABELS, type LeadCategory } from "@/lib/types";

const CATEGORY_CHIP: Record<LeadCategory, string> = {
  fenetre: "bg-brand-soft text-brand",
  clim_1euro: "bg-slate-100 text-slate-600",
  video_pac_atlantic_990: "bg-slate-100 text-slate-600",
  clim_3990euros: "bg-slate-100 text-slate-600",
};

export function CategoryChip({ category }: { category: LeadCategory }) {
  return (
    <span
      data-testid="category-chip"
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_CHIP[category]}`}
    >
      {LEAD_CATEGORY_LABELS[category]}
    </span>
  );
}
