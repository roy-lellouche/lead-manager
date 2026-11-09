"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory } from "@/lib/finance/engine";
import { formatEuro } from "@/lib/finance/format";

interface Method { id: string; name: string; description: string | null; is_configured: boolean; active: boolean }
interface Cost { id: string; method_id: string; code: string; label: string; category: CostCategory; amount: number; active: boolean }
interface Scale {
  id: string; method_id: string; scale_year: number; climate_zone: string; amount: number;
  valid_from: string; valid_to: string | null; conditions: string | null; validated: boolean; validated_at: string | null;
}
interface History {
  id: string; entity_label: string | null; field: string; old_value: unknown; new_value: unknown; changed_at: string;
  profile: { full_name: string | null; email: string | null } | null;
}
interface Payload { methods: Method[]; costs: Cost[]; scales: Scale[]; thresholds: { red_below: number; orange_below: number }; history: History[] }

const CARD = "rounded-[12px] border border-[#e1e8f2] bg-white shadow-[0_1px_2px_rgba(13,38,76,.06)] p-4 sm:p-5";
const TITLE = "text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-3";
const INPUT = "h-9 w-full px-3 border border-[#e1e8f2] rounded-[9px] bg-white text-[#0b1f3a] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40";
const BTN = "inline-flex items-center gap-1.5 h-9 px-3 rounded-[9px] bg-[#0b1f3a] text-white text-sm font-medium hover:bg-[#13315c] disabled:opacity-50";

const FIELD_LABELS: Record<string, string> = {
  amount: "montant", label: "libellé", active: "actif", valid_from: "début de validité", valid_to: "fin de validité",
  conditions: "conditions", validated: "validé", validated_at: "date de validation", validated_by: "validé par",
  name: "nom", description: "description", is_configured: "configurée", value: "valeur", "création": "création",
};

function Field({ value, onCommit, type = "text", ariaLabel, className }: {
  value: string | number | null; onCommit: (v: string) => void; type?: string; ariaLabel: string; className?: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => setDraft(value === null ? "" : String(value)), [value]);
  return (
    <input
      aria-label={ariaLabel} type={type} step={type === "number" ? "0.01" : undefined} min={type === "number" ? "0" : undefined}
      className={`${INPUT} ${className ?? ""}`} value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value === null ? "" : String(value))) onCommit(draft); }}
    />
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x}`).join(", ");
  return String(v);
}

export function FinancialSettingsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [methodId, setMethodId] = useState("pac_atlantic_cee");
  const [busy, setBusy] = useState(false);
  const [newCost, setNewCost] = useState({ label: "", category: "autres" as CostCategory, amount: "" });
  const [newScale, setNewScale] = useState({ scale_year: "", climate_zone: "H1", amount: "", valid_from: "", valid_to: "" });
  const [thr, setThr] = useState({ red_below: "", orange_below: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/financial-settings", { cache: "no-store", credentials: "include" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Chargement impossible"); return; }
    setData(json);
    setThr({ red_below: String(json.thresholds.red_below), orange_below: String(json.thresholds.orange_below) });
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (payload: Record<string, unknown>, okMsg = "Enregistré") => {
    setBusy(true);
    const res = await fetch("/api/admin/financial-settings", {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { toast.error(json.error || "Erreur"); return false; }
    setData(json);
    toast.success(okMsg);
    return true;
  };

  if (!data) return <div className={CARD}><Loader2 className="w-5 h-5 animate-spin text-[#64748b]" /></div>;

  const method = data.methods.find((m) => m.id === methodId);
  const costs = data.costs.filter((c) => c.method_id === methodId);
  const scales = data.scales.filter((s) => s.method_id === methodId);
  const total = costs.filter((c) => c.active).reduce((s, c) => s + Math.round(Number(c.amount) * 100), 0) / 100;

  return (
    <div className="space-y-4">
      {/* Méthodes */}
      <div className={CARD}>
        <h2 className={TITLE}>Méthodes économiques</h2>
        <div className="flex flex-wrap gap-2">
          {data.methods.map((m, i) => (
            <button
              key={m.id} type="button" onClick={() => setMethodId(m.id)}
              className={`rounded-[9px] border px-3 py-2 text-left text-sm ${m.id === methodId ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e1e8f2] bg-white hover:bg-[#f4f7fb]"}`}
            >
              <span className="block text-[11px] text-[#64748b]">Méthode {i + 1}</span>
              <span className="font-medium text-[#0b1f3a]">{m.name}</span>
              <span className={`ml-2 text-[11px] ${m.is_configured ? "text-emerald-700" : "text-amber-700"}`}>
                {m.is_configured ? "configurée" : "à définir"}
              </span>
            </button>
          ))}
        </div>
        {method && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs text-[#64748b] mb-1">Nom</label>
              <Field ariaLabel="Nom de la méthode" value={method.name} onCommit={(v) => act({ action: "update_method", id: method.id, name: v })} />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1">Description</label>
              <Field ariaLabel="Description" value={method.description} onCommit={(v) => act({ action: "update_method", id: method.id, description: v })} />
            </div>
            <div className="flex flex-col gap-1 text-sm text-[#0b1f3a]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={method.is_configured} disabled={busy}
                  onChange={(e) => act({ action: "update_method", id: method.id, is_configured: e.target.checked })} />
                Prête pour le calcul
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={method.active} disabled={busy}
                  onChange={(e) => act({ action: "update_method", id: method.id, active: e.target.checked })} />
                Proposée sur les fiches
              </label>
            </div>
          </div>
        )}
        {method && !method.is_configured && (
          <p className="mt-3 text-xs text-amber-700">
            Méthode à définir : renseignez ses coûts et barèmes ci-dessous puis cochez « Prête pour le calcul ». Aucun montant n&apos;est inventé.
          </p>
        )}
      </div>

      {/* Coûts standards */}
      <div className={CARD}>
        <h2 className={TITLE}>Coûts standards par chantier</h2>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[#64748b]">
                <th className="px-4 sm:px-2 py-2 font-medium">Poste</th>
                <th className="px-2 py-2 font-medium">Catégorie</th>
                <th className="px-2 py-2 font-medium w-36">Montant TTC</th>
                <th className="px-2 py-2 font-medium w-16">Actif</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => (
                <tr key={c.id} className={`border-t border-[#f1f5f9] ${c.active ? "" : "opacity-50"}`}>
                  <td className="px-4 sm:px-2 py-1.5">
                    <Field ariaLabel="Libellé" value={c.label} onCommit={(v) => act({ action: "update_cost", id: c.id, label: v })} />
                  </td>
                  <td className="px-2 py-1.5 text-[#64748b]">{COST_CATEGORY_LABELS[c.category]}</td>
                  <td className="px-2 py-1.5">
                    <Field ariaLabel={`Montant ${c.label}`} type="number" value={Number(c.amount)}
                      onCommit={(v) => act({ action: "update_cost", id: c.id, amount: v }, "Montant mis à jour pour les nouveaux chantiers")} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" aria-label="Actif" checked={c.active} disabled={busy}
                      onChange={(e) => act({ action: "update_cost", id: c.id, active: e.target.checked })} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[#e1e8f2] font-semibold text-[#0b1f3a]">
                <td className="px-4 sm:px-2 py-2" colSpan={2}>Total</td>
                <td className="px-2 py-2 tabular-nums">{formatEuro(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <form
          className="mt-3 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "add_cost", method_id: methodId, ...newCost }, "Poste ajouté")) setNewCost({ label: "", category: "autres", amount: "" });
          }}
        >
          <input className={INPUT} placeholder="Nouveau poste de coût" value={newCost.label} onChange={(e) => setNewCost({ ...newCost, label: e.target.value })} required />
          <select className={INPUT} value={newCost.category} onChange={(e) => setNewCost({ ...newCost, category: e.target.value as CostCategory })}>
            {COST_CATEGORIES.map((c) => <option key={c} value={c}>{COST_CATEGORY_LABELS[c]}</option>)}
          </select>
          <input className={INPUT} type="number" step="0.01" min="0" placeholder="Montant" value={newCost.amount} onChange={(e) => setNewCost({ ...newCost, amount: e.target.value })} required />
          <button className={BTN} disabled={busy}><Plus className="w-4 h-4" />Ajouter</button>
        </form>
      </div>

      {/* Barèmes CEE */}
      <div className={CARD}>
        <h2 className={TITLE}>Barèmes CEE</h2>
        <p className="text-xs text-[#64748b] mb-3">
          Le barème est choisi selon la zone climatique et la date de signature du devis (comprise entre début et fin de validité).
          Modifier un montant ou une date remet le barème « à valider ». Les chantiers déjà calculés ne sont recalculés que si l&apos;un de leurs éléments change.
        </p>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[#64748b]">
                <th className="px-4 sm:px-2 py-2 font-medium">Année</th>
                <th className="px-2 py-2 font-medium">Zone</th>
                <th className="px-2 py-2 font-medium w-32">Montant CEE</th>
                <th className="px-2 py-2 font-medium w-40">Début</th>
                <th className="px-2 py-2 font-medium w-40">Fin</th>
                <th className="px-2 py-2 font-medium">Conditions d&apos;éligibilité</th>
                <th className="px-2 py-2 font-medium">Validation</th>
              </tr>
            </thead>
            <tbody>
              {scales.map((s) => (
                <tr key={s.id} className="border-t border-[#f1f5f9]">
                  <td className="px-4 sm:px-2 py-1.5 font-medium text-[#0b1f3a]">{s.scale_year}</td>
                  <td className="px-2 py-1.5">{s.climate_zone}</td>
                  <td className="px-2 py-1.5">
                    <Field ariaLabel="Montant CEE" type="number" value={Number(s.amount)} onCommit={(v) => act({ action: "update_scale", id: s.id, amount: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Field ariaLabel="Début de validité" type="date" value={s.valid_from} onCommit={(v) => act({ action: "update_scale", id: s.id, valid_from: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Field ariaLabel="Fin de validité" type="date" value={s.valid_to} onCommit={(v) => act({ action: "update_scale", id: s.id, valid_to: v || null })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Field ariaLabel="Conditions" value={s.conditions} onCommit={(v) => act({ action: "update_scale", id: s.id, conditions: v })} />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {s.validated ? (
                      <button type="button" disabled={busy} title="Retirer la validation"
                        onClick={() => act({ action: "update_scale", id: s.id, validated: false })}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" /> Validé
                      </button>
                    ) : (
                      <button type="button" disabled={busy}
                        onClick={() => act({ action: "update_scale", id: s.id, validated: true }, "Barème validé")}
                        className="text-xs rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-100">
                        À valider
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {scales.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-3 text-sm text-[#64748b]">Aucun barème pour cette méthode.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          className="mt-3 grid grid-cols-2 sm:grid-cols-[90px_80px_1fr_1fr_1fr_auto] gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "add_scale", method_id: methodId, ...newScale, valid_to: newScale.valid_to || null }, "Barème ajouté"))
              setNewScale({ scale_year: "", climate_zone: "H1", amount: "", valid_from: "", valid_to: "" });
          }}
        >
          <input className={INPUT} type="number" placeholder="Année" value={newScale.scale_year} onChange={(e) => setNewScale({ ...newScale, scale_year: e.target.value })} required />
          <select className={INPUT} value={newScale.climate_zone} onChange={(e) => setNewScale({ ...newScale, climate_zone: e.target.value })}>
            {["H1", "H2", "H3"].map((z) => <option key={z}>{z}</option>)}
          </select>
          <input className={INPUT} type="number" step="0.01" min="0" placeholder="Montant CEE" value={newScale.amount} onChange={(e) => setNewScale({ ...newScale, amount: e.target.value })} required />
          <input className={INPUT} type="date" aria-label="Début" value={newScale.valid_from} onChange={(e) => setNewScale({ ...newScale, valid_from: e.target.value })} required />
          <input className={INPUT} type="date" aria-label="Fin" value={newScale.valid_to} onChange={(e) => setNewScale({ ...newScale, valid_to: e.target.value })} />
          <button className={BTN} disabled={busy}><Plus className="w-4 h-4" />Ajouter</button>
        </form>
      </div>

      {/* Seuils */}
      <div className={CARD}>
        <h2 className={TITLE}>Alertes de rentabilité (marge brute prévisionnelle)</h2>
        <form
          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
          onSubmit={(e) => { e.preventDefault(); act({ action: "update_thresholds", ...thr }, "Seuils mis à jour"); }}
        >
          <div>
            <label className="block text-xs text-red-700 mb-1">Alerte rouge si marge inférieure à (€)</label>
            <input className={INPUT} type="number" step="0.01" min="0" value={thr.red_below} onChange={(e) => setThr({ ...thr, red_below: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-amber-700 mb-1">Vigilance orange jusqu&apos;à (€) — au-delà : vert</label>
            <input className={INPUT} type="number" step="0.01" min="0" value={thr.orange_below} onChange={(e) => setThr({ ...thr, orange_below: e.target.value })} />
          </div>
          <button className={BTN} disabled={busy}>Enregistrer</button>
        </form>
      </div>

      {/* Historique */}
      <div className={CARD}>
        <h2 className={TITLE}>Historique des modifications</h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-[#64748b]">Aucune modification pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[#64748b]">
                  <th className="px-4 sm:px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Utilisateur</th>
                  <th className="px-2 py-2 font-medium">Élément</th>
                  <th className="px-2 py-2 font-medium">Champ</th>
                  <th className="px-2 py-2 font-medium">Ancienne valeur</th>
                  <th className="px-2 py-2 font-medium">Nouvelle valeur</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id} className="border-t border-[#f1f5f9] align-top">
                    <td className="px-4 sm:px-2 py-1.5 whitespace-nowrap tabular-nums">{new Date(h.changed_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-2 py-1.5">{h.profile?.full_name || h.profile?.email || "—"}</td>
                    <td className="px-2 py-1.5">{h.entity_label}</td>
                    <td className="px-2 py-1.5">{FIELD_LABELS[h.field] ?? h.field}</td>
                    <td className="px-2 py-1.5 text-[#64748b]">{fmt(h.old_value)}</td>
                    <td className="px-2 py-1.5 text-[#0b1f3a]">{fmt(h.new_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
