import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recalculateLeadFinancials, recalcIfRelevant } from "./server";

/* Fausse base Supabase en mémoire : couvre les appels du module financier. */
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const client = {
    from(table: string) {
      tables[table] ??= [];
      const filters: [string, unknown][] = [];
      let op: "select" | "update" | "insert" = "select";
      let payload: Row | Row[] = {};
      let order: { col: string; asc: boolean } | null = null;
      let limit: number | null = null;
      const rows = () => {
        let r = tables[table].filter((row) => filters.every(([k, v]) => row[k] === v));
        if (order) {
          const { col, asc } = order;
          r = [...r].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
        }
        return limit !== null ? r.slice(0, limit) : r;
      };
      const run = () => {
        if (op === "insert") {
          const list = Array.isArray(payload) ? payload : [payload];
          for (const p of list) tables[table].push({ id: Math.random().toString(36), calculated_at: new Date(Date.now() + tables[table].length).toISOString(), ...p });
          return { data: null, error: null };
        }
        if (op === "update") {
          for (const r of rows()) Object.assign(r, payload);
          return { data: null, error: null };
        }
        return { data: rows(), error: null };
      };
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
        order: (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return b; },
        limit: (n: number) => { limit = n; return b; },
        update: (p: Row) => { op = "update"; payload = p; return b; },
        insert: (p: Row | Row[]) => { op = "insert"; payload = p; return b; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      };
      return b;
    },
  };
  return client as unknown as SupabaseClient;
}

const COSTS = [
  ["pac_materiel", "PAC", "materiel", 2000, 1],
  ["petites_fournitures", "Fournitures", "fournitures", 700, 2],
  ["main_oeuvre", "MO", "main_oeuvre", 700, 3],
  ["frais_dossier_cee", "Dossier", "dossier", 70, 4],
  ["installation_employe", "Installation", "autres", 200, 5],
].map(([code, label, category, amount, display_order]) => ({
  method_id: "pac_atlantic_cee", code, label, category, amount, display_order, active: true,
}));
const SCALES = [
  [2025, "H1", 8400], [2025, "H2", 8400], [2025, "H3", 8400],
  [2026, "H1", 7908], [2026, "H2", 6590], [2026, "H3", 4613],
].map(([y, z, a]) => ({
  id: `s${y}${z}`, method_id: "pac_atlantic_cee", scale_year: y, climate_zone: z, amount: a,
  valid_from: `${y}-01-01`, valid_to: `${y}-12-31`, validated: false,
}));

let tables: Record<string, Row[]>;
let db: SupabaseClient;
const fetchMock = vi.fn();

beforeEach(() => {
  tables = {
    leads: [{ id: "L1", postal_code: "05110", city: "Claret", devis_signed_at: "2026-03-10" }],
    lead_financials: [{ lead_id: "L1", method_id: "pac_atlantic_cee", cost_overrides: {}, other_costs: 0, reste_a_charge: 0, other_revenue: 0, real_cost: 3500, real_cost_validated: true, cee_received: null }],
    economic_methods: [{ id: "pac_atlantic_cee", name: "PAC Atlantic CEE", is_configured: true }],
    method_cost_items: COSTS.map((c) => ({ ...c })),
    cee_scales: SCALES.map((s) => ({ ...s })),
    lead_financial_calculations: [],
  };
  db = fakeDb(tables);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => [
      { nom: "Claret", code: "04058", codeDepartement: "04" },
      { nom: "La Saulce", code: "05162", codeDepartement: "05" },
    ],
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const fin = () => tables.lead_financials[0];

describe("recalcul serveur d'un chantier", () => {
  it("identifie la zone via le code INSEE et calcule la marge 2026 H2", async () => {
    expect((await recalculateLeadFinancials(db, "L1", { trigger: "test", userId: "U" })).ok).toBe(true);
    expect(fin()).toMatchObject({
      calc_status: "calcule", climate_zone: "H2", insee_code: "04058", department_code: "04",
      scale_year: 2026, cee_forecast: 6590, total_cost: 3670, revenue: 6590, gross_margin: 2920, scale_validated: false,
    });
  });

  it("ne modifie jamais le coût réel validé", async () => {
    await recalculateLeadFinancials(db, "L1", { trigger: "test", userId: "U" });
    expect(fin()).toMatchObject({ real_cost: 3500, real_cost_validated: true });
  });

  it("n'ajoute pas de doublon d'historique quand rien ne change", async () => {
    await recalculateLeadFinancials(db, "L1", { trigger: "a", userId: "U" });
    await recalculateLeadFinancials(db, "L1", { trigger: "b", userId: "U" });
    expect(tables.lead_financials).toHaveLength(1);
    expect(tables.lead_financial_calculations).toHaveLength(1);
    // l'adresse n'a pas changé : pas de nouvel appel au service géographique
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("conserve les coûts figés d'un chantier historique après hausse du prix standard", async () => {
    await recalculateLeadFinancials(db, "L1", { trigger: "a", userId: "U" });
    tables.method_cost_items[0].amount = 2150; // PAC passe de 2 000 € à 2 150 €
    await recalculateLeadFinancials(db, "L1", { trigger: "b", userId: "U" });
    expect(fin().total_cost).toBe(3670);

    // Un nouveau chantier applique le nouveau prix
    tables.leads.push({ id: "L2", postal_code: "05110", city: "Claret", devis_signed_at: "2026-03-10" });
    tables.lead_financials.push({ lead_id: "L2", method_id: "pac_atlantic_cee", cost_overrides: {}, other_costs: 0, reste_a_charge: 0, other_revenue: 0 });
    await recalculateLeadFinancials(db, "L2", { trigger: "a", userId: "U" });
    expect(tables.lead_financials[1]).toMatchObject({ total_cost: 3820, gross_margin: 2770 });

    // Réapplication explicite sur l'ancien chantier
    await recalculateLeadFinancials(db, "L1", { trigger: "reset", userId: "U", resetStandardCosts: true });
    expect(fin().total_cost).toBe(3820);
  });

  it("demande confirmation si la commune est ambiguë, puis recalcule quand la date change", async () => {
    tables.leads[0].city = "";
    await recalculateLeadFinancials(db, "L1", { trigger: "a", userId: "U" });
    expect(fin()).toMatchObject({ calc_status: "en_attente", zone_source: "a_confirmer", gross_margin: null });

    // confirmation manuelle (comme le fait l'API) puis passage en 2025
    Object.assign(fin(), { climate_zone: "H1", zone_source: "manuel" });
    tables.leads[0].devis_signed_at = "2025-09-01";
    await recalcIfRelevant(db, "L1", { devis_signed_at: "2025-09-01" }, "U");
    expect(fin()).toMatchObject({ calc_status: "calcule", climate_zone: "H1", scale_year: 2025, gross_margin: 4730 });
  });

  it("affiche « en attente » si le service géographique est indisponible", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    await recalculateLeadFinancials(db, "L1", { trigger: "a", userId: "U" });
    expect(fin()).toMatchObject({ calc_status: "en_attente", climate_zone: null, revenue: null });
  });

  it("ne crée rien pour un lead sans méthode économique", async () => {
    tables.lead_financials = [];
    db = fakeDb(tables);
    await recalcIfRelevant(db, "L1", { postal_code: "75001" }, "U");
    expect(tables.lead_financials).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("méthode 2 : sélection automatique par l'ETAS et TVA", () => {
  const M2_COSTS = [
    ["pac_materiel", "materiel", 3200, "HT"], ["petites_fournitures", "fournitures", 700, "TTC"],
    ["main_oeuvre", "main_oeuvre", 700, "TTC"], ["frais_dossier_cee", "dossier", 70, "HT"], ["installation_employe", "autres", 200, "HT"],
  ].map(([code, category, amount, basis], i) => ({
    method_id: "methode_2", code, label: code, category, amount, amount_basis: basis, vat_rate: 20, vat_recovery_rate: 100,
    display_order: i, active: true,
  }));
  const COND = "Éligibilité CEE du dossier vérifiée";
  const pac = (etas: number | null, validated = true) => ({
    lead_id: "L9", product_id: "P1",
    products: { id: "P1", name: "Atlantic S9", is_pac_atlantic: true, etas, etas_validated: validated },
  });

  beforeEach(() => {
    tables.leads.push({ id: "L9", status: "installe", postal_code: "05110", city: "La Saulce", devis_signed_at: "2026-05-01" });
    tables.economic_methods = [
      { id: "pac_atlantic_cee", name: "PAC Atlantic CEE", is_configured: true, active: true, auto_select: true,
        etas_min_exclusive: null, etas_max_inclusive: 140, eligibility_conditions: [], cee_amount_basis: "HT", cee_vat_share: 50, cee_vat_rate: 20 },
      { id: "methode_2", name: "PAC Atlantic ETAS > 140 %", is_configured: true, active: true, auto_select: true,
        etas_min_exclusive: 140, etas_max_inclusive: null, eligibility_conditions: [COND], cee_amount_basis: "HT", cee_vat_share: 50, cee_vat_rate: 20 },
    ];
    tables.method_cost_items.push(...M2_COSTS);
    tables.cee_scales.push(
      ...[["H1", 9500], ["H2", 7917], ["H3", 5541]].map(([z, a]) => ({
        id: `m2${z}`, method_id: "methode_2", scale_year: 2026, climate_zone: z, amount: a, valid_from: "2026-01-01", valid_to: "2026-12-31", validated: false,
      }))
    );
    tables.lead_materials = [];
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ nom: "La Saulce", code: "05162", codeDepartement: "05" }] });
  });
  const f9 = () => tables.lead_financials.find((r) => r.lead_id === "L9")!;

  it("crée la fiche rentabilité dès qu'une PAC Atlantic est ajoutée, mais attend la confirmation des conditions", async () => {
    tables.lead_materials.push(pac(146));
    await recalculateLeadFinancials(db, "L9", { trigger: "matériel", userId: "U" });
    expect(f9()).toMatchObject({
      method_source: "auto", method_id: null, suggested_method_id: "methode_2", etas_value: 146, calc_status: "en_attente",
    });
    expect(f9().pending_reasons).toEqual([`Condition à confirmer : ${COND}`]);
  });

  it("applique la méthode 2 une fois la condition cochée, avec TVA (zone H1)", async () => {
    tables.lead_materials.push(pac(146));
    await recalculateLeadFinancials(db, "L9", { trigger: "matériel", userId: "U" });
    f9().eligibility_checks = { methode_2: { [COND]: true } };
    await recalculateLeadFinancials(db, "L9", { trigger: "condition", userId: "U" });
    expect(f9()).toMatchObject({
      method_id: "methode_2", calc_status: "calcule", climate_zone: "H1", scale_year: 2026,
      raw_total_cost: 4870, total_cost_ht: 4636.66, total_cost_ttc: 5564, total_cost: 4636.66,
      cee_forecast: 9500, cee_ttc: 10450, revenue: 9500, gross_margin: 4863.34, cash_in_ttc: 10450, cash_out_ttc: 5564,
    });
  });

  it("ne crée rien tant que le client n'est pas au statut Installé", async () => {
    tables.leads.find((l) => l.id === "L9")!.status = "devis_envoye";
    tables.lead_materials.push(pac(146));
    await recalculateLeadFinancials(db, "L9", { trigger: "matériel", userId: "U" });
    expect(tables.lead_financials.find((r) => r.lead_id === "L9")).toBeUndefined();
  });

  it("demande l'ETAS s'il n'est pas validé au catalogue, sans rien inventer", async () => {
    tables.lead_materials.push(pac(146, false));
    await recalculateLeadFinancials(db, "L9", { trigger: "matériel", userId: "U" });
    expect(f9()).toMatchObject({ method_id: null, calc_status: "en_attente", gross_margin: null });
    expect(f9().selection_message).toMatch(/ETAS .* non renseigné ou non validé/);
  });

  it("respecte un choix manuel de méthode", async () => {
    tables.lead_materials.push(pac(130));
    tables.lead_financials.push({ lead_id: "L9", method_id: "methode_2", method_source: "manuel", cost_overrides: {}, other_costs: 0,
      reste_a_charge: 0, other_revenue: 0, eligibility_checks: {} });
    await recalculateLeadFinancials(db, "L9", { trigger: "x", userId: "U" });
    expect(f9()).toMatchObject({ method_id: "methode_2", suggested_method_id: "pac_atlantic_cee" });
    expect(f9().selection_message).toMatch(/choisie à la main/);
  });

  it("change de coûts standards quand la méthode change (pas de mélange)", async () => {
    tables.lead_materials.push(pac(130)); // ETAS ≤ 140 → méthode 1
    await recalculateLeadFinancials(db, "L9", { trigger: "matériel", userId: "U" });
    expect(f9()).toMatchObject({ method_id: "pac_atlantic_cee", total_cost: 3670 });
    (tables.lead_materials[0].products as Record<string, unknown>).etas = 150; // remplacement par une PAC ETAS > 140
    f9().eligibility_checks = { methode_2: { [COND]: true } };
    await recalculateLeadFinancials(db, "L9", { trigger: "matériel", userId: "U" });
    expect(f9()).toMatchObject({ method_id: "methode_2", standard_costs_method_id: "methode_2", total_cost: 4636.66 });
  });
});
