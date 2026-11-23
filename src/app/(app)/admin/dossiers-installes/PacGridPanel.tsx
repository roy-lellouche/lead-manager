"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Trash2, Wand2 } from "lucide-react";
import type { PacModel } from "@/lib/dossiers";
import { formatEuro } from "@/lib/finance/format";

const INPUT = "h-8 px-2 border border-line rounded-md bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/40";

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
  return data;
}

/**
 * Grille « modèle de PAC → prime CEE ». Choisir la PAC d'un dossier propose
 * automatiquement la prime correspondante.
 */
export function PacGridPanel({
  models,
  onModelsChange,
  usage,
  applicableCount,
  onApplied,
}: {
  models: PacModel[];
  onModelsChange: (m: PacModel[]) => void;
  /** Nombre de dossiers installés par modèle. */
  usage: Map<string, number>;
  /** Dossiers avec PAC renseignée, sans prime, et dont le modèle a un montant. */
  applicableCount: number;
  onApplied: (updated: { id: string; benefit_cee: number }[]) => void;
}) {
  const [open, setOpen] = useState(models.some((m) => m.cee_amount === null));
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { name?: string; cee_amount?: string }>>({});

  const missing = models.filter((m) => m.cee_amount === null).length;

  async function save(m: PacModel) {
    const d = drafts[m.id];
    if (!d) return;
    const body: Record<string, unknown> = {};
    if (d.name !== undefined && d.name.trim() !== m.name) body.name = d.name;
    if (d.cee_amount !== undefined) {
      const next = d.cee_amount.trim() === "" ? null : Number(d.cee_amount.replace(",", "."));
      if (next !== m.cee_amount) body.cee_amount = d.cee_amount;
    }
    setDrafts((all) => {
      const rest = { ...all };
      delete rest[m.id];
      return rest;
    });
    if (Object.keys(body).length === 0) return;
    try {
      const saved = (await api(`/api/admin/pac-models/${m.id}`, "PATCH", body)) as PacModel;
      onModelsChange(models.map((x) => (x.id === m.id ? { ...saved, cee_amount: saved.cee_amount === null ? null : Number(saved.cee_amount) } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  }

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const saved = (await api("/api/admin/pac-models", "POST", { name: newName, cee_amount: newAmount })) as PacModel;
      onModelsChange(
        [...models, { ...saved, cee_amount: saved.cee_amount === null ? null : Number(saved.cee_amount) }].sort((a, b) =>
          a.name.localeCompare(b.name, "fr")
        )
      );
      setNewName("");
      setNewAmount("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ajout impossible");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: PacModel) {
    const n = usage.get(m.id) ?? 0;
    const msg = n
      ? `Supprimer « ${m.name} » ? ${n} dossier(s) n'auront plus de modèle de PAC (leur prime CEE est conservée).`
      : `Supprimer « ${m.name} » ?`;
    if (!window.confirm(msg)) return;
    try {
      await api(`/api/admin/pac-models/${m.id}`, "DELETE");
      onModelsChange(models.filter((x) => x.id !== m.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    }
  }

  async function applyGrid() {
    if (!window.confirm(`Renseigner la prime CEE de ${applicableCount} dossier(s) d'après la grille ? Les primes déjà saisies ne sont pas modifiées.`)) return;
    setBusy(true);
    try {
      const { updated } = (await api("/api/admin/pac-models/apply", "POST")) as { updated: { id: string; benefit_cee: number }[] };
      onApplied(updated);
      toast.success(`${updated.length} dossier(s) mis à jour`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Application impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 font-semibold text-ink">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Primes CEE par modèle de PAC
          <span className="font-normal text-sm text-subtle">({models.length} modèles)</span>
        </span>
        {missing > 0 && <span className="text-xs font-medium text-gold">{missing} montant(s) à renseigner</span>}
      </button>
      {open && (
        <div className="border-t border-line-soft px-4 py-3 space-y-3">
          <p className="text-xs text-subtle">
            La prime CEE dépend de la PAC posée. Renseignez ici la prime de chaque modèle : quand vous choisissez la PAC d&apos;un dossier
            dans le tableau, sa prime CEE est remplie automatiquement (vous pouvez toujours l&apos;ajuster dossier par dossier).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1.5">
            {models.map((m) => {
              const d = drafts[m.id] || {};
              return (
                <div key={m.id} className="flex items-center gap-2">
                  <input
                    className={`${INPUT} flex-1 min-w-0`}
                    value={d.name ?? m.name}
                    aria-label="Modèle de PAC"
                    onChange={(e) => setDrafts({ ...drafts, [m.id]: { ...d, name: e.target.value } })}
                    onBlur={() => save(m)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                  <input
                    className={`${INPUT} w-[100px] text-right tabular-nums ${m.cee_amount === null && d.cee_amount === undefined ? "border-gold/50 bg-gold-soft" : ""}`}
                    type="number"
                    step="1"
                    placeholder="Prime €"
                    aria-label={`Prime CEE ${m.name}`}
                    value={d.cee_amount ?? (m.cee_amount === null ? "" : String(m.cee_amount))}
                    onChange={(e) => setDrafts({ ...drafts, [m.id]: { ...d, cee_amount: e.target.value } })}
                    onBlur={() => save(m)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                  <span className="w-[52px] text-right text-[11px] text-subtle tabular-nums" title="Dossiers installés avec cette PAC">
                    {usage.get(m.id) ?? 0} doss.
                  </span>
                  <button onClick={() => remove(m)} className="p-1 text-faint hover:text-ruby" aria-label={`Supprimer ${m.name}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-soft">
            <input className={`${INPUT} w-[220px]`} placeholder="Nouveau modèle de PAC" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <input className={`${INPUT} w-[100px] text-right`} type="number" placeholder="Prime €" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button onClick={add} disabled={busy || !newName.trim()} className="h-8 px-3 inline-flex items-center gap-1 rounded-md bg-ink text-white text-sm disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
            <span className="flex-1" />
            <button
              onClick={applyGrid}
              disabled={busy || applicableCount === 0}
              title="Remplit la prime CEE des dossiers dont la PAC est renseignée mais la prime vide"
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-brand-line bg-brand-soft text-brand text-sm font-medium disabled:opacity-40"
            >
              <Wand2 className="w-3.5 h-3.5" /> Appliquer aux dossiers sans prime ({applicableCount})
            </button>
          </div>
          {models.some((m) => m.cee_amount !== null) && (
            <p className="text-[11px] text-faint">
              Fourchette actuelle : {formatEuro(Math.min(...models.filter((m) => m.cee_amount !== null).map((m) => m.cee_amount as number)))} –{" "}
              {formatEuro(Math.max(...models.filter((m) => m.cee_amount !== null).map((m) => m.cee_amount as number)))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
