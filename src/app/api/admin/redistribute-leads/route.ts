import { NextRequest, NextResponse } from "next/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRole } from "@/lib/roles";
import {
  isExcludedFromRedistribution,
  parisEndOfDayIso,
  parseRedistributionLimit,
  planRedistribution,
  type RedistributionCandidate,
} from "@/lib/redistribution";

/**
 * Redistribution des leads (admin uniquement).
 *
 * Corps : { limit, maxDate (YYYY-MM-DD), sourceTeleproIds?, targetTeleproIds?, dryRun? }
 * - Pour chaque télépro source : ses `limit` derniers leads NRP reçus au plus tard le `maxDate`.
 * - Le lot est mélangé puis réparti entre les télépros cibles, jamais vers un télépro
 *   qui a déjà eu le lead.
 * - dryRun : renvoie l'aperçu sans rien modifier.
 */
export async function POST(request: NextRequest) {
  const { supabase } = await createClientFromRequest(request);
  const user = await getUserFromClient(supabase);

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (normalizeRole(profile?.role) !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: {
    limit?: unknown;
    maxDate?: unknown;
    sourceTeleproIds?: unknown;
    targetTeleproIds?: unknown;
    dryRun?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de la requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const limit = parseRedistributionLimit(body.limit);
  if (limit == null) {
    return NextResponse.json({ error: "Nombre de leads par télépro invalide" }, { status: 400 });
  }

  const maxDate = typeof body.maxDate === "string" ? body.maxDate : "";
  const maxDateIso = parisEndOfDayIso(maxDate);
  if (!maxDateIso) {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }

  const dryRun = body.dryRun === true;

  const { data: telepros, error: teleprosError } = await adminClient
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "telepro")
    .is("deleted_at", null)
    .order("full_name");

  if (teleprosError) {
    return NextResponse.json({ error: teleprosError.message }, { status: 500 });
  }

  // Les télépros exclus ne sont ni sources ni destinataires, quoi qu'envoie le client.
  const eligibleTelepros = (telepros || []).filter((t) => !isExcludedFromRedistribution(t.email));
  const activeIds = new Set(eligibleTelepros.map((t) => t.id));
  const pickIds = (raw: unknown): string[] => {
    // Absent = tous les télépros actifs. Les identifiants inconnus ou supprimés sont ignorés.
    if (!Array.isArray(raw)) return [...activeIds];
    return [...new Set(raw.map((id) => String(id ?? "").trim()))].filter((id) => activeIds.has(id));
  };
  const sourceIds = pickIds(body.sourceTeleproIds);
  const targetIds = pickIds(body.targetTeleproIds);

  if (sourceIds.length === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins un télépro source" }, { status: 400 });
  }
  if (targetIds.length === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins un télépro destinataire" }, { status: 400 });
  }

  // Les X derniers NRP de chaque télépro source. « Dernier » = date à laquelle le
  // télépro a reçu le lead (date d'ajout telle qu'il la voit).
  const perSource = await Promise.all(
    sourceIds.map((teleproId) =>
      adminClient
        .from("leads")
        .select("id, assigned_to")
        .eq("assigned_to", teleproId)
        .eq("status", "nrp")
        .lte("telepro_added_at", maxDateIso)
        .order("telepro_added_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit)
    )
  );

  const failed = perSource.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const pool = perSource.flatMap((r) => (r.data || []) as { id: string; assigned_to: string }[]);

  // Historique : tous les télépros qui ont déjà eu chacun de ces leads.
  const past = new Map<string, Set<string>>(pool.map((l) => [l.id, new Set([l.assigned_to])]));
  const HISTORY_BATCH = 200;
  for (let i = 0; i < pool.length; i += HISTORY_BATCH) {
    const ids = pool.slice(i, i + HISTORY_BATCH).map((l) => l.id);
    const { data: history, error } = await adminClient
      .from("lead_distributions")
      .select("lead_id, from_telepro, to_telepro")
      .in("lead_id", ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const h of history || []) {
      const set = past.get(h.lead_id);
      if (!set) continue;
      if (h.from_telepro) set.add(h.from_telepro);
      if (h.to_telepro) set.add(h.to_telepro);
    }
  }

  const candidates: RedistributionCandidate[] = pool.map((l) => ({
    id: l.id,
    currentTelepro: l.assigned_to,
    pastTelepros: past.get(l.id) ?? new Set([l.assigned_to]),
  }));

  const plan = planRedistribution(candidates, targetIds);

  const names = new Map(eligibleTelepros.map((t) => [t.id, t.full_name || t.email]));
  const countBy = (ids: string[]) => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  };
  const sourceCounts = countBy(pool.map((l) => l.assigned_to));
  const targetCounts = countBy(plan.assignments.map((a) => a.to));

  const summary = {
    poolCount: pool.length,
    assignableCount: plan.assignments.length,
    unassignedCount: plan.unassigned.length,
    bySource: sourceIds.map((id) => ({ id, name: names.get(id) ?? id, count: sourceCounts.get(id) ?? 0 })),
    byTarget: targetIds.map((id) => ({ id, name: names.get(id) ?? id, count: targetCounts.get(id) ?? 0 })),
  };

  if (dryRun || plan.assignments.length === 0) {
    return NextResponse.json({ ...summary, applied: false, appliedCount: 0 });
  }

  const { data: result, error: rpcError } = await adminClient.rpc("apply_lead_redistribution", {
    p_created_by: user.id,
    p_filters: { limit, maxDate, sourceTeleproIds: sourceIds, targetTeleproIds: targetIds },
    p_assignments: plan.assignments.map((a) => ({
      lead_id: a.leadId,
      from_telepro: a.from,
      to_telepro: a.to,
    })),
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const row = Array.isArray(result) ? result[0] : result;

  return NextResponse.json({
    ...summary,
    applied: true,
    appliedCount: row?.applied_count ?? 0,
    redistributionId: row?.redistribution_id ?? null,
  });
}
