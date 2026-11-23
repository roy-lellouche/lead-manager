import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRole } from "@/lib/roles";
import {
  CEE_DOCS_BUCKET,
  safeFileName,
  type CeeDocRequest,
  type CeeDocRequestWithUrls,
} from "@/lib/doc-cee";

/** Vérifie que l'appelant est admin, secrétaire ou responsable CEE. */
export async function requireCeeDocStaff(
  getUser: () => Promise<{ id: string } | null>,
  admin: SupabaseClient
): Promise<{ userId: string } | { error: string; status: number }> {
  const user = await getUser();
  if (!user) return { error: "Non autorisé", status: 401 };
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const role = normalizeRole(profile?.role);
  if (role !== "admin" && role !== "secretaire" && role !== "cee") return { error: "Accès refusé", status: 403 };
  return { userId: user.id };
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
  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v))];
  const nameById = new Map<string, string>();
  if (creatorIds.length) {
    const { data } = await admin.from("profiles").select("id, full_name, email").in("id", creatorIds);
    for (const p of data ?? []) nameById.set(p.id, p.full_name || p.email || "");
  }
  return rows.map((r) => ({
    ...r,
    files: (r.files ?? []).map((f) => ({ ...f, url: urlByPath.get(f.path) ?? "" })),
    created_by_name: r.created_by ? nameById.get(r.created_by) ?? null : null,
  }));
}
