"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shuffle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  REDISTRIBUTION_DEFAULT_LIMIT,
  REDISTRIBUTION_LIMIT_OPTIONS,
  REDISTRIBUTION_MAX_LIMIT,
  parisDateString,
} from "@/lib/redistribution";

interface Telepro {
  id: string;
  full_name: string | null;
  email: string;
}

interface Summary {
  poolCount: number;
  assignableCount: number;
  unassignedCount: number;
  bySource: { id: string; name: string; count: number }[];
  byTarget: { id: string; name: string; count: number }[];
  applied: boolean;
  appliedCount: number;
}

const label = (t: Telepro) => t.full_name || t.email;

function TeleproChecklist({
  title,
  telepros,
  selected,
  onChange,
}: {
  title: string;
  telepros: Telepro[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const allSelected = selected.size === telepros.length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">
          {title} <span className="text-subtle font-normal">({selected.size}/{telepros.length})</span>
        </span>
        <button
          type="button"
          className="text-xs text-brand hover:text-brand-hover font-medium"
          onClick={() => onChange(allSelected ? new Set() : new Set(telepros.map((t) => t.id)))}
        >
          {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-line p-2 space-y-1.5">
        {telepros.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <Checkbox
              checked={selected.has(t.id)}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (checked) next.add(t.id);
                else next.delete(t.id);
                onChange(next);
              }}
            />
            {label(t)}
          </label>
        ))}
      </div>
    </div>
  );
}

export function RedistributeLeadsDialog({ telepros }: { telepros: Telepro[] }) {
  const router = useRouter();
  const allIds = () => new Set(telepros.map((t) => t.id));

  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(String(REDISTRIBUTION_DEFAULT_LIMIT));
  const [maxDate, setMaxDate] = useState(() => parisDateString(new Date(), -1));
  const [sources, setSources] = useState<Set<string>>(allIds);
  const [targets, setTargets] = useState<Set<string>>(allIds);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const reset = () => {
    setLimit(String(REDISTRIBUTION_DEFAULT_LIMIT));
    setMaxDate(parisDateString(new Date(), -1));
    setSources(allIds());
    setTargets(allIds());
    setPreview(null);
    setError(null);
    setDoneCount(null);
  };

  // Tout changement de réglage invalide l'aperçu affiché.
  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPreview(null);
    setError(null);
  };

  const call = async (dryRun: boolean): Promise<Summary | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/redistribute-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: Number(limit),
          maxDate,
          sourceTeleproIds: [...sources],
          targetTeleproIds: [...targets],
          dryRun,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors de la redistribution");
        return null;
      }
      return data as Summary;
    } catch {
      setError("Erreur réseau");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    const data = await call(true);
    if (data) setPreview(data);
  };

  const handleConfirm = async () => {
    const data = await call(false);
    if (!data) return;
    setPreview(null);
    setDoneCount(data.appliedCount);
    router.refresh();
  };

  const limitValue = Number(limit);
  const limitValid = Number.isInteger(limitValue) && limitValue >= 1 && limitValue <= REDISTRIBUTION_MAX_LIMIT;
  const canPreview = limitValid && !!maxDate && sources.size > 0 && targets.size > 0 && !loading;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <Shuffle className="w-4 h-4" />
        Redistribuer les leads
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Redistribuer les leads</DialogTitle>
          <DialogDescription>
            Les leads NRP sélectionnés sont mélangés puis répartis entre les télépros destinataires,
            sans jamais revenir à un télépro qui a déjà eu le lead. Chez le télépro, le lead
            apparaît comme « Nouveau », daté du jour de la redistribution.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="redistrib-limit" className="text-sm font-medium text-ink">
              Derniers NRP par télépro
            </label>
            <Input
              id="redistrib-limit"
              type="number"
              min={1}
              max={REDISTRIBUTION_MAX_LIMIT}
              list="redistrib-limit-options"
              value={limit}
              onChange={(e) => edit(setLimit)(e.target.value)}
            />
            <datalist id="redistrib-limit-options">
              {REDISTRIBUTION_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <p className="text-xs text-subtle">Ex. 20, 50, 100 (max {REDISTRIBUTION_MAX_LIMIT})</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="redistrib-date" className="text-sm font-medium text-ink">
              Ajoutés au plus tard le
            </label>
            <Input
              id="redistrib-date"
              type="date"
              value={maxDate}
              onChange={(e) => edit(setMaxDate)(e.target.value)}
            />
            <p className="text-xs text-subtle">Seuls les leads reçus ce jour-là ou avant sont pris.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TeleproChecklist
            title="Prendre les leads de"
            telepros={telepros}
            selected={sources}
            onChange={edit(setSources)}
          />
          <TeleproChecklist
            title="Redistribuer vers"
            telepros={telepros}
            selected={targets}
            onChange={edit(setTargets)}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {doneCount != null && (
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 font-medium">
            {doneCount} lead(s) redistribué(s). L&apos;historique complet est visible sur la fiche de chaque lead.
          </p>
        )}

        {preview && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-sm">
            <p className="font-medium text-amber-900">
              {preview.poolCount} lead(s) NRP trouvé(s) — {preview.assignableCount} seront redistribué(s)
              {preview.unassignedCount > 0 &&
                ` (${preview.unassignedCount} déjà passé(s) chez tous les destinataires, ils ne bougeront pas)`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-amber-900">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1">Pris chez</p>
                <ul className="space-y-0.5">
                  {preview.bySource.filter((s) => s.count > 0).map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span className="truncate">{s.name}</span>
                      <span className="font-medium">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1">Envoyés vers (≈)</p>
                <ul className="space-y-0.5">
                  {preview.byTarget.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span className="truncate">{t.name}</span>
                      <span className="font-medium">{t.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs text-amber-800">
              Le tirage est refait au moment de la validation : la répartition finale peut varier d&apos;un ou deux leads.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            {doneCount != null ? "Fermer" : "Annuler"}
          </Button>
          {doneCount != null ? null : preview && preview.assignableCount > 0 ? (
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? "Redistribution..." : `Redistribuer ${preview.assignableCount} lead(s)`}
            </Button>
          ) : (
            <Button onClick={handlePreview} disabled={!canPreview}>
              {loading ? "Calcul..." : "Prévisualiser"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
