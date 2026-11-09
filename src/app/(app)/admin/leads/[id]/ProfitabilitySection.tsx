"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Clock, Info, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  COST_CATEGORY_LABELS,
  marginAlertLevel,
  type AlertThresholds,
  type CostLine,
  type ClimateZone,
} from "@/lib/finance/engine";
import { ALERT_STYLES, formatEuro, formatPercent } from "@/lib/finance/format";

interface Method { id: string; name: string; description: string | null; is_configured: boolean; active: boolean }
interface Candidate { insee_code: string; commune: string; department_code: string; zone: ClimateZone | null }
interface Financials {
  method_id: string | null;
  calc_status: "calcule" | "en_attente";
  pending_reasons: string[];
  climate_zone: ClimateZone | null;
  zone_source: "auto" | "manuel" | "a_confirmer" | "introuvable" | null;
  zone_message: string | null;
  zone_candidates: Candidate[] | null;
  insee_code: string | null;
  department_code: string | null;
  scale_year: number | null;
  scale_validated: boolean | null;
  cee_scale_amount: number | null;
  cee_confirmed: number | null;
  cee_forecast: number | null;
  standard_costs_at: string | null;
  cost_overrides: Record<string, number>;
  other_costs: number;
  cost_lines: CostLine[] | null;
  cost_materiel: number | null;
  cost_fournitures: number | null;
  cost_main_oeuvre: number | null;
  cost_dossier: number | null;
  cost_autres: number | null;
  total_cost: number | null;
  reste_a_charge: number;
  other_revenue: number;
  revenue: number | null;
  gross_margin: number | null;
  margin_rate: number | null;
  real_cost: number | null;
  real_cost_validated: boolean;
  real_cost_validated_at: string | null;
  cee_received: number | null;
  rac_received: number | null;
  calculated_at: string | null;
}
interface HistoryEntry {
  id: string;
  calculated_at: string;
  trigger: string;
  snapshot: { gross_margin: number | null; calc_status: string; cee_forecast: number | null; total_cost: number | null };
  profile: { full_name: string | null } | null;
}
interface Payload {
  lead: { devis_signed_at: string | null; postal_code: string | null; city: string | null };
  financials: Financials | null;
  methods: Method[];
  thresholds: AlertThresholds;
  history: HistoryEntry[];
  currentCosts: { code: string; amount: number }[];
}

const CARD = "rounded-[12px] border border-[#e1e8f2] bg-white shadow-[0_1px_2px_rgba(13,38,76,.06)] p-4 sm:p-5";
const LABEL = "block text-xs font-medium text-[#64748b] mb-1";
const INPUT =
  "h-9 w-full px-3 border border-[#e1e8f2] rounded-[9px] bg-white text-[#0b1f3a] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40 disabled:bg-[#f4f7fb]";

/** Champ montant enregistré à la sortie du champ (pas à chaque frappe). */
function AmountInput({
  value, onCommit, placeholder, disabled, ariaLabel,
}: { value: number | null | undefined; onCommit: (v: string) => void; placeholder?: string; disabled?: boolean; ariaLabel: string }) {
  const [draft, setDraft] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === null || value === undefined ? "" : String(value)), [value]);
  return (
    <input
      type="number" inputMode="decimal" step="0.01" min="0" aria-label={ariaLabel}
      className={INPUT} value={draft} placeholder={placeholder} disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const cur = value === null || value === undefined ? "" : String(value);
        if (draft !== cur) onCommit(draft);
      }}
    />
  );
}

function DateInput({
  id, value, onCommit, disabled,
}: { id: string; value: string | null; onCommit: (v: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <input
      id={id} type="date" className={INPUT} value={draft} disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value ?? "")) onCommit(draft); }}
    />
  );
}

function Row({ label, value, strong, hint }: { label: string; value: React.ReactNode; strong?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[#f1f5f9] last:border-0">
      <span className="text-sm text-[#64748b]">
        {label}
        {hint && <span className="ml-1 text-xs text-[#94a3b8]">{hint}</span>}
      </span>
      <span className={`text-sm tabular-nums text-right ${strong ? "font-semibold text-[#0b1f3a]" : "text-[#0b1f3a]"}`}>{value}</span>
    </div>
  );
}

export function ProfitabilitySection({ leadId, isAdmin }: { leadId: string; isAdmin: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/leads/${leadId}/financials`, { credentials: "include", cache: "no-store" });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Erreur de chargement");
    else { setData(json); setError(null); }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  // La fiche lead enregistre code postal / ville en auto-save (événement « lead-saved ») :
  // on rafraîchit l'encart pour refléter le recalcul fait côté serveur.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("lead-saved", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("lead-saved", onFocus);
    };
  }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    const res = await fetch(`/api/admin/leads/${leadId}/financials`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error || "Enregistrement impossible"); return; }
    setData(json);
  };

  if (error) return <div className={CARD}><p className="text-sm text-red-600">Rentabilité : {error}</p></div>;
  if (!data) {
    return (
      <div className={CARD}>
        <div className="h-5 w-48 bg-[#f4f7fb] rounded mb-3 animate-pulse" />
        <div className="h-24 bg-[#f4f7fb] rounded animate-pulse" />
      </div>
    );
  }

  const f = data.financials;
  const method = data.methods.find((m) => m.id === f?.method_id) || null;
  const hasMethod = !!f?.method_id;
  const computed = f?.calc_status === "calcule" && f.gross_margin !== null;
  const alert = computed ? marginAlertLevel(Number(f!.gross_margin), data.thresholds) : null;
  const realMargin =
    f && f.real_cost_validated && f.real_cost !== null && f.cee_received !== null
      ? Number(f.cee_received) + Number(f.rac_received ?? 0) - Number(f.real_cost)
      : null;
  const standardChanged =
    !!f?.cost_lines &&
    data.currentCosts.length > 0 &&
    (data.currentCosts.length !== f.cost_lines.length ||
      data.currentCosts.some((c) => f.cost_lines!.find((l) => l.code === c.code)?.standard_amount !== c.amount));

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Rentabilité du chantier</h2>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-[#64748b]" />}
          {alert && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ALERT_STYLES[alert].badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ALERT_STYLES[alert].dot}`} />
              {ALERT_STYLES[alert].label}
            </span>
          )}
          {hasMethod && !computed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              <Clock className="w-3 h-3" /> Calcul en attente
            </span>
          )}
        </div>
      </div>

      {/* Méthode + date + zone */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={LABEL} htmlFor="fin-method">Méthode économique</label>
          <select
            id="fin-method" className={INPUT} value={f?.method_id ?? ""} disabled={saving}
            onChange={(e) => save({ method_id: e.target.value || null })}
          >
            <option value="">— Aucune —</option>
            {data.methods.filter((m) => m.active || m.id === f?.method_id).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.is_configured ? "" : " (à définir)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="fin-devis">Date de signature du devis</label>
          <DateInput
            id="fin-devis" value={data.lead.devis_signed_at} disabled={saving}
            onCommit={(v) => save({ devis_signed_at: v || null })}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="fin-zone">Zone climatique</label>
          <select
            id="fin-zone" className={INPUT} disabled={saving || !hasMethod}
            value={f?.climate_zone ?? ""}
            onChange={(e) => (e.target.value ? save({ climate_zone: e.target.value }) : save({ zone_auto: true }))}
          >
            <option value="">{hasMethod ? "Non déterminée" : "—"}</option>
            {(["H1", "H2", "H3"] as const).map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          {f && hasMethod && (
            <p className="text-xs text-[#64748b] mt-1">
              {f.zone_source === "auto" && <>Détectée automatiquement{f.department_code ? ` (dép. ${f.department_code}${f.insee_code ? `, INSEE ${f.insee_code}` : ""})` : ""}</>}
              {f.zone_source === "manuel" && (
                <>Saisie manuelle · <button type="button" className="underline" onClick={() => save({ zone_auto: true })}>détection auto</button></>
              )}
            </p>
          )}
        </div>
      </div>

      {!hasMethod && (
        <p className="mt-4 text-sm text-[#64748b] flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          Choisissez une méthode économique : coûts, prime CEE et marge seront calculés automatiquement.
        </p>
      )}

      {f && hasMethod && (
        <>
          {/* Confirmation de commune ambiguë */}
          {f.zone_source === "a_confirmer" && f.zone_candidates && (
            <div className="mt-4 rounded-[9px] border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800 font-medium mb-2">
                Le code postal {data.lead.postal_code} couvre des communes de zones différentes. Quelle est la commune d&apos;installation ?
              </p>
              <div className="flex flex-wrap gap-2">
                {f.zone_candidates.map((c) => (
                  <button
                    key={c.insee_code} type="button" disabled={!c.zone || saving}
                    onClick={() => c.zone && save({ climate_zone: c.zone, insee_code: c.insee_code })}
                    className="text-xs rounded-full border border-amber-300 bg-white px-3 py-1 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {c.commune} ({c.department_code}) → {c.zone ?? "hors zone"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Alertes */}
          <div className="mt-4 space-y-2">
            {!computed && f.pending_reasons.length > 0 && (
              <div className="rounded-[9px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium mb-1">Calcul en attente :</p>
                <ul className="list-disc pl-5 space-y-0.5">{f.pending_reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            {f.scale_year !== null && f.scale_validated === false && (
              <p className="flex items-start gap-2 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Barème CEE {f.scale_year} {f.climate_zone} non encore validé par un administrateur (Paramètres financiers).
              </p>
            )}
            {computed && f.cee_confirmed === null && (
              <p className="flex items-start gap-2 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Montant CEE non confirmé : la prime affichée est celle du barème.
              </p>
            )}
          </div>

          {/* Indicateurs clés */}
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Prime CEE prév.", value: formatEuro(f.cee_forecast) },
              { label: "Coût total prév.", value: formatEuro(f.total_cost) },
              { label: "CA prévisionnel", value: computed ? formatEuro(f.revenue) : "En attente" },
              {
                label: "Marge brute prév.",
                value: computed ? formatEuro(f.gross_margin) : "En attente",
                sub: computed ? formatPercent(f.margin_rate) : null,
                cls: alert ? ALERT_STYLES[alert].text : "",
              },
            ].map((k) => (
              <div key={k.label} className="rounded-[10px] bg-[#f4f7fb] border border-[#e1e8f2] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#64748b]">{k.label}</p>
                <p className={`text-lg font-semibold tabular-nums text-[#0b1f3a] ${k.cls ?? ""}`}>{k.value}</p>
                {k.sub && <p className={`text-xs tabular-nums ${k.cls ?? "text-[#64748b]"}`}>Taux de marge {k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Détail */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-x-8">
            <div>
              <Row label="Méthode économique" value={method?.name ?? "—"} />
              <Row label="Année du barème" value={f.scale_year ?? "—"} />
              <Row label="Zone climatique" value={f.climate_zone ?? "—"} />
              <Row label="Montant CEE prévisionnel" value={formatEuro(f.cee_forecast)} hint={f.cee_confirmed !== null ? "(confirmé)" : f.cee_scale_amount !== null ? "(barème)" : undefined} />
              <Row label="Reste à charge client" value={formatEuro(f.reste_a_charge)} />
              {Number(f.other_revenue) > 0 && <Row label="Autres recettes" value={formatEuro(f.other_revenue)} />}
              <Row label="Chiffre d'affaires prévisionnel" value={computed ? formatEuro(f.revenue) : "En attente"} strong />
            </div>
            <div>
              <Row label="Coût matériel" value={formatEuro(f.cost_materiel)} />
              <Row label="Coût fournitures" value={formatEuro(f.cost_fournitures)} />
              <Row label="Coût main-d'œuvre" value={formatEuro(f.cost_main_oeuvre)} />
              <Row label="Coût dossier" value={formatEuro(f.cost_dossier)} />
              <Row label="Autres coûts" value={formatEuro(f.cost_autres)} />
              <Row label="Coût total prévisionnel" value={formatEuro(f.total_cost)} strong />
              <Row label="Marge brute prévisionnelle" value={computed ? formatEuro(f.gross_margin) : "En attente"} strong />
              <Row label="Taux de marge (sur CA)" value={computed ? formatPercent(f.margin_rate) : "—"} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[#94a3b8]">
            Montants TTC.{f.standard_costs_at && <> Coûts standards figés le {new Date(f.standard_costs_at).toLocaleDateString("fr-FR")}.</>}
          </p>

          {/* Ajustements du chantier */}
          <button
            type="button" onClick={() => setShowAdjust((v) => !v)}
            className="mt-4 flex items-center gap-1 text-sm font-medium text-[#2563eb]"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdjust ? "rotate-180" : ""}`} />
            Ajuster ce chantier & saisir le réel
          </button>

          {showAdjust && (
            <div className="mt-3 space-y-5">
              <div>
                <p className="text-xs font-semibold text-[#0b1f3a] mb-2">Coûts prévisionnels (spécifiques à ce chantier)</p>
                <div className="space-y-2">
                  {(f.cost_lines || []).map((l) => (
                    <div key={l.code} className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-1 sm:gap-3 items-center">
                      <div className="text-sm text-[#0b1f3a]">
                        {l.label}
                        <span className="ml-1 text-xs text-[#94a3b8]">
                          {COST_CATEGORY_LABELS[l.category]} · standard {formatEuro(l.standard_amount)}
                        </span>
                        {l.overridden && (
                          <button
                            type="button" className="ml-2 text-xs text-[#2563eb] underline"
                            onClick={() => {
                              const next = { ...(f.cost_overrides || {}) };
                              delete next[l.code];
                              save({ cost_overrides: next });
                            }}
                          >
                            revenir au standard
                          </button>
                        )}
                      </div>
                      <AmountInput
                        ariaLabel={l.label} value={l.amount} disabled={saving}
                        onCommit={(v) => save({ cost_overrides: { ...(f.cost_overrides || {}), [l.code]: v === "" ? null : v } })}
                      />
                    </div>
                  ))}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-1 sm:gap-3 items-center">
                    <div className="text-sm text-[#0b1f3a]">Autres coûts spécifiques au chantier</div>
                    <AmountInput ariaLabel="Autres coûts" value={f.other_costs} disabled={saving} onCommit={(v) => save({ other_costs: v })} />
                  </div>
                </div>
                {isAdmin && standardChanged && (
                  <button
                    type="button" disabled={saving}
                    onClick={() => { if (confirm("Remplacer les coûts figés de ce chantier par les coûts standards actuels ?")) save({ reset_standard_costs: true }); }}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-[#2563eb] underline"
                  >
                    <RotateCcw className="w-3 h-3" /> Les coûts standards ont changé depuis : réappliquer les coûts actuels
                  </button>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-[#0b1f3a] mb-2">Recettes prévisionnelles</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>Montant CEE confirmé</label>
                    <AmountInput ariaLabel="Montant CEE confirmé" value={f.cee_confirmed} placeholder="Non confirmé" disabled={saving} onCommit={(v) => save({ cee_confirmed: v === "" ? null : v })} />
                  </div>
                  <div>
                    <label className={LABEL}>Reste à charge client</label>
                    <AmountInput ariaLabel="Reste à charge client" value={f.reste_a_charge} disabled={saving} onCommit={(v) => save({ reste_a_charge: v })} />
                  </div>
                  <div>
                    <label className={LABEL}>Autres recettes</label>
                    <AmountInput ariaLabel="Autres recettes" value={f.other_revenue} disabled={saving} onCommit={(v) => save({ other_revenue: v })} />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#0b1f3a] mb-2">Réel (facturé / payé / encaissé)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>CEE réellement encaissé</label>
                    <AmountInput ariaLabel="CEE encaissé" value={f.cee_received} placeholder="Non encaissé" disabled={saving} onCommit={(v) => save({ cee_received: v === "" ? null : v })} />
                  </div>
                  <div>
                    <label className={LABEL}>Reste à charge encaissé</label>
                    <AmountInput ariaLabel="Reste à charge encaissé" value={f.rac_received} disabled={saving} onCommit={(v) => save({ rac_received: v === "" ? null : v })} />
                  </div>
                  <div>
                    <label className={LABEL}>Coût réel du chantier</label>
                    <AmountInput ariaLabel="Coût réel" value={f.real_cost} disabled={saving || f.real_cost_validated} onCommit={(v) => save({ real_cost: v === "" ? null : v })} />
                    <label className="mt-1.5 flex items-center gap-2 text-xs text-[#0b1f3a]">
                      <input
                        type="checkbox" checked={f.real_cost_validated} disabled={saving}
                        onChange={(e) => {
                          if (!e.target.checked && !confirm("Retirer la validation du coût réel ?")) return;
                          save({ real_cost_validated: e.target.checked });
                        }}
                      />
                      Coût réel validé
                      {f.real_cost_validated_at && <span className="text-[#94a3b8]">le {new Date(f.real_cost_validated_at).toLocaleDateString("fr-FR")}</span>}
                    </label>
                  </div>
                </div>
                <p className="mt-2 text-sm text-[#0b1f3a]">
                  Marge brute réalisée :{" "}
                  <span className="font-semibold tabular-nums">
                    {realMargin !== null ? formatEuro(realMargin) : "— (CEE encaissé et coût réel validé requis)"}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Historique des calculs */}
          {data.history.length > 0 && (
            <>
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="mt-4 flex items-center gap-1 text-xs text-[#64748b]">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
                Historique des calculs ({data.history.length})
              </button>
              {showHistory && (
                <ul className="mt-2 space-y-1 text-xs text-[#64748b]">
                  {data.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap gap-x-2">
                      <span className="tabular-nums">{new Date(h.calculated_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                      <span>· {h.profile?.full_name || "Système"}</span>
                      <span>· {h.trigger}</span>
                      <span className="text-[#0b1f3a]">
                        → {h.snapshot.calc_status === "calcule" ? `marge ${formatEuro(h.snapshot.gross_margin)}` : "en attente"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
