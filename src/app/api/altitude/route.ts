import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/session";
import { geocodeAddress } from "@/lib/geocode";
import { fetchAltitude } from "@/lib/altitude";

/**
 * GET /api/altitude?lat=..&lng=..[&label=..]  ou  GET /api/altitude?q=<adresse>
 * Renvoie l'altitude IGN (m) du point, en géocodant l'adresse si besoin.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  let lat = Number(params.get("lat"));
  let lng = Number(params.get("lng"));
  let label = (params.get("label") ?? "").trim().slice(0, 200);
  const hasCoords = params.has("lat") && params.has("lng") && Number.isFinite(lat) && Number.isFinite(lng);

  if (!hasCoords) {
    const q = (params.get("q") ?? "").trim().slice(0, 200);
    if (q.length < 3) return NextResponse.json({ error: "Adresse trop courte" }, { status: 400 });
    const found = await geocodeAddress(q);
    if (!found) return NextResponse.json({ error: "Adresse introuvable" }, { status: 404 });
    ({ lat, lng, label } = found);
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Coordonnées invalides" }, { status: 400 });
  }

  try {
    const altitude = await fetchAltitude(lat, lng);
    return NextResponse.json({ label, lat, lng, altitude });
  } catch (err) {
    console.error("[altitude] service IGN en échec", err);
    return NextResponse.json({ error: "Service d'altitude IGN indisponible, réessayez." }, { status: 502 });
  }
}
