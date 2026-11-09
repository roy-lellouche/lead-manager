import { NextRequest, NextResponse } from "next/server";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFromClient } from "@/lib/supabase/session";
import { recalcIfRelevant } from "@/lib/finance/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase } = await createClientFromRequest(request);
  const user = await getUserFromClient(supabase);

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: lead, error } = await adminClient
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("assigned_to", user.id)
    .single();

  if (error || !lead) {
    return NextResponse.json(
      { error: error?.message || "Lead non trouvé" },
      { status: 404 }
    );
  }

  return NextResponse.json(lead);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase } = await createClientFromRequest(request);
  const user = await getUserFromClient(supabase);

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: lead, error: fetchError } = await adminClient
    .from("leads")
    .select("id, status")
    .eq("id", id)
    .eq("assigned_to", user.id)
    .single();

  if (fetchError || !lead) {
    return NextResponse.json(
      { error: "Lead non trouvé ou non assigné" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const { status, callback_at, nrp_count, logAction, logOldStatus, logNewStatus, ...rest } = body;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (status !== undefined) {
    updates.status = status;
    if (lead && lead.status !== status) {
      updates.status_changed_at = new Date().toISOString();
    }
  }
  if (callback_at !== undefined) updates.callback_at = callback_at;
  if (nrp_count !== undefined) updates.nrp_count = nrp_count;

  const teleproAllowedFields = [
    "first_name", "last_name", "phone", "email", "surface_m2", "revenu_fiscal_ref", "numero_fiscal", "date_of_birth",
    "department", "address", "postal_code", "city", "heating_mode", "radiator_type", "color",
    "is_owner", "installation_type", "electricity_type", "commentaire", "category",
  ];
  for (const key of teleproAllowedFields) {
    if (key in rest) updates[key] = rest[key];
  }

  const { error: updateError } = await adminClient
    .from("leads")
    .update(updates)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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
