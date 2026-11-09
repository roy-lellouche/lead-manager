export const SAV_PROBLEM_TYPES = [
  "Panne totale",
  "Panne partielle",
  "Fuite",
  "Bruit",
  "Défaut installation",
  "Défaut matériel",
  "Problème électrique",
  "Problème hydraulique",
  "Problème frigorifique",
  "Mauvais réglage",
  "Performance insuffisante",
  "Erreur machine",
  "Pièce défectueuse",
  "Client à former",
  "Contrôle non conforme",
  "Réserve chantier",
  "Autre",
] as const;

export const SAV_STATUSES = ["a_traiter", "resolu", "a_reprogrammer", "absent"] as const;
export type SavStatus = (typeof SAV_STATUSES)[number];

export const SAV_STATUS_LABELS: Record<SavStatus, string> = {
  a_traiter: "À traiter",
  resolu: "Résolu",
  a_reprogrammer: "À reprogrammer",
  absent: "Absent",
};

/** Un SAV passé en « Résolu » est archivé : il quitte la liste et la carte des SAV en cours. */
export const SAV_ARCHIVED_STATUS: SavStatus = "resolu";
export const SAV_ACTIVE_STATUSES = SAV_STATUSES.filter((s) => s !== SAV_ARCHIVED_STATUS);

export function isSavArchived(item: { status: SavStatus }): boolean {
  return item.status === SAV_ARCHIVED_STATUS;
}

/** Couleurs partagées par les badges de la liste et les points de la carte. */
export const SAV_STATUS_COLORS: Record<SavStatus, string> = {
  a_traiter: "#4f46e5",
  resolu: "#16a34a",
  a_reprogrammer: "#f59e0b",
  absent: "#dc2626",
};

export const SAV_MAX_PHOTOS = 8;
export const SAV_MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const SAV_PHOTOS_BUCKET = "sav-photos";
export const SAV_PUBLIC_PATH = "/demande-sav";

export interface SavRequest {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  problem_type: string;
  description: string;
  photos: string[];
  status: SavStatus;
  rescheduled_at: string | null;
  source: "client" | "interne";
  created_at: string;
  updated_at: string;
}

/** SavRequest enrichi des URLs signées de ses photos (même ordre que `photos`). */
export interface SavRequestWithUrls extends SavRequest {
  photo_urls: string[];
}

export interface SavInput {
  name: string;
  phone: string;
  email: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  problem_type: string;
  description: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseCoord(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Valide et normalise les champs du formulaire. Tout est obligatoire sauf l'email. */
export function parseSavInput(
  raw: Record<string, unknown>
): { ok: true; data: SavInput } | { ok: false; error: string } {
  const name = clean(raw.name);
  const phone = clean(raw.phone);
  const email = clean(raw.email);
  const address = clean(raw.address);
  const problemType = clean(raw.problem_type);
  const description = clean(raw.description);

  if (!name) return { ok: false, error: "Le nom est obligatoire." };
  if (phone.replace(/\D/g, "").length < 9) return { ok: false, error: "Le numéro de téléphone est invalide." };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "L'adresse email est invalide." };
  if (!address) return { ok: false, error: "L'adresse de l'intervention est obligatoire." };
  if (!(SAV_PROBLEM_TYPES as readonly string[]).includes(problemType))
    return { ok: false, error: "Le type de problème est obligatoire." };
  if (!description) return { ok: false, error: "La description du problème est obligatoire." };

  return {
    ok: true,
    data: {
      name: name.slice(0, 200),
      phone: phone.slice(0, 30),
      email: email ? email.slice(0, 200) : null,
      address: address.slice(0, 500),
      lat: parseCoord(raw.lat, -90, 90),
      lng: parseCoord(raw.lng, -180, 180),
      problem_type: problemType,
      description: description.slice(0, 5000),
    },
  };
}

export function isSavStatus(value: unknown): value is SavStatus {
  return typeof value === "string" && (SAV_STATUSES as readonly string[]).includes(value);
}
