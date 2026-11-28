/** Onglet « Équipe » : planning hebdomadaire des équipes de pose. */

export const TEAMS = [
  { id: 1, name: "Darius" },
  { id: 2, name: "Sacha" },
  { id: 3, name: "Slavic" },
  { id: 4, name: "Yehouda" },
] as const;

export type TeamId = (typeof TEAMS)[number]["id"];

export const STOCK_STATUSES = ["stock", "a_commander", "commande"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  stock: "Pris du stock",
  a_commander: "À commander",
  commande: "Commandé",
};

export interface TeamInstallation {
  id: string;
  team: TeamId;
  install_date: string; // yyyy-MM-dd
  client_name: string;
  address: string | null;
  phone: string | null;
  notes: string | null;
  product_id: string | null;
  product_label: string | null;
  quantity: number;
  stock_status: StockStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockProductOption {
  id: string;
  name: string;
  type_name: string | null;
  quantity: number;
}

export type TeamInstallationInput = Pick<
  TeamInstallation,
  | "team"
  | "install_date"
  | "client_name"
  | "address"
  | "phone"
  | "notes"
  | "product_id"
  | "product_label"
  | "quantity"
  | "stock_status"
>;

function optText(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTeamInstallationInput(
  body: unknown
): { value: TeamInstallationInput } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Requête invalide." };
  const b = body as Record<string, unknown>;

  const team = Number(b.team);
  if (!TEAMS.some((t) => t.id === team)) return { error: "Équipe invalide." };

  const install_date = typeof b.install_date === "string" ? b.install_date : "";
  if (!DATE_RE.test(install_date) || Number.isNaN(Date.parse(install_date)))
    return { error: "Date invalide." };

  const client_name = optText(b.client_name, 200);
  if (!client_name) return { error: "Le nom du client est requis." };

  const product_id = typeof b.product_id === "string" && UUID_RE.test(b.product_id) ? b.product_id : null;
  const product_label = optText(b.product_label, 200);

  const quantity = Number(b.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
    return { error: "Quantité invalide." };

  const stock_status = (STOCK_STATUSES as readonly string[]).includes(b.stock_status as string)
    ? (b.stock_status as StockStatus)
    : "stock";

  if (stock_status === "stock" && !product_id)
    return { error: "Choisissez une pompe à chaleur du stockage, ou marquez-la « à commander »." };

  return {
    value: {
      team: team as TeamId,
      install_date,
      client_name,
      address: optText(b.address, 500),
      phone: optText(b.phone, 50),
      notes: optText(b.notes),
      product_id,
      product_label,
      quantity,
      stock_status,
    },
  };
}

type Reservation = Pick<TeamInstallation, "product_id" | "quantity" | "stock_status">;

/**
 * Variation de stock par produit pour passer de `before` à `after`
 * (null = créneau inexistant). Négatif = à retirer du stock.
 * Seuls les créneaux « pris du stock » réservent du matériel.
 */
export function stockDeltas(before: Reservation | null, after: Reservation | null): Map<string, number> {
  const deltas = new Map<string, number>();
  const add = (r: Reservation | null, sign: 1 | -1) => {
    if (!r || r.stock_status !== "stock" || !r.product_id) return;
    deltas.set(r.product_id, (deltas.get(r.product_id) ?? 0) + sign * r.quantity);
  };
  add(before, 1); // on rend ce qui était réservé
  add(after, -1); // on retire ce qui est réservé désormais
  for (const [k, v] of deltas) if (v === 0) deltas.delete(k);
  return deltas;
}

/** Lundi (yyyy-MM-dd) de la semaine contenant `d`, en date locale. */
export function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (r.getDay() + 6) % 7; // 0 = lundi
  r.setDate(r.getDate() - day);
  return r;
}

export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function teamName(id: number): string {
  return TEAMS.find((t) => t.id === id)?.name ?? `Équipe ${id}`;
}

/* ---------- Documents et note par jour / équipe ---------- */

export const EQUIPE_DOCS_BUCKET = "equipe-docs";
export const EQUIPE_DOC_MAX_BYTES = 50 * 1024 * 1024;

export interface TeamDayFile {
  id: string;
  team: TeamId;
  day: string;
  path: string;
  name: string;
  type: string;
  size: number;
  uploaded_by: string | null;
  created_at: string;
  url?: string;
}

export interface TeamDayDocs {
  team: TeamId;
  day: string;
  note: string;
  files: TeamDayFile[];
}

/** Résumé affiché dans la grille (badge trombone). */
export interface TeamDaySummary {
  team: TeamId;
  day: string;
  files: number;
  hasNote: boolean;
  note: string;
}

export function parseTeamDay(team: unknown, day: unknown): { team: TeamId; day: string } | null {
  const t = Number(team);
  if (!TEAMS.some((x) => x.id === t)) return null;
  if (typeof day !== "string" || !DATE_RE.test(day) || Number.isNaN(Date.parse(day))) return null;
  return { team: t as TeamId, day };
}

/** Le chemin d'un fichier doit appartenir au dossier de son équipe / jour. */
export function teamDayPrefix(team: TeamId, day: string): string {
  return `equipe-${team}/${day}/`;
}

export function summarizeTeamDays(
  files: Pick<TeamDayFile, "team" | "day">[],
  notes: { team: number; day: string; note: string }[]
): TeamDaySummary[] {
  const map = new Map<string, TeamDaySummary>();
  const get = (team: number, day: string) => {
    const k = `${team}|${day}`;
    let s = map.get(k);
    if (!s) map.set(k, (s = { team: team as TeamId, day, files: 0, hasNote: false, note: "" }));
    return s;
  };
  for (const f of files) get(f.team, f.day).files++;
  for (const n of notes)
    if (n.note.trim()) {
      const s = get(n.team, n.day);
      s.hasNote = true;
      s.note = n.note;
    }
  return [...map.values()];
}
