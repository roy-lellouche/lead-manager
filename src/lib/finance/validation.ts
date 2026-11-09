import { isIsoDate, CLIMATE_ZONES, type ClimateZone } from "./engine";

/** Montant optionnel ≥ 0 : undefined = non fourni, null = effacé. Lève une erreur lisible sinon. */
export function parseAmount(value: unknown, label: string, opts: { nullable?: boolean } = {}): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") {
    if (opts.nullable) return null;
    return 0;
  }
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`${label} : montant invalide`);
  if (n < 0) throw new Error(`${label} : le montant ne peut pas être négatif`);
  if (n > 10_000_000) throw new Error(`${label} : montant trop élevé`);
  return Math.round(n * 100) / 100;
}

export function parseDate(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!isIsoDate(value)) throw new Error(`${label} : date invalide (AAAA-MM-JJ)`);
  return value;
}

export function parseZone(value: unknown): ClimateZone {
  if (typeof value === "string" && (CLIMATE_ZONES as string[]).includes(value)) return value as ClimateZone;
  throw new Error("Zone climatique invalide (H1, H2 ou H3)");
}
