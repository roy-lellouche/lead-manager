import { NextRequest, NextResponse } from "next/server";
import {
  loadAlertThresholds,
  loadMethodConfig,
  recalculateLeadFinancials,
} from "@/lib/finance/server";
import { requireRole } from "@/lib/finance/auth";
import { parseAmount, parseDate, parseZone } from "@/lib/finance/validation";
import type { SupabaseClient } from "@supabase/supabase-js";

async function buildPayload(admin: SupabaseClient, leadId: string) {
  const [{ data: lead }, { data: fin }, { data: methods }, thresholds, { data: history }] = await Promise.all([
    admin.from("leads").select("id, postal_code, city, devis_signed_at, installation_type").eq("id", leadId).maybeSingle(),
    admin.from("lead_financials").select("*").eq("lead_id", leadId).maybeSingle(),
    admin
      .from("economic_methods")
      .select("id, name, description, is_configured, active, auto_select, eligibility_conditions, cee_amount_basis, cee_vat_share, cee_vat_rate")
      .order("display_order"),
    loadAlertThresholds(admin),
    admin
      .from("lead_financial_calculations")
      .select("id, calculated_at, trigger, snapshot, profile:profiles!calculated_by(full_name)")
      .eq("lead_id", leadId)
      .order("calculated_at", { ascending: false })
      .limit(10),
  ]);
  let currentCosts: { code: string; amount: number }[] = [];
  if (fin?.method_id) {
    const cfg = await loadMethodConfig(admin, fin.method_id);
    currentCosts = cfg.costs.map((c) => ({ code: c.code, amount: c.amount }));
  }
  return { lead, financials: fin, methods: methods || [], thresholds, history: history || [], currentCosts };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ["admin", "secretaire"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const payload = await buildPayload(auth.admin, id);
  if (!payload.lead) return NextResponse.json({ error: "Lead introuvable" }, { status: 404 });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ["admin", "secretaire"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const admin = auth.admin;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const { data: lead } = await admin.from("leads").select("id").eq("id", id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead introuvable" }, { status: 404 });
  const { data: fin } = await admin.from("lead_financials").select("*").eq("lead_id", id).maybeSingle();

  const changes: Record<string, unknown> = {};
  const changed: string[] = [];
  let resetStandardCosts = false;
  const now = new Date().toISOString();

  try {
    // Retour à la sélection automatique (d'après l'ETAS de la PAC Atlantic)
    if (body.method_auto === true) {
      changes.method_source = "auto";
      changed.push("méthode : sélection automatique");
    }

    // Conditions d'éligibilité cochées sur la fiche
    if (body.eligibility_check && typeof body.eligibility_check === "object") {
      const ec = body.eligibility_check as { method_id?: unknown; condition?: unknown; value?: unknown };
      const mid = String(ec.method_id || "");
      const cond = String(ec.condition || "");
      const { data: m } = await admin.from("economic_methods").select("eligibility_conditions").eq("id", mid).maybeSingle();
      const list = (m?.eligibility_conditions || []) as string[];
      if (!list.includes(cond)) throw new Error("Condition inconnue pour cette méthode");
      const checks = { ...((fin?.eligibility_checks || {}) as Record<string, Record<string, boolean>>) };
      checks[mid] = { ...(checks[mid] || {}), [cond]: ec.value === true };
      changes.eligibility_checks = checks;
      changed.push(`${ec.value === true ? "condition confirmée" : "condition retirée"} : ${cond}`);
    }

    if (body.recalculate === true) {
      if (auth.role !== "admin") return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
      changed.push("recalcul manuel (administrateur)");
    }

    // Méthode économique (choix manuel)
    if ("method_id" in body && body.method_auto !== true) {
      const methodId = body.method_id ? String(body.method_id) : null;
      if (methodId) {
        const { data: m } = await admin.from("economic_methods").select("id, active").eq("id", methodId).maybeSingle();
        if (!m || !m.active) throw new Error("Méthode économique inconnue ou inactive");
      }
      if ((fin?.method_id ?? null) !== methodId || fin?.method_source !== "manuel") {
        changes.method_id = methodId;
        changes.method_source = "manuel";
        changed.push("méthode (choix manuel)");
        // Changement de méthode : les coûts standards de la nouvelle méthode s'appliquent.
        if (fin?.method_id && methodId) {
          resetStandardCosts = true;
          changes.cost_overrides = {};
        }
        if (!methodId) {
          Object.assign(changes, {
            calc_status: "en_attente", pending_reasons: ["Aucune méthode économique sélectionnée"],
            revenue: null, gross_margin: null, margin_rate: null, cee_forecast: null,
          });
        }
      }
    }

    // Date de signature du devis (stockée sur la fiche lead)
    const devisDate = parseDate(body.devis_signed_at, "Date de signature du devis");
    if (devisDate !== undefined) {
      const { error } = await admin.from("leads").update({ devis_signed_at: devisDate, updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      changed.push("date de signature du devis");
    }

    // Zone : confirmation manuelle ou retour à la détection automatique
    if (body.zone_auto === true) {
      Object.assign(changes, { zone_source: null, climate_zone: null, zone_postal_code: null, zone_city: null });
      changed.push("zone (détection automatique)");
    } else if (body.climate_zone !== undefined) {
      const zone = parseZone(body.climate_zone);
      const insee = typeof body.insee_code === "string" ? body.insee_code : null;
      const candidates = (fin?.zone_candidates || []) as { insee_code: string; department_code: string }[];
      const cand = insee ? candidates.find((c) => c.insee_code === insee) : null;
      Object.assign(changes, {
        climate_zone: zone,
        zone_source: "manuel",
        zone_message: null,
        insee_code: cand?.insee_code ?? null,
        department_code: cand?.department_code ?? null,
      });
      changed.push("zone climatique");
    }

    // Coûts spécifiques au chantier
    if (body.cost_overrides !== undefined) {
      if (typeof body.cost_overrides !== "object" || body.cost_overrides === null) throw new Error("Coûts spécifiques invalides");
      const clean: Record<string, number> = {};
      for (const [code, v] of Object.entries(body.cost_overrides as Record<string, unknown>)) {
        const n = parseAmount(v, `Coût « ${code} »`, { nullable: true });
        if (typeof n === "number") clean[code] = n;
      }
      changes.cost_overrides = clean;
      changed.push("coût spécifique");
    }
    const simple: [string, string, boolean][] = [
      ["other_costs", "autres coûts", false],
      ["cee_confirmed", "montant CEE confirmé", true],
      ["reste_a_charge", "reste à charge", false],
      ["other_revenue", "autres recettes", false],
      ["cee_received", "CEE encaissé", true],
      ["rac_received", "reste à charge encaissé", true],
    ];
    for (const [key, label, nullable] of simple) {
      const v = parseAmount(body[key], label, { nullable });
      if (v !== undefined) {
        changes[key] = v;
        changed.push(label);
      }
    }

    // Coût réel : jamais écrasé silencieusement une fois validé
    const realCost = parseAmount(body.real_cost, "Coût réel", { nullable: true });
    const wasValidated = !!fin?.real_cost_validated;
    const unvalidate = body.real_cost_validated === false;
    if (realCost !== undefined && wasValidated && !unvalidate && Number(fin?.real_cost) !== realCost) {
      return NextResponse.json(
        { error: "Le coût réel est validé : retirez la validation avant de le modifier." },
        { status: 409 }
      );
    }
    if (realCost !== undefined) {
      changes.real_cost = realCost;
      changed.push("coût réel");
    }
    if (typeof body.real_cost_validated === "boolean" && body.real_cost_validated !== wasValidated) {
      const cost = realCost !== undefined ? realCost : fin?.real_cost;
      if (body.real_cost_validated && (cost === null || cost === undefined))
        throw new Error("Renseignez le coût réel avant de le valider");
      Object.assign(changes, {
        real_cost_validated: body.real_cost_validated,
        real_cost_validated_at: body.real_cost_validated ? now : null,
        real_cost_validated_by: body.real_cost_validated ? auth.userId : null,
      });
      changed.push(body.real_cost_validated ? "validation du coût réel" : "retrait de validation du coût réel");
    }

    if (body.reset_standard_costs === true) {
      if (auth.role !== "admin") return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
      resetStandardCosts = true;
      changed.push("coûts standards réappliqués");
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  if (!fin) {
    // Pas encore de fiche rentabilité : on n'en crée une que lorsqu'une méthode est choisie
    // (ou que la sélection automatique est demandée).
    if (!changes.method_id && changes.method_source !== "auto") {
      // La date peut avoir changé : la sélection automatique (PAC sur la fiche) en dépend.
      await recalculateLeadFinancials(admin, id, { trigger: changed.join(", ") || "fiche", userId: auth.userId });
      return NextResponse.json(await buildPayload(admin, id));
    }
    const { error } = await admin.from("lead_financials").insert({ lead_id: id, ...changes });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (Object.keys(changes).length > 0) {
    const { error } = await admin.from("lead_financials").update({ ...changes, updated_at: now }).eq("lead_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const r = await recalculateLeadFinancials(admin, id, {
    trigger: changed.length ? changed.join(", ") : "recalcul manuel",
    userId: auth.userId,
    resetStandardCosts,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });

  return NextResponse.json(await buildPayload(admin, id));
}
