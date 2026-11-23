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
  files: CeeDocFile[];
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CeeDocFileWithUrl extends CeeDocFile {
  url: string;
}

export interface CeeDocRequestWithUrls extends Omit<CeeDocRequest, "files"> {
  files: CeeDocFileWithUrl[];
  created_by_name: string | null;
}

/** Vert dès que le secrétariat a déposé au moins un document, rouge sinon. */
export function isCeeDocComplete(r: Pick<CeeDocRequest, "files">): boolean {
  return (r.files ?? []).length > 0;
}

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
  return { value: out };
}

/** Nom de fichier sûr pour le chemin de stockage (l'original est conservé à part). */
export function safeFileName(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(-100);
  return cleaned || "document";
}
