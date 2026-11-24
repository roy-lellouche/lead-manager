/** Onglet DOC CEE : demandes de documents du responsable CEE au secrétariat. */

export const CEE_DOCS_BUCKET = "cee-docs";
export const CEE_DOC_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const CEE_DOC_MAX_FILES = 20;

export const CEE_MANDATAIRES = [
  "omega",
  "house",
  "ace",
  "drapo",
  "homelior",
  "hellio",
  "synerciel",
] as const;

export type CeeMandataire = (typeof CEE_MANDATAIRES)[number];

export const CEE_MANDATAIRE_LABELS: Record<CeeMandataire, string> = {
  omega: "Oméga",
  house: "House",
  ace: "Ace",
  drapo: "Drapo",
  homelior: "Homelior",
  hellio: "Hellio",
  synerciel: "Synerciel",
};

export interface CeeDocFile {
  path: string;
  name: string;
  type: string;
  size: number;
  uploaded_at: string;
}

export interface CeeDocRequest {
  id: string;
  mandataire: CeeMandataire;
  client_name: string;
  document: string;
  request_comment: string | null;
  response_comment: string | null;
  telepro_comment: string | null;
  assigned_to: string | null;
  files: CeeDocFile[];
  created_by: string | null;
  /** Dossier marqué complet par le secrétariat ou le télépro (vert). */
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CeeDocFileWithUrl extends CeeDocFile {
  url: string;
}

export interface CeeDocRequestWithUrls extends Omit<CeeDocRequest, "files"> {
  files: CeeDocFileWithUrl[];
  created_by_name: string | null;
  assigned_to_name: string | null;
  completed_by_name: string | null;
}

export interface CeeTeleproOption {
  id: string;
  name: string;
}

export type CeeDocStatus = "incomplet" | "depose" | "complet";

/**
 * Rouge : rien de déposé. Orange : document(s) déposé(s), dossier pas encore
 * validé. Vert : marqué complet par le secrétariat ou le télépro.
 */
export function ceeDocStatus(r: Pick<CeeDocRequest, "files" | "completed_at">): CeeDocStatus {
  if (r.completed_at) return "complet";
  return (r.files ?? []).length > 0 ? "depose" : "incomplet";
}

export function isCeeDocComplete(r: Pick<CeeDocRequest, "files" | "completed_at">): boolean {
  return ceeDocStatus(r) === "complet";
}

/** Destinataire de l'email « dossier complet ». */
export const CEE_DOC_NOTIFY_EMAIL_DEFAULT = "rsecocee@gmail.com";

export function isCeeMandataire(v: unknown): v is CeeMandataire {
  return typeof v === "string" && (CEE_MANDATAIRES as readonly string[]).includes(v);
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

export type CeeDocInput = {
  mandataire: CeeMandataire;
  client_name: string;
  document: string;
  request_comment: string | null;
  assigned_to: string | null;
};

export function parseCeeDocInput(body: unknown): { value: CeeDocInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isCeeMandataire(b.mandataire)) return { error: "Mandataire invalide." };
  const client_name = cleanText(b.client_name, 200);
  if (!client_name) return { error: "Le nom du client / dossier est requis." };
  const document = cleanText(b.document, 300);
  if (!document) return { error: "Le document demandé est requis." };
  return {
    value: {
      mandataire: b.mandataire,
      client_name,
      document,
      request_comment: cleanText(b.request_comment, 2000),
      assigned_to: cleanText(b.assigned_to, 64),
    },
  };
}

/** Champs modifiables après création (tous optionnels). */
export function parseCeeDocPatch(body: unknown): { value: Record<string, string | null> } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  if ("mandataire" in b) {
    if (!isCeeMandataire(b.mandataire)) return { error: "Mandataire invalide." };
    out.mandataire = b.mandataire;
  }
  if ("client_name" in b) {
    const v = cleanText(b.client_name, 200);
    if (!v) return { error: "Le nom du client / dossier est requis." };
    out.client_name = v;
  }
  if ("document" in b) {
    const v = cleanText(b.document, 300);
    if (!v) return { error: "Le document demandé est requis." };
    out.document = v;
  }
  if ("request_comment" in b) out.request_comment = cleanText(b.request_comment, 2000);
  if ("response_comment" in b) out.response_comment = cleanText(b.response_comment, 2000);
  if ("telepro_comment" in b) out.telepro_comment = cleanText(b.telepro_comment, 2000);
  if ("assigned_to" in b) out.assigned_to = cleanText(b.assigned_to, 64);
  return { value: out };
}

/** Nom de fichier sûr pour le chemin de stockage (l'original est conservé à part). */
export function safeFileName(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(-100);
  return cleaned || "document";
}
