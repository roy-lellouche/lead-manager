import { NextRequest, NextResponse } from "next/server";
import { createClientFromRequest } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneToE164 } from "@/lib/phone";
import { LEAD_CATEGORIES, type LeadCategory } from "@/lib/types";
import { getUserFromClient } from "@/lib/supabase/session";

// Les candidats sont comparés après normalisation (minuscules, sans accents,
// "_" et "-" remplacés par des espaces). Les exports Meta peuvent contenir
// plusieurs colonnes équivalentes (ex. "numéro_de_téléphone" remplie et
// "phone_number" vide) : on garde toutes les colonnes correspondantes et on
// prend, pour chaque ligne, la première valeur non vide.
const PHONE_COLUMNS = [
  "phone number",
  "phone",
  "telephone",
  "numero de telephone",
  "numero telephone",
  "numero",
  "tel",
  "mobile",
  "portable",
];
const EMAIL_COLUMNS = ["email", "e mail", "mail", "adresse email", "adresse e mail"];
const FIRST_NAME_COLUMNS = ["first name", "prenom"];
const LAST_NAME_COLUMNS = ["last name", "nom", "nom de famille"];
const FULL_NAME_COLUMNS = ["full name", "fullname", "nom complet", "nom et prenom"];
// Correspondance partielle (contient) autorisée seulement pour ces champs.
const PHONE_PARTIAL = ["phone", "telephone"];
const EMAIL_PARTIAL = ["email", "e mail"];

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumns(
  keys: string[],
  candidates: string[],
  partial: string[] = []
): string[] {
  const norm = keys.map((k) => ({ key: k, n: normalizeHeader(k) }));
  const found: string[] = [];
  for (const c of candidates) {
    for (const { key, n } of norm) {
      if (n === c && !found.includes(key)) found.push(key);
    }
  }
  for (const c of partial) {
    for (const { key, n } of norm) {
      if (n.includes(c) && !found.includes(key)) found.push(key);
    }
  }
  return found;
}

function extractValue(row: Record<string, string>, cols: string[]): string {
  for (const col of cols) {
    const val = row[col];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

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

  const body = await request.json();
  const { rows, teleproIds, teleproPercentages, category } = body;

  if (!rows || !Array.isArray(rows) || !teleproIds?.length) {
    return NextResponse.json(
      { error: "Données invalides" },
      { status: 400 }
    );
  }

  const leadCategory: LeadCategory = LEAD_CATEGORIES.includes(category)
    ? category
    : "fenetre";

  const usePercentages =
    teleproPercentages &&
    typeof teleproPercentages === "object" &&
    Object.keys(teleproPercentages).length > 0;

  if (usePercentages) {
    const sum = teleproIds.reduce((s: number, id: string) => {
      const p = teleproPercentages[id];
      const num = typeof p === "number" ? p : parseFloat(String(p ?? ""));
      return s + (isNaN(num) ? 0 : num);
    }, 0);
    const allHavePercentage = teleproIds.every((id: string) => {
      const p = teleproPercentages[id];
      const num = typeof p === "number" ? p : parseFloat(String(p ?? ""));
      return !isNaN(num) && num >= 0 && num <= 100;
    });
    if (!allHavePercentage) {
      return NextResponse.json(
        {
          error:
            "Si vous utilisez les pourcentages, chaque télépro doit avoir un pourcentage renseigné (entre 0 et 100).",
        },
        { status: 400 }
      );
    }
    if (Math.abs(sum - 100) > 0.01) {
      return NextResponse.json(
        {
          error: `La somme des pourcentages doit être exactement 100% (actuellement ${sum.toFixed(1)}%).`,
        },
        { status: 400 }
      );
    }
  }

  const allKeys = Array.from(
    new Set(rows.flatMap((r: Record<string, string>) => Object.keys(r ?? {})))
  ) as string[];
  const phoneCol = findColumns(allKeys, PHONE_COLUMNS, PHONE_PARTIAL);
  const emailCol = findColumns(allKeys, EMAIL_COLUMNS, EMAIL_PARTIAL);
  const firstNameCol = findColumns(allKeys, FIRST_NAME_COLUMNS);
  const lastNameCol = findColumns(allKeys, LAST_NAME_COLUMNS);
  const fullNameCol = findColumns(allKeys, FULL_NAME_COLUMNS);

  if (!phoneCol.length && !firstNameCol.length && !lastNameCol.length && !fullNameCol.length) {
    return NextResponse.json(
      { error: "Colonnes requises non trouvées (prénom, nom, nom complet ou téléphone)" },
      { status: 400 }
    );
  }

  function parseFirstNameLastName(row: Record<string, string>): { firstName: string; lastName: string } {
    const firstName = extractValue(row, firstNameCol);
    const lastName = extractValue(row, lastNameCol);
    if (firstName && lastName) return { firstName, lastName };
    const fullName = extractValue(row, fullNameCol);
    if (fullName) {
      const parts = fullName.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
      }
      if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    }
    return { firstName: "Inconnu", lastName: "Inconnu" };
  }

  const existingPhones = new Set<string>();
  const errors: string[] = [];
  const leadsToInsert: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, string>;
    const phoneRaw = extractValue(row, phoneCol).replace(/\s/g, "").trim() || `row_${i}`;
    const phone = phoneRaw !== `row_${i}` ? (normalizePhoneToE164(phoneRaw) || phoneRaw) : phoneRaw;
    const email = extractValue(row, emailCol);
    const { firstName, lastName } = parseFirstNameLastName(row);
    const firstNameFinal = firstName || "Inconnu";
    const lastNameFinal = lastName || "Inconnu";

    if (!phone || phone === `row_${i}`) {
      errors.push(`Ligne ${i + 2}: téléphone manquant`);
      continue;
    }

    const isDuplicate = existingPhones.has(phone);
    existingPhones.add(phone);

    leadsToInsert.push({
      first_name: firstNameFinal,
      last_name: lastNameFinal,
      phone,
      email: email || null,
      is_duplicate: isDuplicate,
      meta_lead_id: row.id || null,
      status: "nouveau",
      category: leadCategory,
      assigned_to: null,
      imported_at: new Date().toISOString(),
    });
  }

  const totalLeads = leadsToInsert.length;
  const assignmentOrder: string[] = [];

  if (usePercentages && totalLeads > 0) {
    const percentages = teleproIds.map((id: string) => ({
      id,
      pct: (typeof teleproPercentages[id] === "number"
        ? teleproPercentages[id]
        : parseFloat(String(teleproPercentages[id] ?? "0"))
      ) as number,
    }));
    type CountItem = { id: string; target: number; remainder: number };
    const counts: CountItem[] = percentages.map(({ id, pct }: { id: string; pct: number }) => ({
      id,
      target: Math.floor((pct / 100) * totalLeads),
      remainder: (pct / 100) * totalLeads - Math.floor((pct / 100) * totalLeads),
    }));
    let assigned = counts.reduce((s: number, c: CountItem) => s + c.target, 0);
    const byRemainder = [...counts].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < totalLeads - assigned; i++) {
      counts.find((c) => c.id === byRemainder[i].id)!.target += 1;
    }
    for (const { id, target } of counts) {
      for (let k = 0; k < target; k++) assignmentOrder.push(id);
    }
  } else {
    for (let k = 0; k < totalLeads; k++) {
      assignmentOrder.push(teleproIds[k % teleproIds.length]);
    }
  }

  for (let i = 0; i < leadsToInsert.length; i++) {
    (leadsToInsert[i] as Record<string, unknown>).assigned_to =
      assignmentOrder[i] ?? teleproIds[i % teleproIds.length];
  }

  if (leadsToInsert.length > 0) {
    const { data: insertedLeads, error } = await adminClient
      .from("leads")
      .insert(leadsToInsert)
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: error.message, imported: 0, errors: leadsToInsert.length },
        { status: 500 }
      );
    }

    // Log pour chaque lead importé → déclenche le trigger qui définit added_at
    if (insertedLeads?.length && user) {
      const now = new Date().toISOString();
      const logs = insertedLeads.map((lead: { id: string }) => ({
        lead_id: lead.id,
        user_id: user.id,
        action: "Import CSV",
        old_status: null,
        new_status: "nouveau",
        created_at: now,
      }));
      const LOG_BATCH = 100;
      for (let i = 0; i < logs.length; i += LOG_BATCH) {
        await adminClient.from("lead_logs").insert(logs.slice(i, i + LOG_BATCH));
      }
    }
  }

  return NextResponse.json({
    imported: leadsToInsert.length,
    errors: errors.length,
    details: errors.slice(0, 20),
  });
}
