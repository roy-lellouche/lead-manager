"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, Plus, Trash2, Wand2 } from "lucide-react";
import {
  COST_CATEGORIES,
  ETAS_BANDS,
  INCOME_CATEGORIES,
  computeProfitability,
  modelAmounts,
  modelCosts,
  normalizeModel,
  type CeeBareme,
  type CostItem,
  type EtasBand,
  type IncomeCategory,
  type PacModel,
} from "@/lib/dossiers";
import { formatEuro } from "@/lib/finance/format";

const INPUT = "h-8 px-2 border border-line rounded-md bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/40";
const ZONES = [
  { key: "cee_h1", label: "H1" },
  { key: "cee_h2", label: "H2" },
  { key: "cee_h3", label: "H3" },
] as const;

// Barème neutre : seules les primes forfaitaires de la fiche sont utilisées pour l'aperçu.
const EMPTY_BAREME = {} as CeeBareme;

/** Prix du MWhc cumac par catégorie de revenus. */
function BaremeEditor({ bareme, onChange }: { bareme: CeeBareme; onChange: (b: CeeBareme) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  async function save(cat: IncomeCategory) {
    const v = draft[cat];
    setDraft((d) => {
      const n = { ...d };
      delete n[cat];
      return n;
    });
    if (v === undefined || Number(v.replace(",", ".")) === bareme.price_mwhc[cat]) return;
    try {
      onChange(await api("/api/admin/pac-models/bareme", "PATCH", { price_mwhc: { [cat]: v } }));
      toast.success("Prix du MWhc enregistré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  }
  return (
    <div className="rounded-[10px] border border-line-soft bg-canvas/60 px-3 py-2.5 space-y-2">
      <p className="text-xs text-subtle">
        <strong className="text-ink">Barème CEE Coup de pouce 2026</strong> (maison individuelle) : prime = kWhc selon l&apos;ETAS
        ({bareme.kwhc["111_140"].toLocaleString("fr-FR")} ou {bareme.kwhc["140_plus"].toLocaleString("fr-FR")}) × zone (H1 {bareme.zone_factor.H1}, H2 {bareme.zone_factor.H2}, H3 {bareme.zone_factor.H3})
        × surface (&lt; 70 m² : {bareme.shab.lt70}, 70–90 m² : {bareme.shab["70_90"]}, ≥ 90 m² : {bareme.shab.gte90}) × {bareme.cdp_multiplier} × prix du MWhc.
        Utilisé dès que la zone, la surface et la couleur du foyer sont renseignées ; sinon la prime forfaitaire de la fiche PAC sert d&apos;estimation.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-subtle">Prix du MWhc cumac :</span>
        {INCOME_CATEGORIES.map((c) => (
          <label key={c.key} className="flex items-center gap-1.5 text-sm text-ink">
            {c.key}
            <input
              className={`${INPUT} w-[70px] text-right tabular-nums`}
              type="number"
              step="0.01"
              title={`${c.label} (couleur ${c.color})`}
              value={draft[c.key] ?? String(bareme.price_mwhc[c.key])}
              onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
              onBlur={() => save(c.key)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <span className="text-xs text-subtle">€</span>
          </label>
        ))}
      </div>
    </div>
  );
}

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

function margin(m: PacModel, zone: "H1" | "H2" | "H3"): number | null {
  // Prime forfaitaire de la fiche (sans surface ni catégorie, le barème ne s'applique pas).
  const a = modelAmounts(m, { cee_zone: zone }, { ...EMPTY_BAREME });
  return a.benefit_cee === undefined ? null : computeProfitability(a);
}

/** Postes de coût d'une fiche PAC, modifiables puis enregistrés d'un bloc. */
function CostEditor({ model, onSaved }: { model: PacModel; onSaved: (m: PacModel) => void }) {
  const [items, setItems] = useState<(Omit<CostItem, "amount"> & { amount: string })[]>(
    model.cost_items.map((c) => ({ ...c, amount: String(c.amount) }))
  );
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(items.map((i) => ({ ...i, amount: Number(i.amount.replace(",", ".")) || 0 }))) !== JSON.stringify(model.cost_items);
  const total = items.reduce((n, i) => n + (Number(i.amount.replace(",", ".")) || 0), 0);
  const set = (k: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((it, j) => (j === k ? { ...it, ...patch } : it)));

  async function save() {
    setSaving(true);
    try {
      const saved = await api(`/api/admin/pac-models/${model.id}`, "PATCH", { cost_items: items });
      onSaved(normalizeModel(saved));
      toast.success("Fiche PAC enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      {items.map((it, k) => (
        <div key={k} className="flex flex-wrap items-center gap-2">
          <input className={`${INPUT} flex-1 min-w-[180px]`} value={it.label} aria-label="Poste de coût" onChange={(e) => set(k, { label: e.target.value })} />
          <input className={`${INPUT} w-[90px] text-right tabular-nums`} type="number" value={it.amount} aria-label="Montant" onChange={(e) => set(k, { amount: e.target.value })} />
          <select className={INPUT} value={it.basis} aria-label="HT ou TTC" onChange={(e) => set(k, { basis: e.target.value as "HT" | "TTC" })}>
            <option value="HT">HT</option>
            <option value="TTC">TTC</option>
          </select>
          <select className={INPUT} value={it.category} aria-label="Rubrique" onChange={(e) => set(k, { category: e.target.value as CostItem["category"] })}>
            {COST_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button onClick={() => setItems(items.filter((_, j) => j !== k))} className="p-1 text-faint hover:text-ruby" aria-label={`Retirer ${it.label}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={() => setItems([...items, { label: "", amount: "", basis: "HT", category: "materiel" }])}
          className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md border border-line text-sm text-ink hover:bg-canvas"
        >
          <Plus className="w-3.5 h-3.5" /> Poste de coût
        </button>
        <span className="text-sm text-subtle">Total : <strong className="text-ink tabular-nums">{formatEuro(total)}</strong></span>
        <span className="flex-1" />
        {dirty && (
          <>
            <button onClick={() => setItems(model.cost_items.map((c) => ({ ...c, amount: String(c.amount) })))} className="h-8 px-2.5 text-sm text-subtle hover:text-ink">
              Annuler
            </button>
            <button onClick={save} disabled={saving} className="h-8 px-3 rounded-md bg-ink text-white text-sm disabled:opacity-40">
              Enregistrer les coûts
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Fiches PAC : prime CEE par zone et postes de coût de chaque modèle. Choisir la PAC
 * d'un dossier remplit sa prime (selon sa zone) et ses coûts.
 */
export function PacGridPanel({
  models,
  onModelsChange,
  bareme,
  onBaremeChange,
  usage,
  applicableCount,
  onApplied,
}: {
  models: PacModel[];
  onModelsChange: (m: PacModel[]) => void;
  bareme: CeeBareme;
  onBaremeChange: (b: CeeBareme) => void;
  usage: Map<string, number>;
  /** Dossiers avec PAC dont au moins un montant vide peut être rempli par la fiche. */
  applicableCount: number;
  onApplied: (updated: { id: string; patch: Record<string, number> }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  const replace = (saved: PacModel) => onModelsChange(models.map((x) => (x.id === saved.id ? saved : x)));

  async function saveField(m: PacModel, field: "name" | "cee_h1" | "cee_h2" | "cee_h3") {
    const d = drafts[m.id]?.[field];
    setDrafts((all) => {
      const next = { ...all, [m.id]: { ...(all[m.id] || {}) } };
      delete next[m.id][field];
      return next;
    });
    if (d === undefined) return;
    const current = field === "name" ? m.name : m[field] === null ? "" : String(m[field]);
    if (d.trim() === current) return;
    try {
      replace(normalizeModel(await api(`/api/admin/pac-models/${m.id}`, "PATCH", { [field]: d })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  }

  async function saveEtas(m: PacModel, band: string) {
    try {
      replace(normalizeModel(await api(`/api/admin/pac-models/${m.id}`, "PATCH", { etas_band: band || null })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  }

  async function create(name: string, from?: PacModel) {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body = from
        ? { name, etas_band: from.etas_band, cee_h1: from.cee_h1, cee_h2: from.cee_h2, cee_h3: from.cee_h3, cost_items: from.cost_items }
        : { name };
      const saved = normalizeModel(await api("/api/admin/pac-models", "POST", body));
      onModelsChange([...models, saved]);
      setExpanded(saved.id);
      setNewName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ajout impossible");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: PacModel) {
    const n = usage.get(m.id) ?? 0;
    const msg = n
      ? `Supprimer « ${m.name} » ? ${n} dossier(s) n'auront plus de modèle de PAC (leurs montants sont conservés).`
      : `Supprimer « ${m.name} » ?`;
    if (!window.confirm(msg)) return;
    try {
      await api(`/api/admin/pac-models/${m.id}`, "DELETE");
      onModelsChange(models.filter((x) => x.id !== m.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    }
  }

  async function applyAll() {
    if (!window.confirm(`Remplir les montants vides de ${applicableCount} dossier(s) d'après leur fiche PAC ? Les montants déjà saisis ne sont pas modifiés.`)) return;
    setBusy(true);
    try {
      const { updated } = await api("/api/admin/pac-models/apply", "POST");
      onApplied(updated);
      toast.success(`${updated.length} dossier(s) mis à jour`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Application impossible");
    } finally {
      setBusy(false);
    }
  }

  const draft = (m: PacModel, f: "name" | "cee_h1" | "cee_h2" | "cee_h3") =>
    drafts[m.id]?.[f] ?? (f === "name" ? m.name : m[f] === null ? "" : String(m[f]));
  const setDraft = (m: PacModel, f: string, v: string) => setDrafts({ ...drafts, [m.id]: { ...(drafts[m.id] || {}), [f]: v } });

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 font-semibold text-ink text-left">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Fiches PAC : prime CEE et coûts par modèle
          <span className="font-normal text-sm text-subtle">({models.length} modèles)</span>
        </button>
        <button
          onClick={applyAll}
          disabled={busy || applicableCount === 0}
          title="Remplit la prime CEE (selon la zone) et les coûts vides des dossiers dont la PAC est renseignée"
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-brand-line bg-brand-soft text-brand text-sm font-medium disabled:opacity-40"
        >
          <Wand2 className="w-3.5 h-3.5" /> Remplir les montants vides ({applicableCount} dossiers)
        </button>
      </div>
      {open && (
        <div className="border-t border-line-soft px-4 py-3 space-y-3">
          <p className="text-xs text-subtle">
            Choisir la PAC d&apos;un dossier dans le tableau remplit sa prime CEE et ses coûts. Chaque montant reste modifiable
            dossier par dossier. Les coûts sont comptés tels que saisis (HT ou TTC).
          </p>
          <BaremeEditor bareme={bareme} onChange={onBaremeChange} />
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-left text-xs text-subtle">
                  <th className="px-2 py-1.5 font-medium">Modèle</th>
                  <th className="px-1 py-1.5 font-medium">ETAS</th>
                  {ZONES.map((z) => <th key={z.key} className="px-1 py-1.5 font-medium text-right" title="Prime forfaitaire, utilisée quand le barème ne peut pas être appliqué">Forfait {z.label}</th>)}
                  <th className="px-2 py-1.5 font-medium text-right">Coût total</th>
                  <th className="px-2 py-1.5 font-medium text-right" title="Avec la prime forfaitaire H1">Rentab. H1</th>
                  <th className="px-2 py-1.5 font-medium text-right" title="Avec la prime forfaitaire H2">Rentab. H2</th>
                  <th className="px-2 py-1.5 font-medium text-right">Dossiers</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const costs = modelCosts(m);
                  const isOpen = expanded === m.id;
                  const h1 = margin(m, "H1");
                  const h2 = margin(m, "H2");
                  return (
                    <Fragment key={m.id}>
                      <tr className="border-t border-line-soft">
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setExpanded(isOpen ? null : m.id)} className="p-0.5 text-subtle hover:text-ink" aria-label="Détail des coûts">
                              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <input
                              className={`${INPUT} w-full min-w-[180px]`}
                              value={draft(m, "name")}
                              aria-label="Modèle de PAC"
                              onChange={(e) => setDraft(m, "name", e.target.value)}
                              onBlur={() => saveField(m, "name")}
                              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            />
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <select
                            className={`${INPUT} ${!m.etas_band ? "text-gold" : ""}`}
                            value={m.etas_band ?? ""}
                            aria-label={`ETAS ${m.name}`}
                            onChange={(e) => saveEtas(m, e.target.value as EtasBand | "")}
                          >
                            <option value="">ETAS ?</option>
                            {ETAS_BANDS.map((b) => <option key={b.key} value={b.key}>{b.key === "140_plus" ? "≥ 140 %" : "111–140 %"}</option>)}
                          </select>
                        </td>
                        {ZONES.map((z) => (
                          <td key={z.key} className="px-1 py-1 text-right">
                            <input
                              className={`${INPUT} w-[86px] text-right tabular-nums`}
                              type="number"
                              placeholder="—"
                              aria-label={`Prime ${z.label} ${m.name}`}
                              value={draft(m, z.key)}
                              onChange={(e) => setDraft(m, z.key, e.target.value)}
                              onBlur={() => saveField(m, z.key)}
                              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-right tabular-nums">
                          {costs.total ? formatEuro(costs.total) : <span className="text-gold">à saisir</span>}
                        </td>
                        <td className={`px-2 py-1 text-right tabular-nums font-medium ${h1 !== null && h1 < 0 ? "text-ruby" : "text-emerald"}`}>{h1 === null ? "—" : formatEuro(h1)}</td>
                        <td className={`px-2 py-1 text-right tabular-nums font-medium ${h2 !== null && h2 < 0 ? "text-ruby" : "text-emerald"}`}>{h2 === null ? "—" : formatEuro(h2)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-subtle">{usage.get(m.id) ?? 0}</td>
                        <td className="px-1 py-1 whitespace-nowrap text-right">
                          <button onClick={() => create(`${m.name} (copie)`, m)} className="p-1 text-faint hover:text-brand" title="Dupliquer ce modèle" aria-label={`Dupliquer ${m.name}`}>
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => remove(m)} className="p-1 text-faint hover:text-ruby" aria-label={`Supprimer ${m.name}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={10} className="px-2 pb-3 pt-1 bg-canvas/60">
                            <CostEditor key={JSON.stringify(m.cost_items)} model={m} onSaved={replace} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-soft">
            <input
              className={`${INPUT} w-[240px]`}
              placeholder="Nouveau modèle de PAC"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create(newName)}
            />
            <button onClick={() => create(newName)} disabled={busy || !newName.trim()} className="h-8 px-3 inline-flex items-center gap-1 rounded-md bg-ink text-white text-sm disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
            <span className="text-xs text-faint">Astuce : « Dupliquer » une fiche proche puis changer le prix de la PAC.</span>
          </div>
        </div>
      )}
    </div>
  );
}
