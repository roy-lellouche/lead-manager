import { describe, expect, it } from "vitest";
import { aggregateDashboard, realizedMargin, type DashboardRow } from "./dashboard";
import { DEFAULT_ALERT_THRESHOLDS } from "./engine";

const row = (p: Partial<DashboardRow>): DashboardRow => ({
  lead_id: Math.random().toString(36),
  lead_name: "Client",
  lead_status: "valide",
  method_id: "pac_atlantic_cee",
  calc_status: "calcule",
  pending_reasons: [],
  climate_zone: "H1",
  scale_year: 2026,
  scale_validated: true,
  devis_signed_at: "2026-02-10",
  cee_forecast: 7908,
  cee_confirmed: null,
  total_cost: 3670,
  revenue: 7908,
  gross_margin: 4238,
  real_cost: null,
  real_cost_validated: false,
  cee_received: null,
  rac_received: null,
  ...p,
});

describe("tableau de bord financier", () => {
  const rows = [
    row({}),
    row({ climate_zone: "H3", cee_forecast: 4613, revenue: 4613, gross_margin: 943, devis_signed_at: "2026-03-02" }),
    row({ climate_zone: "H2", scale_year: 2025, cee_forecast: 8400, revenue: 8400, gross_margin: 4730, devis_signed_at: "2025-11-20",
      cee_confirmed: 8400, cee_received: 8400, real_cost: 3900, real_cost_validated: true }),
    row({ calc_status: "en_attente", pending_reasons: ["Date de signature du devis manquante"], climate_zone: null, scale_year: null,
      devis_signed_at: null, cee_forecast: null, revenue: null, gross_margin: null }),
  ];
  const s = aggregateDashboard(rows, DEFAULT_ALERT_THRESHOLDS);

  it("totalise uniquement les chantiers calculés en prévisionnel", () => {
    expect(s.count).toBe(4);
    expect(s.computed).toBe(3);
    expect(s.pending).toBe(1);
    expect(s.ceeForecast).toBe(7908 + 4613 + 8400);
    expect(s.forecastCost).toBe(3670 * 3);
    expect(s.forecastMargin).toBe(4238 + 943 + 4730);
    expect(s.avgMargin).toBe(Math.round(((4238 + 943 + 4730) / 3) * 100) / 100);
  });

  it("ne compte jamais une prime prévisionnelle comme encaissée", () => {
    expect(s.ceeReceived).toBe(8400);
    expect(s.realCost).toBe(3900);
    expect(s.realizedMargin).toBe(4500);
    expect(s.realizedCount).toBe(1);
  });

  it("ventile par zone, année de barème et mois", () => {
    expect(s.byZone.map((b) => b.key)).toEqual(["H1", "H2", "H3", "Non déterminée"]);
    expect(s.byYear.find((b) => b.key === "2026")?.margin).toBe(4238 + 943);
    expect(s.byMonth.map((b) => b.key)).toEqual(["2025-11", "2026-02", "2026-03", "Sans date"]);
  });

  it("remonte les alertes et les CEE non confirmés", () => {
    expect(s.alerts).toEqual([expect.objectContaining({ level: "rouge", margin: 943 })]);
    expect(s.ceeNotConfirmed).toHaveLength(2);
    expect(s.pendingList).toHaveLength(1);
  });

  it("marge réalisée : exige un coût réel validé et un CEE encaissé", () => {
    expect(realizedMargin({ real_cost: 3000, real_cost_validated: false, cee_received: 8000, rac_received: null })).toBeNull();
    expect(realizedMargin({ real_cost: 3000, real_cost_validated: true, cee_received: null, rac_received: null })).toBeNull();
    expect(realizedMargin({ real_cost: 3000.1, real_cost_validated: true, cee_received: 8000, rac_received: 200.2 })).toBe(5200.1);
  });
});
