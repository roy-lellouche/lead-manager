import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRole } from "@/lib/roles";
import type { UserRole } from "@/lib/types";
import {
  CEE_DOCS_BUCKET,
  safeFileName,
  type CeeDocRequest,
  type CeeDocRequestWithUrls,
  type CeeTeleproOption,
} from "@/lib/doc-cee";

export type CeeDocCaller = { userId: string; role: Extract<UserRole, "admin" | "secretaire" | "cee" | "telepro"> };

/**
 * Vérifie que l'appelant est admin, secrétaire, responsable CEE ou télépro.
 * Un télépro n'a accès qu'aux demandes qui lui sont assignées (voir canTeleproAccess).
 */
export async function requireCeeDocStaff(
  getUser: () => Promise<{ id: string } | null>,
  admin: SupabaseClient
): Promise<CeeDocCaller | { error: string; status: number }> {
  const user = await getUser();
  if (!user) return { error: "Non autorisé", status: 401 };
  const { data: profile } = await admin.from("profiles").select("role, deleted_at").eq("id", user.id).single();
  if (!profile || profile.deleted_at) return { error: "Accès refusé", status: 403 };
  const role = normalizeRole(profile.role);
  if (role !== "admin" && role !== "secretaire" && role !== "cee" && role !== "telepro")
    return { error: "Accès refusé", status: 403 };
  return { userId: user.id, role };
}

/** Un télépro ne touche qu'aux demandes qui lui sont assignées. */
export function canAccessRequest(caller: CeeDocCaller, row: { assigned_to: string | null }): boolean {
  return caller.role !== "telepro" || row.assigned_to === caller.userId;
}

/** Télépros actifs, proposés à l'assignation. */
export async function listCeeTelepros(admin: SupabaseClient): Promise<CeeTeleproOption[]> {
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email, role, deleted_at")
    .is("deleted_at", null)
    .order("full_name");
  return (data ?? [])
    .filter((p) => normalizeRole(p.role) === "telepro")
    .map((p) => ({ id: p.id, name: p.full_name || p.email || "Télépro" }));
}

/** Vérifie qu'un identifiant d'assignation désigne bien un télépro actif. */
export async function isValidTeleproId(admin: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("role, deleted_at").eq("id", id).maybeSingle();
  return !!data && !data.deleted_at && normalizeRole(data.role) === "telepro";
}

export function extractFiles(formData: FormData): File[] {
  return formData.getAll("files").filter((v): v is File => v instanceof File && v.size > 0);
}

export async function uploadCeeDocFiles(
  admin: SupabaseClient,
  requestId: string,
  files: File[]
): Promise<{ stored: CeeDocRequest["files"]; error?: string }> {
  const stored: CeeDocRequest["files"] = [];
  for (const file of files) {
    const path = `${requestId}/${randomUUID()}-${safeFileName(file.name)}`;
    const type = file.type || "application/octet-stream";
    const { error } = await admin.storage
      .from(CEE_DOCS_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: type });
    if (error) {
      if (stored.length) await admin.storage.from(CEE_DOCS_BUCKET).remove(stored.map((f) => f.path));
      return { stored: [], error: error.message };
    }
    stored.push({ path, name: file.name.slice(0, 200) || "document", type, size: file.size, uploaded_at: new Date().toISOString() });
  }
  return { stored };
}

/** Ajoute URLs signées (1 h) et nom du demandeur. */
export async function withCeeDocUrls(admin: SupabaseClient, rows: CeeDocRequest[]): Promise<CeeDocRequestWithUrls[]> {
  const allPaths = rows.flatMap((r) => (r.files ?? []).map((f) => f.path));
  const urlByPath = new Map<string, string>();
  if (allPaths.length) {
    const { data } = await admin.storage.from(CEE_DOCS_BUCKET).createSignedUrls(allPaths, 3600);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }
  }
  const creatorIds = [
    ...new Set(rows.flatMap((r) => [r.created_by, r.assigned_to]).filter((v): v is string => !!v)),
  ];
  const nameById = new Map<string, string>();
  if (creatorIds.length) {
    const { data } = await admin.from("profiles").select("id, full_name, email").in("id", creatorIds);
    for (const p of data ?? []) nameById.set(p.id, p.full_name || p.email || "");
  }
  return rows.map((r) => ({
    ...r,
    files: (r.files ?? []).map((f) => ({ ...f, url: urlByPath.get(f.path) ?? "" })),
    created_by_name: r.created_by ? nameById.get(r.created_by) ?? null : null,
    assigned_to_name: r.assigned_to ? nameById.get(r.assigned_to) ?? null : null,
  }));
}
