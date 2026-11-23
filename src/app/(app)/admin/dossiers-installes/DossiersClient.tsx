"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { StatCard } from "@/components/ui-kit/StatCard";
import {
  computeProfitability,
  costOf,
  DOSSIER_STAGES,
  DOSSIER_STAGE_LABELS,
  dossierStage,
  gridCee,
  missingInfo,
  needsPac,
  patchForStage,
  revenueOf,
  summarize,
  type DossierRow,
  type DossierStage,
  type PacModel,
} from "@/lib/dossiers";
import { PacGridPanel } from "./PacGridPanel";
import { DELEGATAIRE_GROUPS, INSTALLATEUR_OPTIONS, INSTALLATION_TYPE_LABELS, type InstallationType } from "@/lib/types";
import { formatEuro } from "@/lib/finance/format";

const CARD = "rounded-[14px] border border-line bg-white shadow-card";
const CONTROL = "h-9 px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";
const CELL_INPUT =
  "h-8 w-[92px] px-2 text-right tabular-nums border border-transparent hover:border-line focus:border-brand-line rounded-md bg-transparent focus:bg-white text-sm text-ink focus:outline-none";
const CELL_SELECT = "h-8 max-w-[130px] px-1.5 border border-transparent hover:border-line rounded-md bg-transparent text-sm text-ink focus:outline-none focus:border-brand-line";

const STAGE_TONE: Record<DossierStage, { dot: string; ring: string; text: string }> = {
  a_deposer: { dot: "bg-gold", ring: "ring-gold/40", text: "text-gold" },
  depose: { dot: "bg-brand", ring: "ring-brand/40", text: "text-brand" },
  controle: { dot: "bg-amethyst", ring: "ring-amethyst/40", text: "text-amethyst" },
  paye: { dot: "bg-emerald", ring: "ring-emerald/40", text: "text-emerald" },
  bloque: { dot: "bg-ruby", ring: "ring-ruby/40", text: "text-ruby" },
};

type MoneyField = "benefit_cee" | "benefit_mpr" | "installation_cost" | "regie_cost";
type SortKey = "date" | "margin_asc" | "margin_desc" | "name";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");
const monthKey = (iso: string | null) => (iso ? iso.slice(0, 7) : "");
const fullName = (r: DossierRow) => `${r.last_name ?? ""} ${r.first_name ?? ""}`.trim() || "—";

async function patchLead(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/lead/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Lead-Form-Version": "2" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Enregistrement impossible");
  }
}

function MoneyCell({ row, field, onSave }: { row: DossierRow; field: MoneyField; onSave: (f: MoneyField, v: number | null) => void }) {
  const current = row[field];
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (current === null || current === undefined ? "" : String(current));
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      aria-label={field}
      className={CELL_INPUT}
      value={shown}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(null);
      }}
      onBlur={() => {
        if (draft === null) return;
        const v = draft.trim() === "" ? null : Number(draft.replace(",", "."));
        setDraft(null);
        if (v !== null && !Number.isFinite(v)) return;
        const prev = current === null || current === undefined ? null : Number(current);
        if (v !== prev) onSave(field, v);
      }}
    />
  );
}

export function DossiersClient({ initialRows, initialModels }: { initialRows: DossierRow[]; initialModels: PacModel[] }) {
  const [rows, setRows] = useState(initialRows);
  const [models, setModels] = useState(initialModels);
  const [pac, setPac] = useState("");
  const [stage, setStage] = useState<DossierStage | "">("");
  const [q, setQ] = useState("");
  const [installateur, setInstallateur] = useState("");
  const [delegataire, setDelegataire] = useState("");
  const [month, setMonth] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [sort, setSort] = useState<SortKey>("date");

  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => monthKey(r.installed_at)).filter(Boolean))).sort().reverse(),
    [rows]
  );

  // Filtres hors étape : le pipeline montre la répartition de la sélection courante.
  const baseFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (installateur === "none" ? r.installateur : installateur && r.installateur !== installateur) return false;
      if (delegataire === "none" ? r.delegataire_group : delegataire && r.delegataire_group !== delegataire) return false;
      if (month && monthKey(r.installed_at) !== month) return false;
      if (pac === "none" ? r.pac_model_id || !needsPac(r.installation_type) : pac && r.pac_model_id !== pac) return false;
      if (onlyIncomplete && missingInfo(r).length === 0) return false;
      if (needle && !`${r.first_name ?? ""} ${r.last_name ?? ""} ${r.city ?? ""} ${r.postal_code ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, installateur, delegataire, month, pac, onlyIncomplete]);

  const modelName = useMemo(() => new Map(models.map((m) => [m.id, m.name])), [models]);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.pac_model_id) m.set(r.pac_model_id, (m.get(r.pac_model_id) ?? 0) + 1);
    return m;
  }, [rows]);
  const applicableCount = useMemo(
    () => rows.filter((r) => r.pac_model_id && (r.benefit_cee === null || r.benefit_cee === undefined) && gridCee(r.pac_model_id, models) !== null).length,
    [rows, models]
  );

  /** Choix de la PAC : la prime CEE de la grille est proposée automatiquement. */
  function choosePac(r: DossierRow, modelId: string | null) {
    const patch: Partial<DossierRow> = { pac_model_id: modelId };
    const grid = gridCee(modelId, models);
    const current = r.benefit_cee === null || r.benefit_cee === undefined || r.benefit_cee === "" ? null : Number(r.benefit_cee);
    if (grid !== null && current !== grid) {
      if (current === null || window.confirm(`Remplacer la prime CEE actuelle (${formatEuro(current)}) par celle de cette PAC (${formatEuro(grid)}) ?`)) {
        patch.benefit_cee = grid;
      }
    }
    update(r.id, patch, `PAC « ${modelId ? modelName.get(modelId) ?? "" : "aucune"} »`);
  }

  const summary = useMemo(() => summarize(baseFiltered), [baseFiltered]);

  const visible = useMemo(() => {
    const list = stage ? baseFiltered.filter((r) => dossierStage(r) === stage) : [...baseFiltered];
    list.sort((a, b) => {
      if (sort === "name") return fullName(a).localeCompare(fullName(b), "fr");
      if (sort === "margin_asc") return computeProfitability(a) - computeProfitability(b);
      if (sort === "margin_desc") return computeProfitability(b) - computeProfitability(a);
      return (b.installed_at ?? "").localeCompare(a.installed_at ?? "");
    });
    return list;
  }, [baseFiltered, stage, sort]);

  const visibleSummary = useMemo(() => summarize(visible), [visible]);

  async function update(id: string, patch: Partial<DossierRow>, label: string) {
    const before = rows.find((r) => r.id === id);
    if (!before) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      await patchLead(id, { ...patch, logAction: `Suivi dossiers installés : ${label}` });
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === id ? before : r)));
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  }

  function exportCsv() {
    const head = [
      "Nom", "Prénom", "Ville", "Code postal", "Installé le", "Type", "PAC installée", "Installateur", "Délégataire", "Étape",
      "Prime CEE", "MPR", "Total primes", "Coût installation", "Coût matériel", "Coût régie", "Total coûts",
      "Rentabilité", "Factures fournisseurs HT", "À compléter",
    ];
    const n = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
    const lines = visible.map((r) => [
      r.last_name ?? "", r.first_name ?? "", r.city ?? "", r.postal_code ?? "", fmtDate(r.installed_at),
      r.installation_type ? INSTALLATION_TYPE_LABELS[r.installation_type as InstallationType] ?? r.installation_type : "",
      r.pac_model_id ? modelName.get(r.pac_model_id) ?? "" : "",
      r.installateur ?? "", r.delegataire_group ?? "", DOSSIER_STAGE_LABELS[dossierStage(r)],
      n(r.benefit_cee), n(r.benefit_mpr), n(revenueOf(r)), n(r.installation_cost), n(r.material_cost), n(r.regie_cost),
      n(costOf(r)), n(computeProfitability(r)), n(r.supplier_invoices_ht || ""), missingInfo(r).join(" / "),
    ]);
    const csv = [head, ...lines]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dossiers-installes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const resetFilters = () => {
    setStage(""); setQ(""); setInstallateur(""); setDelegataire(""); setMonth(""); setPac(""); setOnlyIncomplete(false);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dossiers installés"
        subtitle="Pipeline après installation et rentabilité de chaque dossier : Rentabilité = Prime CEE + MPR − installation − matériel − régie. La prime CEE est proposée selon la PAC installée ; tous les montants se modifient directement dans le tableau."
        actions={
          <button onClick={exportCsv} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-[9px] border border-line bg-white text-sm text-ink hover:bg-canvas">
            <Download className="w-4 h-4" /> Export Excel (CSV)
          </button>
        }
      />

      {/* ── Pipeline ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <button
          onClick={() => setStage("")}
          className={`${CARD} p-3 text-left transition ${stage === "" ? "ring-2 ring-ink/30" : "hover:border-line-strong"}`}
        >
          <p className="text-[13px] font-medium text-subtle">Tous les dossiers</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{summary.count}</p>
          <p className="text-xs text-subtle tabular-nums">Marge {formatEuro(summary.margin)}</p>
        </button>
        {summary.stages.map((s, i) => {
          const def = DOSSIER_STAGES[i];
          const tone = STAGE_TONE[s.key];
          return (
            <button
              key={s.key}
              title={def.hint}
              onClick={() => setStage(stage === s.key ? "" : s.key)}
              className={`${CARD} p-3 text-left transition ${stage === s.key ? `ring-2 ${tone.ring}` : "hover:border-line-strong"}`}
            >
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-subtle">
                <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                {i < 4 ? `${i + 1}. ` : ""}{s.label}
              </p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${tone.text}`}>{s.count}</p>
              <p className="text-xs text-subtle tabular-nums">Primes {formatEuro(s.revenue)}</p>
              <p className="text-xs text-subtle tabular-nums">Marge {formatEuro(s.margin)}</p>
            </button>
          );
        })}
      </div>

      {/* ── Indicateurs ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Primes (CEE + MPR)" value={formatEuro(summary.revenue)} hint={`${summary.count} dossiers`} tone="brand" />
        <StatCard label="Coûts (install. + matériel + régie)" value={formatEuro(summary.cost)} tone="neutral" />
        <StatCard label="Rentabilité totale" value={formatEuro(summary.margin)} tone={summary.margin < 0 ? "danger" : "success"} />
        <StatCard label="Marge moyenne / dossier" value={formatEuro(summary.avgMargin)} hint={`sur ${summary.complete} dossier(s) complet(s)`} tone="amethyst" />
        <StatCard label="Primes restant à encaisser" value={formatEuro(summary.toCollect)} hint={`déjà encaissé : ${formatEuro(summary.collected)}`} tone="warning" />
      </div>

      {summary.incomplete > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-gold/30 bg-gold-soft px-4 py-2.5 text-sm text-ink">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gold shrink-0" />
            <span><strong>{summary.incomplete}</strong> dossier(s) sans tous les montants : leur rentabilité est incomplète.</span>
          </span>
          <button onClick={() => setOnlyIncomplete(!onlyIncomplete)} className="text-sm font-medium text-gold underline">
            {onlyIncomplete ? "Voir tous les dossiers" : "Afficher seulement ceux à compléter"}
          </button>
        </div>
      )}

      <PacGridPanel
        models={models}
        onModelsChange={setModels}
        usage={usage}
        applicableCount={applicableCount}
        onApplied={(updated) => {
          const byId = new Map(updated.map((u) => [u.id, u.benefit_cee]));
          setRows((rs) => rs.map((r) => (byId.has(r.id) ? { ...r, benefit_cee: byId.get(r.id)! } : r)));
        }}
      />

      {/* ── Filtres ──────────────────────────────────────── */}
      <div className={`${CARD} p-3 flex flex-wrap items-center gap-2`}>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, ville, code postal…" className={`${CONTROL} w-full pl-8`} />
        </div>
        <select value={installateur} onChange={(e) => setInstallateur(e.target.value)} className={CONTROL} aria-label="Installateur">
          <option value="">Tous installateurs</option>
          {INSTALLATEUR_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="none">Non renseigné</option>
        </select>
        <select value={delegataire} onChange={(e) => setDelegataire(e.target.value)} className={CONTROL} aria-label="Délégataire">
          <option value="">Tous délégataires</option>
          {DELEGATAIRE_GROUPS.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="none">Non renseigné</option>
        </select>
        <select value={pac} onChange={(e) => setPac(e.target.value)} className={CONTROL} aria-label="PAC installée">
          <option value="">Toutes PAC</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          <option value="none">PAC non renseignée</option>
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={CONTROL} aria-label="Mois d'installation">
          <option value="">Tous les mois</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {new Date(`${m}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={CONTROL} aria-label="Tri">
          <option value="date">Plus récents</option>
          <option value="margin_asc">Rentabilité croissante</option>
          <option value="margin_desc">Rentabilité décroissante</option>
          <option value="name">Nom</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink px-1 cursor-pointer">
          <input type="checkbox" checked={onlyIncomplete} onChange={(e) => setOnlyIncomplete(e.target.checked)} className="accent-brand" />
          À compléter
        </label>
        <button onClick={resetFilters} className="h-9 px-3 rounded-[9px] text-sm text-subtle hover:text-ink">Réinitialiser</button>
      </div>

      {/* ── Tableau ─────────────────────────────────────── */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1340px] text-sm">
            <thead className="bg-canvas">
              <tr className="text-left text-xs text-subtle">
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-2 py-2 font-medium">Installé le</th>
                <th className="px-2 py-2 font-medium">PAC installée</th>
                <th className="px-2 py-2 font-medium">Installateur</th>
                <th className="px-2 py-2 font-medium">Délégataire</th>
                <th className="px-2 py-2 font-medium text-right">Prime CEE</th>
                <th className="px-2 py-2 font-medium text-right">MPR</th>
                <th className="px-2 py-2 font-medium text-right">Installation</th>
                <th className="px-2 py-2 font-medium text-right">Matériel</th>
                <th className="px-2 py-2 font-medium text-right">Régie</th>
                <th className="px-2 py-2 font-medium text-right">Rentabilité</th>
                <th className="px-2 py-2 font-medium">Étape</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const st = dossierStage(r);
                const profit = computeProfitability(r);
                const missing = missingInfo(r);
                const invGap = r.supplier_invoices_ht > 0 && r.supplier_invoices_ht - Number(r.material_cost ?? 0) > 1;
                return (
                  <tr key={r.id} className="border-t border-line-soft hover:bg-canvas/60 align-middle">
                    <td className="px-3 py-1.5">
                      <Link href={`/admin/leads/${r.id}`} className="font-medium text-ink hover:text-brand hover:underline">
                        {fullName(r)}
                      </Link>
                      <div className="text-xs text-subtle">
                        {[r.city, r.installation_type ? INSTALLATION_TYPE_LABELS[r.installation_type as InstallationType] ?? r.installation_type : null].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {missing.length > 0 && (
                        <div className="mt-0.5 text-[11px] text-gold">À compléter : {missing.join(", ")}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-subtle tabular-nums whitespace-nowrap">{fmtDate(r.installed_at)}</td>
                    <td className="px-2 py-1.5">
                      {needsPac(r.installation_type) || r.pac_model_id ? (
                        <select
                          className={`${CELL_SELECT} max-w-[170px] ${!r.pac_model_id ? "text-gold" : ""}`}
                          value={r.pac_model_id ?? ""}
                          aria-label="PAC installée"
                          onChange={(e) => choosePac(r, e.target.value || null)}
                        >
                          <option value="">— choisir —</option>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}{m.cee_amount !== null ? ` · ${formatEuro(m.cee_amount)}` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-faint px-1.5">Sans PAC</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className={CELL_SELECT}
                        value={r.installateur ?? ""}
                        aria-label="Installateur"
                        onChange={(e) => update(r.id, { installateur: e.target.value || null }, "installateur")}
                      >
                        <option value="">—</option>
                        {INSTALLATEUR_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        {r.installateur && !(INSTALLATEUR_OPTIONS as readonly string[]).includes(r.installateur) && (
                          <option value={r.installateur}>{r.installateur}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className={CELL_SELECT}
                        value={r.delegataire_group ?? ""}
                        aria-label="Délégataire"
                        onChange={(e) => update(r.id, { delegataire_group: e.target.value || null }, "délégataire")}
                      >
                        <option value="">—</option>
                        {DELEGATAIRE_GROUPS.map((o) => <option key={o} value={o}>{o}</option>)}
                        {r.delegataire_group && !(DELEGATAIRE_GROUPS as readonly string[]).includes(r.delegataire_group) && (
                          <option value={r.delegataire_group}>{r.delegataire_group}</option>
                        )}
                      </select>
                    </td>
                    {(["benefit_cee", "benefit_mpr", "installation_cost"] as MoneyField[]).map((f) => {
                      const grid = f === "benefit_cee" ? gridCee(r.pac_model_id, models) : null;
                      const showGrid = grid !== null && Number(r.benefit_cee ?? NaN) !== grid;
                      return (
                        <td key={f} className="px-1 py-1.5 text-right">
                          <MoneyCell row={r} field={f} onSave={(field, v) => update(r.id, { [field]: v }, "montants")} />
                          {showGrid && (
                            <button
                              className="block ml-auto pr-2 text-[11px] text-brand hover:underline"
                              title="Appliquer la prime prévue pour cette PAC"
                              onClick={() => update(r.id, { benefit_cee: grid }, "prime CEE d'après la PAC")}
                            >
                              PAC : {formatEuro(grid)}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      <Link href={`/admin/leads/${r.id}`} title="Le matériel se modifie sur la fiche client" className="text-ink hover:underline">
                        {r.material_cost ? formatEuro(r.material_cost) : "—"}
                      </Link>
                      {r.supplier_invoices_count > 0 && (
                        <div className={`text-[11px] ${invGap ? "text-ruby" : "text-subtle"}`} title="Total HT des factures fournisseurs rattachées à ce client">
                          Factures : {formatEuro(r.supplier_invoices_ht)}
                        </div>
                      )}
                    </td>
                    <td className="px-1 py-1.5 text-right">
                      <MoneyCell row={r} field="regie_cost" onSave={(field, v) => update(r.id, { [field]: v ?? 0 }, "montants")} />
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap ${profit < 0 ? "text-ruby" : missing.length ? "text-subtle" : "text-emerald"}`}>
                      {formatEuro(profit)}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${STAGE_TONE[st].dot}`} />
                        <select
                          className={CELL_SELECT}
                          value={st}
                          aria-label="Étape du dossier"
                          onChange={(e) => {
                            const next = e.target.value as DossierStage;
                            update(r.id, patchForStage(next, r), `étape « ${DOSSIER_STAGE_LABELS[next]} »`);
                          }}
                        >
                          {DOSSIER_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-subtle">Aucun dossier pour ces filtres.</td></tr>
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot className="bg-canvas font-semibold text-ink">
                <tr className="border-t border-line">
                  <td className="px-3 py-2" colSpan={5}>Total ({visible.length} dossiers)</td>
                  <td className="px-2 py-2 text-right tabular-nums" colSpan={2}>{formatEuro(visibleSummary.revenue)}</td>
                  <td className="px-2 py-2 text-right tabular-nums" colSpan={3}>{formatEuro(visibleSummary.cost)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${visibleSummary.margin < 0 ? "text-ruby" : "text-emerald"}`}>{formatEuro(visibleSummary.margin)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="text-xs text-faint">
        Étapes : « Déposé », « Contrôle Veritas » et « Payé » correspondent aux cases du Statut chantier de la fiche client (cocher l&apos;une ou changer l&apos;étape ici revient au même).
        Les factures fournisseurs affichées sous le matériel sont celles rattachées au client (en rouge si elles dépassent le coût matériel saisi).
      </p>
    </div>
  );
}
