import { NextRequest, NextResponse } from "next/server";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFromClient } from "@/lib/supabase/session";
import { recalcIfRelevant } from "@/lib/finance/server";

/** En-tête requis pour éviter les anciens clients en boucle (sans ce header = 403). */
const CLIENT_VERSION_HEADER = "x-lead-form-version";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (request.headers.get(CLIENT_VERSION_HEADER) !== "2") {
    return NextResponse.json(
      { error: "Client obsolète. Merci de rafraîchir la page (F5)." },
      { status: 403 }
    );
  }
  const { id } = await params;
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

  const body = await request.json();
  const { status, logAction, logOldStatus, logNewStatus, ...rest } = body;
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    updated_at: now,
  };

  if (status !== undefined) {
    updates.status = status;
    const { data: currentLead } = await adminClient
      .from("leads")
      .select("status")
      .eq("id", id)
      .single();
    if (currentLead && currentLead.status !== status) {
      updates.status_changed_at = now;
    }
  }
  if (body.callback_at !== undefined) updates.callback_at = body.callback_at;
  if (body.nrp_count !== undefined) updates.nrp_count = body.nrp_count;

  const allowedFields = [
    "first_name", "last_name", "phone", "email", "status", "callback_at", "nrp_count",
    "surface_m2", "revenu_fiscal_ref", "numero_fiscal", "date_of_birth", "department", "address", "postal_code", "city",
    "heating_mode", "radiator_type", "color",
    "is_owner", "installation_type", "electricity_type", "commentaire",
    "doc_status", "is_installe", "is_depot_mpr",
    "is_cee_paye", "is_mpe_paye", "is_ssc_cee", "is_pac_cee", "installation_cost", "material_cost",
    "is_code_envoye", "is_depose", "is_controle_veritas",
    "is_paye", "is_compte_bloque", "is_rejete",
    "material_cost_comment", "regie_cost", "benefit_cee", "benefit_mpr",
    "benefit_apporteur_affaires", "profitability", "chantier_comment", "delegataire_group",
    "installateur", "category",
  ];

  for (const key of allowedFields) {
    if (key in rest) updates[key] = rest[key];
  }

  const { error } = await adminClient
    .from("leads")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Rentabilité : recalcul automatique si la commune / l'installation a changé.
  await recalcIfRelevant(adminClient, id, updates, user.id);

  if (logAction) {
    await adminClient.from("lead_logs").insert({
      lead_id: id,
      user_id: user.id,
      action: logAction,
      old_status: logOldStatus ?? null,
      new_status: logNewStatus ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}
