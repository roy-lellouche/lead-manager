/**
 * Altitude d'un point via le service d'altimétrie de l'IGN (Géoplateforme),
 * la même source que Géoportail (RGE ALTI®). Gratuit et sans clé.
 * La valeur -99999 signifie « hors couverture » : on la traduit en null.
 */
const IGN_ALTI_URL = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";

export async function fetchAltitude(lat: number, lng: number): Promise<number | null> {
  const url = `${IGN_ALTI_URL}?lon=${lng}&lat=${lat}&resource=ign_rge_alti_wld&zonly=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`IGN altimétrie : HTTP ${res.status}`);
  const json = (await res.json()) as { elevations?: (number | { z?: number })[] };
  const first = json.elevations?.[0];
  const z = typeof first === "number" ? first : first?.z;
  if (typeof z !== "number" || !Number.isFinite(z) || z <= -99999) return null;
  return Math.round(z * 10) / 10;
}

/** Lien vers Géoportail centré sur le point (vue satellite). */
export function geoportailUrl(lat: number, lng: number): string {
  return `https://www.geoportail.gouv.fr/carte?c=${lng},${lat}&z=18&l0=ORTHOIMAGERY.ORTHOPHOTOS::GEOPORTAIL:OGC:WMTS(1)&l1=ELEVATION.SLOPES::GEOPORTAIL:OGC:WMTS(0.5)&permalink=yes`;
}
