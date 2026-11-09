import { fromCents, marginAlertLevel, toCents, type AlertThresholds, type MarginAlert } from "./engine";

/** Ligne lead_financials + infos lead utiles au tableau de bord. */
export interface DashboardRow {
  lead_id: string;
  lead_name: string;
  lead_status: string;
  method_id: string | null;
  calc_status: "calcule" | "en_attente";
  pending_reasons: string[];
  climate_zone: string | null;
  scale_year: number | null;
  scale_validated: boolean | null;
  devis_signed_at: string | null;
  cee_forecast: number | null;
  cee_confirmed: number | null;
  total_cost: number | null;
  revenue: number | null;
  gross_margin: number | null;
  real_cost: number | null;
  real_cost_validated: boolean;
  cee_received: number | null;
  rac_received: number | null;
}

export interface Bucket {
  key: string;
  count: number;
  computed: number;
  revenue: number;
  cost: number;
  margin: number;
  avgMargin: number | null;
  realizedMargin: number;
  realizedCount: number;
}

export interface DashboardSummary {
  count: number;
  computed: number;
  pending: number;
  ceeForecast: number;
  ceeReceived: number;
  forecastCost: number;
  realCost: number;
  forecastMargin: number;
  realizedMargin: number;
  realizedCount: number;
  avgMargin: number | null;
  byZone: Bucket[];
  byYear: Bucket[];
  byMonth: Bucket[];
  alerts: { lead_id: string; lead_name: string; level: MarginAlert; margin: number }[];
  ceeNotConfirmed: { lead_id: string; lead_name: string }[];
  pendingList: { lead_id: string; lead_name: string; reasons: string[] }[];
  unvalidatedScale: number;
}

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Marge réalisée d'un chantier : uniquement avec CEE encaissé ET coût réel validé (jamais de prévisionnel). */
export function realizedMargin(r: Pick<DashboardRow, "real_cost" | "real_cost_validated" | "cee_received" | "rac_received">): number | null {
  const cee = n(r.cee_received);
  const cost = n(r.real_cost);
  if (!r.real_cost_validated || cee === null || cost === null) return null;
  return fromCents(toCents(cee) + toCents(n(r.rac_received) ?? 0) - toCents(cost));
}

function emptyBucket(key: string) {
  return { key, count: 0, computed: 0, revenue: 0, cost: 0, margin: 0, realized: 0, realizedCount: 0 };
}

function finalize(map: Map<string, ReturnType<typeof emptyBucket>>, sort: (a: string, b: string) => number): Bucket[] {
  return [...map.values()]
    .sort((a, b) => sort(a.key, b.key))
    .map((b) => ({
      key: b.key,
      count: b.count,
      computed: b.computed,
      revenue: fromCents(b.revenue),
      cost: fromCents(b.cost),
      margin: fromCents(b.margin),
      avgMargin: b.computed ? Math.round(b.margin / b.computed) / 100 : null,
      realizedMargin: fromCents(b.realized),
      realizedCount: b.realizedCount,
    }));
}

export function aggregateDashboard(rows: DashboardRow[], thresholds: AlertThresholds): DashboardSummary {
  let ceeForecast = 0, ceeReceived = 0, forecastCost = 0, realCost = 0, forecastMargin = 0, realized = 0;
  let computed = 0, realizedCount = 0, unvalidatedScale = 0;
  const byZone = new Map<string, ReturnType<typeof emptyBucket>>();
  const byYear = new Map<string, ReturnType<typeof emptyBucket>>();
  const byMonth = new Map<string, ReturnType<typeof emptyBucket>>();
  const alerts: DashboardSummary["alerts"] = [];
  const ceeNotConfirmed: DashboardSummary["ceeNotConfirmed"] = [];
  const pendingList: DashboardSummary["pendingList"] = [];

  for (const r of rows) {
    const isComputed = r.calc_status === "calcule" && r.gross_margin !== null;
    const rm = realizedMargin(r);
    // Encaissements réels : jamais confondus avec la prime prévisionnelle.
    if (n(r.cee_received) !== null) ceeReceived += toCents(n(r.cee_received)!);
    if (r.real_cost_validated && n(r.real_cost) !== null) realCost += toCents(n(r.real_cost)!);
    if (rm !== null) { realized += toCents(rm); realizedCount++; }

    const keys: [Map<string, ReturnType<typeof emptyBucket>>, string][] = [
      [byZone, r.climate_zone ?? "Non déterminée"],
      [byYear, r.scale_year ? String(r.scale_year) : "Sans barème"],
      [byMonth, r.devis_signed_at ? r.devis_signed_at.slice(0, 7) : "Sans date"],
    ];
    for (const [map, key] of keys) {
      const b = map.get(key) ?? emptyBucket(key);
      b.count++;
      if (isComputed) {
        b.computed++;
        b.revenue += toCents(n(r.revenue) ?? 0);
        b.cost += toCents(n(r.total_cost) ?? 0);
        b.margin += toCents(n(r.gross_margin)!);
      }
      if (rm !== null) { b.realized += toCents(rm); b.realizedCount++; }
      map.set(key, b);
    }

    if (isComputed) {
      computed++;
      ceeForecast += toCents(n(r.cee_forecast) ?? 0);
      forecastCost += toCents(n(r.total_cost) ?? 0);
      forecastMargin += toCents(n(r.gross_margin)!);
      const level = marginAlertLevel(n(r.gross_margin)!, thresholds);
      if (level !== "vert") alerts.push({ lead_id: r.lead_id, lead_name: r.lead_name, level, margin: n(r.gross_margin)! });
      if (r.cee_confirmed === null) ceeNotConfirmed.push({ lead_id: r.lead_id, lead_name: r.lead_name });
      if (r.scale_year !== null && r.scale_validated === false) unvalidatedScale++;
    } else {
      pendingList.push({ lead_id: r.lead_id, lead_name: r.lead_name, reasons: r.pending_reasons });
    }
  }

  alerts.sort((a, b) => a.margin - b.margin);
  const lastSpecial = (special: string) => (a: string, b: string) =>
    a === special ? 1 : b === special ? -1 : a.localeCompare(b);

  return {
    count: rows.length,
    computed,
    pending: rows.length - computed,
    ceeForecast: fromCents(ceeForecast),
    ceeReceived: fromCents(ceeReceived),
    forecastCost: fromCents(forecastCost),
    realCost: fromCents(realCost),
    forecastMargin: fromCents(forecastMargin),
    realizedMargin: fromCents(realized),
    realizedCount,
    avgMargin: computed ? Math.round(forecastMargin / computed) / 100 : null,
    byZone: finalize(byZone, lastSpecial("Non déterminée")),
    byYear: finalize(byYear, lastSpecial("Sans barème")),
    byMonth: finalize(byMonth, lastSpecial("Sans date")),
    alerts,
    ceeNotConfirmed,
    pendingList,
    unvalidatedScale,
  };
}
