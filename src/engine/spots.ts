// Spots autour de toi (chez toi ou en vacances) : parcs pour courir, pistes d'athlétisme, street workout.
// Source : OpenStreetMap via l'API Overpass (gratuite). Position arrondie (~1 km) avant l'envoi.

import { haversine } from './runTrack';

export type SpotKind = 'street workout' | 'piste' | 'parc';

export interface Spot {
  id: string;
  name: string;
  kind: SpotKind;
  lat: number;
  lon: number;
  meters: number;
}

/** Arrondi à 2 décimales (≈ 1 km) : assez pour chercher, pas assez pour te localiser précisément. */
export const coarse = (x: number) => Math.round(x * 100) / 100;

export function overpassQuery(lat: number, lon: number, radiusM: number): string {
  const a = `(around:${Math.round(radiusM)},${coarse(lat)},${coarse(lon)})`;
  return `[out:json][timeout:20];(
nwr${a}["leisure"="fitness_station"];
nwr${a}["sport"="calisthenics"];
nwr${a}["leisure"="track"]["sport"~"running|athletics"];
nwr${a}["leisure"="park"]["name"];
);out center 80;`;
}

interface OsmEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const kindOf = (t: Record<string, string>): SpotKind | undefined =>
  t.leisure === 'fitness_station' || t.sport === 'calisthenics' ? 'street workout' : t.leisure === 'track' ? 'piste' : t.leisure === 'park' ? 'parc' : undefined;

/** Résultat Overpass → spots triés par distance (depuis ta vraie position, calculée sur le téléphone). */
export function parseSpots(json: { elements?: OsmEl[] }, from: { lat: number; lon: number }): Spot[] {
  const out: Spot[] = [];
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {};
    const kind = kindOf(t);
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!kind || lat === undefined || lon === undefined) continue;
    const name = t.name ?? (kind === 'street workout' ? 'Street workout' : kind === 'piste' ? 'Piste d’athlétisme' : 'Parc');
    out.push({ id: `${e.type}/${e.id}`, name, kind, lat, lon, meters: Math.round(haversine(from, { lat, lon })) });
  }
  // Plusieurs agrès d'un même parc = un seul spot (même nom à moins de 150 m).
  const dedup = out.sort((a, b) => a.meters - b.meters).filter((s, i, arr) => !arr.slice(0, i).some((x) => x.kind === s.kind && x.name === s.name && haversine(x, s) < 150));
  return dedup;
}

/** Plan B (Photon / Komoot, OpenStreetMap) : parcs nommés autour de toi, quand Overpass est saturé. */
export function photonUrl(lat: number, lon: number): string {
  return `https://photon.komoot.io/api/?q=park&osm_tag=leisure:park&lat=${coarse(lat)}&lon=${coarse(lon)}&limit=20&location_bias_scale=0.2`;
}

export function parsePhoton(json: { features?: { geometry: { coordinates: [number, number] }; properties: { osm_type?: string; osm_id?: number; name?: string } }[] }, from: { lat: number; lon: number }, maxM = 6000): Spot[] {
  return (json.features ?? [])
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      return { id: `${f.properties.osm_type ?? 'x'}/${f.properties.osm_id ?? `${lat},${lon}`}`, name: f.properties.name ?? 'Parc', kind: 'parc' as const, lat, lon, meters: Math.round(haversine(from, { lat, lon })) };
    })
    .filter((s) => s.meters <= maxM)
    .sort((a, b) => a.meters - b.meters);
}
