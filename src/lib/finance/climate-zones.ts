import type { ClimateZone } from "./engine";

/**
 * Zones climatiques CEE par département (métropole).
 *
 * Source réglementaire : annexe « zones climatiques » des fiches d'opérations
 * standardisées CEE (ex. BAR-TH-171, BAR-TH-104), qui définissent la zone
 * H1/H2/H3 au niveau du DÉPARTEMENT de la commune d'installation.
 *
 * Le département n'est jamais déduit des deux premiers chiffres du code postal :
 * il vient du code INSEE de la commune (API officielle geo.api.gouv.fr), car un
 * code postal peut couvrir plusieurs communes de départements différents
 * (ex. 05110 couvre des communes des Alpes-de-Haute-Provence (04, H2) et des
 * Hautes-Alpes (05, H1)) et la Corse utilise 2A/2B.
 */
const H1 = [
  "01", "02", "03", "05", "08", "10", "14", "15", "19", "21", "23", "25", "27", "28", "38", "39",
  "42", "43", "45", "51", "52", "54", "55", "57", "58", "59", "60", "61", "62", "63", "67", "68",
  "69", "70", "71", "73", "74", "75", "76", "77", "78", "80", "87", "88", "89", "90", "91", "92",
  "93", "94", "95",
];
const H2 = [
  "04", "07", "09", "12", "16", "17", "18", "22", "24", "26", "29", "31", "32", "33", "35", "36",
  "37", "40", "41", "44", "46", "47", "48", "49", "50", "53", "56", "64", "65", "72", "79", "81",
  "82", "84", "85", "86",
];
const H3 = ["06", "11", "13", "2A", "2B", "30", "34", "66", "83"];

export const DEPARTMENT_CLIMATE_ZONES: Readonly<Record<string, ClimateZone>> = Object.freeze({
  ...Object.fromEntries(H1.map((d) => [d, "H1" as const])),
  ...Object.fromEntries(H2.map((d) => [d, "H2" as const])),
  ...Object.fromEntries(H3.map((d) => [d, "H3" as const])),
});

export function zoneForDepartment(code: string | null | undefined): ClimateZone | null {
  if (!code) return null;
  return DEPARTMENT_CLIMATE_ZONES[code.toUpperCase()] ?? null;
}

/** Commune renvoyée par geo.api.gouv.fr (/communes?codePostal=…). */
export interface Commune {
  nom: string;
  code: string; // code INSEE
  codeDepartement: string;
}

export interface ZoneCandidate {
  insee_code: string;
  commune: string;
  department_code: string;
  zone: ClimateZone | null;
}

export type ZoneResolution =
  | { status: "ok"; zone: ClimateZone; insee_code: string | null; department_code: string; commune: string | null }
  | { status: "ambigu"; candidates: ZoneCandidate[] }
  | { status: "introuvable"; reason: string };

/** Normalise un nom de commune pour comparaison (accents, tirets, « St » → « Saint »…). */
export function normalizeCommuneName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-'’]/g, " ")
    .replace(/\bste\b/g, "sainte")
    .replace(/\bst\b/g, "saint")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Détermine la zone à partir des communes d'un code postal et du nom de la ville.
 * - Une seule commune correspond → sa zone.
 * - Plusieurs communes mais toutes dans la même zone → zone sûre (INSEE si la ville correspond).
 * - Zones différentes et ville non identifiable → « ambigu » : confirmation demandée.
 */
export function resolveZoneFromCommunes(communes: Commune[], city: string | null | undefined): ZoneResolution {
  if (communes.length === 0) return { status: "introuvable", reason: "Code postal inconnu" };

  const candidates: ZoneCandidate[] = communes.map((c) => ({
    insee_code: c.code,
    commune: c.nom,
    department_code: c.codeDepartement,
    zone: zoneForDepartment(c.codeDepartement),
  }));

  const target = city ? normalizeCommuneName(city) : "";
  const byCity = target ? candidates.filter((c) => normalizeCommuneName(c.commune) === target) : [];
  const pick = byCity.length === 1 ? byCity[0] : candidates.length === 1 ? candidates[0] : null;

  if (pick) {
    if (!pick.zone)
      return {
        status: "introuvable",
        reason: `Département ${pick.department_code} hors zones H1/H2/H3 (outre-mer)`,
      };
    return {
      status: "ok",
      zone: pick.zone,
      insee_code: pick.insee_code,
      department_code: pick.department_code,
      commune: pick.commune,
    };
  }

  const zones = new Set(candidates.map((c) => c.zone));
  if (zones.size === 1 && !zones.has(null)) {
    const depts = new Set(candidates.map((c) => c.department_code));
    return {
      status: "ok",
      zone: candidates[0].zone as ClimateZone,
      insee_code: null,
      department_code: depts.size === 1 ? candidates[0].department_code : candidates.map((c) => c.department_code).join("/"),
      commune: null,
    };
  }

  return { status: "ambigu", candidates };
}
