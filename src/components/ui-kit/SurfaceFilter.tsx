"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDown, Ruler } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SurfaceFilterProps {
  /** Bornes actuellement appliquées (valeurs brutes de l'URL). */
  min: string;
  max: string;
  /** Appelé avec les nouvelles bornes ; chaîne vide = borne retirée. */
  onApply: (min: string, max: string) => void;
}

function formatLabel(min: string, max: string) {
  if (min && max) return `${min} – ${max} m²`;
  if (min) return `≥ ${min} m²`;
  if (max) return `≤ ${max} m²`;
  return "Toutes surfaces";
}

/** Bouton du panneau de filtres qui ouvre la saisie d'une tranche de surface (de … à … m²). */
export function SurfaceFilter({ min, max, onApply }: SurfaceFilterProps) {
  const [open, setOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(min);
  const [draftMax, setDraftMax] = useState(max);
  const active = Boolean(min || max);

  const handleOpenChange = (next: boolean) => {
    // À chaque ouverture, on repart des valeurs réellement appliquées.
    if (next) {
      setDraftMin(min);
      setDraftMax(max);
    }
    setOpen(next);
  };

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(draftMin.trim(), draftMax.trim());
    setOpen(false);
  };

  const reset = () => {
    onApply("", "");
    setOpen(false);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-subtle mb-1">Surface (m²)</label>
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger
          className={cn(
            "w-full h-9 px-3 flex items-center gap-2 text-sm border rounded-[9px] bg-white text-left focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand",
            active ? "border-brand text-brand font-medium" : "border-line text-ink"
          )}
          data-testid="filter-surface"
        >
          <Ruler className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">{formatLabel(min, max)}</span>
          <ChevronDown className="w-4 h-4 shrink-0 text-subtle" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={4} align="start" className="z-50">
            <Popover.Popup className="w-64 rounded-[14px] border border-line bg-white p-3 shadow-[0_8px_24px_rgba(16,24,40,.12)] outline-none">
              <form onSubmit={apply} className="flex flex-col gap-3">
                <p className="text-xs font-medium text-subtle">
                  Leads dont la surface est comprise entre :
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="De"
                    value={draftMin}
                    onChange={(e) => setDraftMin(e.target.value)}
                    className="h-9 border-line rounded-[9px] text-ink"
                    aria-label="Surface minimum (m²)"
                    data-testid="filter-surface-min"
                    autoFocus
                  />
                  <span className="text-sm text-subtle">à</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="À"
                    value={draftMax}
                    onChange={(e) => setDraftMax(e.target.value)}
                    className="h-9 border-line rounded-[9px] text-ink"
                    aria-label="Surface maximum (m²)"
                    data-testid="filter-surface-max"
                  />
                  <span className="text-sm text-subtle">m²</span>
                </div>
                <p className="text-[11px] text-subtle">
                  Les leads sans surface renseignée sont exclus.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1 h-8" onClick={reset}>
                    Réinitialiser
                  </Button>
                  <Button type="submit" size="sm" className="flex-1 h-8" data-testid="filter-surface-apply">
                    Appliquer
                  </Button>
                </div>
              </form>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
