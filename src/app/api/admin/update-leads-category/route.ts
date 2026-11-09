import { NextRequest, NextResponse } from "next/server";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { LEAD_CATEGORIES, LEAD_CATEGORY_LABELS, type LeadCategory } from "@/lib/types";
import { getUserFromClient } from "@/lib/supabase/session";

/** Change la catégorie d'une sélection de leads (action de masse depuis la liste admin). */
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

  const role = profile?.role?.toString().trim().toLowerCase();
  if (role !== "admin" && role !== "secretaire") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: { leadIds?: unknown[]; newCategory?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de la requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const validLeadIds = (Array.isArray(body.leadIds) ? body.leadIds : [])
    .map((id: unknown) => String(id ?? "").trim())
    .filter((id) => id.length > 0);

  const category = typeof body.newCategory === "string" ? body.newCategory.trim() : "";

  if (validLeadIds.length === 0) {
    return NextResponse.json({ error: "Aucun lead sélectionné" }, { status: 400 });
  }

  if (!LEAD_CATEGORIES.includes(category as LeadCategory)) {
    return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
  }

  const newLabel = LEAD_CATEGORY_LABELS[category as LeadCategory];
  const BATCH_SIZE = 50;
  const now = new Date().toISOString();

  for (let i = 0; i < validLeadIds.length; i += BATCH_SIZE) {
    const batch = validLeadIds.slice(i, i + BATCH_SIZE);
    const { data: leads } = await adminClient
      .from("leads")
      .select("id, category")
      .in("id", batch);

    const { error } = await adminClient
      .from("leads")
      .update({ category, updated_at: now })
      .in("id", batch);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const logs = (leads || [])
      .filter((l) => l.category !== category)
      .map((l) => ({
        lead_id: l.id,
        user_id: user.id,
        action: `Changement de catégorie (masse) : ${
          LEAD_CATEGORY_LABELS[l.category as LeadCategory] ?? l.category ?? "—"
        } → ${newLabel}`,
      }));
    if (logs.length > 0) {
      await adminClient.from("lead_logs").insert(logs);
    }
  }

  return NextResponse.json({ success: true, count: validLeadIds.length });
}
