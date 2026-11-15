import { NextRequest, NextResponse } from "next/server";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFromClient, getSessionProfile } from "@/lib/supabase/session";
import { normalizeRole } from "@/lib/roles";

/**
 * Recherche rapide de leads (palette Ctrl+K).
 * - admin / secrétaire : tous les leads
 * - télépro : uniquement ses leads
 * - stockage : aucun lead (pas d'accès aux fiches)
 */
export async function GET(request: NextRequest) {
  const { supabase } = await createClientFromRequest(request);
  const user = await getUserFromClient(supabase);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const raw = (request.nextUrl.searchParams.get("q") ?? "").trim();
  // Les caractères , ( ) ont un sens dans le filtre `or` de PostgREST : on les retire.
  const q = raw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ leads: [] });

  const role = normalizeRole((await getSessionProfile(user.id))?.role);
  if (role === "stockage") return NextResponse.json({ leads: [] });

  const admin = createAdminClient();
  let query = admin
    .from("leads")
    .select("id, first_name, last_name, phone, city, postal_code, status, category")
    .order("created_at", { ascending: false })
    .limit(8);

  if (role !== "admin" && role !== "secretaire") {
    query = query.eq("assigned_to", user.id);
  }

  const words = q.split(" ").filter(Boolean);
  const digits = q.replace(/\D/g, "");
  const looksLikePhone = /^[\d\s.+-]+$/.test(q) && digits.length >= 3;

  if (looksLikePhone) {
    // Le numéro peut être stocké avec ou sans espaces : on essaie les deux formes.
    const spaced = digits.replace(/(\d{2})(?=\d)/g, "$1 ");
    query = query.or(
      [`phone.ilike.%${digits}%`, `phone.ilike.%${spaced}%`, `phone.ilike.%${q}%`, `postal_code.ilike.${digits}%`].join(",")
    );
  } else if (words.length >= 2) {
    // « Jean Dupont » ou « Dupont Jean »
    const [a, b] = words;
    query = query.or(
      `and(first_name.ilike.%${a}%,last_name.ilike.%${b}%),and(first_name.ilike.%${b}%,last_name.ilike.%${a}%)`
    );
  } else {
    const term = `%${q}%`;
    query = query.or(
      [`first_name.ilike.${term}`, `last_name.ilike.${term}`, `email.ilike.${term}`, `city.ilike.${term}`].join(",")
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { leads: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
