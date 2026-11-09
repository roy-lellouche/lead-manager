import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, getSessionUser } from "@/lib/supabase/session";
import { normalizeRole, roleLandingPath } from "@/lib/roles";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";
import { loadAlertThresholds } from "@/lib/finance/server";
import { aggregateDashboard, type Bucket, type DashboardRow } from "@/lib/finance/dashboard";
import { ALERT_STYLES, formatEuro } from "@/lib/finance/format";
import { MonthlyChart } from "./MonthlyChart";

const CARD = "rounded-[12px] border border-[#e1e8f2] bg-white shadow-[0_1px_2px_rgba(13,38,76,.06)] p-4 sm:p-5";
const TITLE = "text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-3";
const INPUT = "h-9 w-full px-3 border border-[#e1e8f2] rounded-[9px] bg-white text-[#0b1f3a] text-sm";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border border-[#e1e8f2] bg-white p-4">
      <p className="text-[11px] uppercase tracking-wide text-[#64748b]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[#0b1f3a]">{value}</p>
      {sub && <p className="text-xs text-[#64748b] mt-0.5">{sub}</p>}
    </div>
  );
}

function BucketTable({ title, buckets }: { title: string; buckets: Bucket[] }) {
  return (
    <div className={CARD}>
      <h2 className={TITLE}>{title}</h2>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[#64748b]">
              <th className="px-4 sm:px-2 py-2 font-medium"></th>
              <th className="px-2 py-2 font-medium text-right">Chantiers</th>
              <th className="px-2 py-2 font-medium text-right">CA prév.</th>
              <th className="px-2 py-2 font-medium text-right">Marge prév.</th>
              <th className="px-2 py-2 font-medium text-right">Moy./chantier</th>
              <th className="px-2 py-2 font-medium text-right">Marge réalisée</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key} className="border-t border-[#f1f5f9]">
                <td className="px-4 sm:px-2 py-1.5 font-medium text-[#0b1f3a]">{b.key}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{b.count}{b.computed !== b.count && <span className="text-[#94a3b8]"> ({b.computed} calc.)</span>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(b.revenue)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(b.margin)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(b.avgMargin)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{b.realizedCount ? formatEuro(b.realizedMargin) : "—"}</td>
              </tr>
            ))}
            {buckets.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-[#64748b]">Aucune donnée.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function RentabilitePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const role = normalizeRole((await getSessionProfile(user.id))?.role);
  if (role !== "admin") redirect(roleLandingPath(role));

  const sp = await searchParams;
  const filters = {
    from: one(sp.from),
    to: one(sp.to),
    zone: one(sp.zone),
    method: one(sp.method),
    status: one(sp.status),
  };

  const admin = createAdminClient();
  let query = admin
    .from("lead_financials")
    .select("*, lead:leads!inner(id, first_name, last_name, status, devis_signed_at)")
    .not("method_id", "is", null);
  if (filters.method) query = query.eq("method_id", filters.method);
  if (filters.zone) query = filters.zone === "none" ? query.is("climate_zone", null) : query.eq("climate_zone", filters.zone);
  if (filters.status) query = query.eq("lead.status", filters.status);
  // Période : date de signature du devis (date qui détermine le barème).
  if (filters.from) query = query.gte("lead.devis_signed_at", filters.from);
  if (filters.to) query = query.lte("lead.devis_signed_at", filters.to);

  const [{ data, error }, { data: methods }, thresholds] = await Promise.all([
    query,
    admin.from("economic_methods").select("id, name").order("display_order"),
    loadAlertThresholds(admin),
  ]);

  type Joined = Record<string, unknown> & { lead: { first_name: string; last_name: string; status: string; devis_signed_at: string | null } };
  const methodNames = new Map((methods || []).map((m, i) => [m.id as string, `M${i + 1} — ${m.name}`]));
  const rows: DashboardRow[] = ((data || []) as Joined[]).map((r) => ({
    ...(r as unknown as DashboardRow),
    method_name: methodNames.get(String(r.method_id)) ?? String(r.method_id),
    lead_name: `${r.lead.first_name ?? ""} ${r.lead.last_name ?? ""}`.trim() || "—",
    lead_status: r.lead.status,
    devis_signed_at: r.lead.devis_signed_at,
  }));
  const s = aggregateDashboard(rows, thresholds);
  const methodName = filters.method ? methods?.find((m) => m.id === filters.method)?.name : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rentabilité des chantiers"
        subtitle="Prévisionnel calculé automatiquement (base HT, TVA récupérable déduite) ; réel = montants encaissés et coûts réels validés."
        actions={<Link href="/admin/parametres-financiers" className="text-sm text-[#2563eb] underline">Paramètres financiers</Link>}
      />

      <form className={`${CARD} grid grid-cols-2 lg:grid-cols-6 gap-3 items-end`} method="get">
        <div>
          <label className="block text-xs text-[#64748b] mb-1">Devis signé du</label>
          <input type="date" name="from" defaultValue={filters.from} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs text-[#64748b] mb-1">au</label>
          <input type="date" name="to" defaultValue={filters.to} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs text-[#64748b] mb-1">Zone</label>
          <select name="zone" defaultValue={filters.zone} className={INPUT}>
            <option value="">Toutes</option>
            <option value="H1">H1</option><option value="H2">H2</option><option value="H3">H3</option>
            <option value="none">Non déterminée</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#64748b] mb-1">Méthode</label>
          <select name="method" defaultValue={filters.method} className={INPUT}>
            <option value="">Toutes</option>
            {(methods || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#64748b] mb-1">Statut du chantier</label>
          <select name="status" defaultValue={filters.status} className={INPUT}>
            <option value="">Tous</option>
            {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((k) => <option key={k} value={k}>{LEAD_STATUS_LABELS[k]}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="h-9 flex-1 px-3 rounded-[9px] bg-[#0b1f3a] text-white text-sm font-medium">Filtrer</button>
          <Link href="/admin/rentabilite" className="h-9 px-3 inline-flex items-center rounded-[9px] border border-[#e1e8f2] text-sm text-[#64748b]">×</Link>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">Erreur de chargement : {error.message}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={`Chantiers ${methodName ?? ""}`.trim()} value={String(s.count)} sub={`${s.computed} calculés · ${s.pending} en attente`} />
        <Kpi label="CEE prévisionnel" value={formatEuro(s.ceeForecast)} />
        <Kpi label="CEE réellement encaissé" value={formatEuro(s.ceeReceived)} />
        <Kpi label="Marge moyenne / chantier" value={formatEuro(s.avgMargin)} sub="prévisionnelle" />
        <Kpi label="Coût de revient prévisionnel" value={formatEuro(s.forecastCost)} sub="coûts standards, après TVA récupérable" />
        <Kpi label="Coût réel des chantiers" value={formatEuro(s.realCost)} sub="coûts réels validés" />
        <Kpi label="Marge brute prévisionnelle" value={formatEuro(s.forecastMargin)} />
        <Kpi label="Marge brute réalisée" value={formatEuro(s.realizedMargin)} sub={`${s.realizedCount} chantier(s) soldé(s)`} />
      </div>

      <div className={CARD}>
        <h2 className={TITLE}>Évolution mensuelle de la rentabilité (mois de signature du devis)</h2>
        <MonthlyChart data={s.byMonth.filter((b) => b.key !== "Sans date")} />
      </div>

      <div className={CARD}>
        <h2 className={TITLE}>Comparaison des méthodes</h2>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[#64748b]">
                <th className="px-4 sm:px-2 py-2 font-medium">Méthode</th>
                <th className="px-2 py-2 font-medium text-right">Chantiers</th>
                <th className="px-2 py-2 font-medium text-right">CEE prévu</th>
                <th className="px-2 py-2 font-medium text-right">CEE encaissé</th>
                <th className="px-2 py-2 font-medium text-right">Coût standard prév.</th>
                <th className="px-2 py-2 font-medium text-right">Coût réel validé</th>
                <th className="px-2 py-2 font-medium text-right">Marge prév.</th>
                <th className="px-2 py-2 font-medium text-right">Marge réalisée</th>
                <th className="px-2 py-2 font-medium text-right">Marge moy./installation</th>
              </tr>
            </thead>
            <tbody>
              {s.byMethod.map((b) => (
                <tr key={b.key} className="border-t border-[#f1f5f9]">
                  <td className="px-4 sm:px-2 py-1.5 font-medium text-[#0b1f3a]">{b.key}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{b.count}{b.computed !== b.count && <span className="text-[#94a3b8]"> ({b.computed} calc.)</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(b.ceeForecast)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(b.ceeReceived)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(b.cost)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(b.realCost)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(b.margin)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{b.realizedCount ? formatEuro(b.realizedMargin) : "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">{formatEuro(b.avgMargin)}</td>
                </tr>
              ))}
              {s.byMethod.length === 0 && <tr><td colSpan={9} className="px-2 py-3 text-[#64748b]">Aucune donnée.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[#94a3b8]">
          Les chantiers calculés avant l&apos;introduction de la TVA conservent leurs montants d&apos;origine (sans retraitement).
        </p>
      </div>

      <BucketTable title="Marges par méthode et zone climatique" buckets={s.byMethodZone} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <BucketTable title="Rentabilité par zone climatique" buckets={s.byZone} />
        <BucketTable title="Rentabilité par année de barème" buckets={s.byYear} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className={CARD}>
          <h2 className={TITLE}>Alertes de marge</h2>
          {s.alerts.length === 0 ? <p className="text-sm text-[#64748b]">Aucune alerte.</p> : (
            <ul className="space-y-1.5">
              {s.alerts.map((a) => (
                <li key={a.lead_id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/admin/leads/${a.lead_id}`} className="flex items-center gap-2 text-[#0b1f3a] hover:underline">
                    <span className={`w-2 h-2 rounded-full ${ALERT_STYLES[a.level].dot}`} />{a.lead_name}
                  </Link>
                  <span className={`tabular-nums font-medium ${ALERT_STYLES[a.level].text}`}>{formatEuro(a.margin)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={CARD}>
          <h2 className={TITLE}>CEE non confirmé ({s.ceeNotConfirmed.length})</h2>
          {s.unvalidatedScale > 0 && (
            <p className="mb-2 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {s.unvalidatedScale} chantier(s) calculé(s) sur un barème non encore validé.
            </p>
          )}
          {s.ceeNotConfirmed.length === 0 ? <p className="text-sm text-[#64748b]">Tous les montants sont confirmés.</p> : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {s.ceeNotConfirmed.map((c) => (
                <li key={c.lead_id}><Link href={`/admin/leads/${c.lead_id}`} className="text-sm text-[#0b1f3a] hover:underline">{c.lead_name}</Link></li>
              ))}
            </ul>
          )}
        </div>
        <div className={CARD}>
          <h2 className={TITLE}>Calculs en attente ({s.pendingList.length})</h2>
          {s.pendingList.length === 0 ? <p className="text-sm text-[#64748b]">Aucun.</p> : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {s.pendingList.map((p) => (
                <li key={p.lead_id} className="text-sm">
                  <Link href={`/admin/leads/${p.lead_id}`} className="flex items-center gap-1.5 text-[#0b1f3a] hover:underline">
                    <Clock className="w-3.5 h-3.5 text-[#94a3b8]" />{p.lead_name}
                  </Link>
                  <p className="text-xs text-[#64748b] pl-5">{p.reasons.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
