import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodeAddress } from "@/lib/geocode";
import {
  DEPOT,
  TEAMS,
  compareInstallations,
  estimateRoute,
  type KmDay,
  type KmTeamWeek,
  type TeamInstallation,
} from "@/lib/equipe";

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving/";

type Point = { lat: number; lng: number };

/** Itinéraire routier (OSRM, gratuit, sans clé) ; null si indisponible. */
async function osrmRoute(points: Point[]): Promise<{ km: number; minutes: number } | null> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  try {
    const res = await fetch(`${OSRM_URL}${coords}?overview=false`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { code?: string; routes?: { distance: number; duration: number }[] };
    const r = json.code === "Ok" ? json.routes?.[0] : undefined;
    return r ? { km: r.distance / 1000, minutes: r.duration / 60 } : null;
  } catch {
    return null;
  }
}

/**
 * Coordonnées des installations : réutilise celles déjà enregistrées si
 * l'adresse n'a pas changé, sinon géocode et mémorise en base.
 */
async function ensureCoordinates(admin: SupabaseClient, items: TeamInstallation[]): Promise<Map<string, Point>> {
  const out = new Map<string, Point>();
  const toGeocode = items.filter((it) => {
    const addr = it.address?.trim();
    if (!addr) return false;
    if (it.lat != null && it.lng != null && it.geocoded_address === addr) {
      out.set(it.id, { lat: it.lat, lng: it.lng });
      return false;
    }
    return true;
  });

  // Une même adresse n'est géocodée qu'une fois.
  const byAddress = new Map<string, Promise<Point | null>>();
  await Promise.all(
    toGeocode.map(async (it) => {
      const addr = it.address!.trim();
      if (!byAddress.has(addr)) {
        byAddress.set(
          addr,
          geocodeAddress(addr)
            .then((g) => (g ? { lat: g.lat, lng: g.lng } : null))
            .catch(() => null)
        );
      }
      const p = await byAddress.get(addr)!;
      if (!p) return;
      out.set(it.id, p);
      await admin
        .from("team_installations")
        .update({ lat: p.lat, lng: p.lng, geocoded_address: addr })
        .eq("id", it.id);
    })
  );
  return out;
}

/**
 * Kilométrage de la semaine par équipe : chaque jour, départ de Cormeilles,
 * RDV dans l'ordre des heures, puis retour à Cormeilles après le dernier RDV.
 */
export async function computeWeekKm(admin: SupabaseClient, from: string, to: string): Promise<KmTeamWeek[]> {
  const { data } = await admin
    .from("team_installations")
    .select("*")
    .gte("install_date", from)
    .lte("install_date", to);
  const items = ((data ?? []) as TeamInstallation[]).sort(compareInstallations);
  const coords = await ensureCoordinates(admin, items);

  const groups = new Map<string, TeamInstallation[]>();
  for (const it of items) {
    const k = `${it.team}|${it.install_date}`;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }

  const dayResults = await Promise.all(
    [...groups.entries()].map(async ([key, list]): Promise<{ team: number; day: KmDay }> => {
      const [team, day] = key.split("|");
      const stops = list.map((it) => ({
        id: it.id,
        client_name: it.client_name,
        address: it.address,
        start_time: it.start_time,
        located: coords.has(it.id),
      }));
      const points = list.flatMap((it) => (coords.has(it.id) ? [coords.get(it.id)!] : []));
      if (!points.length) return { team: Number(team), day: { day, km: 0, minutes: 0, stops, estimated: false } };

      const loop = [DEPOT, ...points, DEPOT];
      const route = await osrmRoute(loop);
      const r = route ?? estimateRoute(loop);
      return { team: Number(team), day: { day, km: r.km, minutes: r.minutes, stops, estimated: !route } };
    })
  );

  return TEAMS.map((t) => {
    const days = dayResults
      .filter((d) => d.team === t.id)
      .map((d) => d.day)
      .sort((a, b) => (a.day < b.day ? -1 : 1));
    return {
      team: t.id,
      km: days.reduce((s, d) => s + d.km, 0),
      minutes: days.reduce((s, d) => s + d.minutes, 0),
      missing: days.reduce((s, d) => s + d.stops.filter((x) => !x.located).length, 0),
      days,
    };
  });
}
