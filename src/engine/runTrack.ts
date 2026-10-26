// Suivi de course GPS : distance, temps en mouvement, allure, temps par kilomètre.
// Les points imprécis (> 30 m) ou impossibles (> 7 m/s, soit plus de 25 km/h) sont ignorés, jamais lissés en douce.

export interface GpsPoint {
  lat: number;
  lon: number;
  /** ms epoch */
  t: number;
  /** précision en mètres */
  acc: number;
}

export const MAX_ACCURACY_M = 30;
export const MAX_SPEED_MS = 7;

/** Distance en mètres entre deux points (formule de haversine). */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Segment {
  /** Points gardés depuis la dernière reprise (une pause coupe le tracé). */
  points: GpsPoint[];
}

export interface TrackStats {
  meters: number;
  movingMs: number;
  /** secondes par km, moyenne */
  avgPace?: number;
  /** secondes par km sur les ~200 derniers mètres */
  currentPace?: number;
  /** temps (s) de chaque kilomètre terminé */
  splits: number[];
}

/** Ajoute un point s'il est fiable ; renvoie le segment mis à jour. */
export function addPoint(seg: Segment, p: GpsPoint): Segment {
  if (p.acc > MAX_ACCURACY_M) return seg;
  const last = seg.points[seg.points.length - 1];
  if (last) {
    const dt = (p.t - last.t) / 1000;
    if (dt <= 0) return seg;
    if (haversine(last, p) / dt > MAX_SPEED_MS) return seg;
  }
  return { points: [...seg.points, p] };
}

export function stats(segments: Segment[]): TrackStats {
  let meters = 0;
  let movingMs = 0;
  const splits: number[] = [];
  let kmStartMs = 0;
  let nextKm = 1000;
  const tail: { m: number; ms: number }[] = [];
  for (const s of segments) {
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1]!;
      const b = s.points[i]!;
      const d = haversine(a, b);
      const dt = b.t - a.t;
      meters += d;
      movingMs += dt;
      tail.push({ m: d, ms: dt });
      // Passage du km interpolé à l'intérieur du segment (au mètre près, pas au point GPS suivant).
      while (meters >= nextKm - 1e-6) {
        const at = movingMs - dt + (d > 0 ? ((nextKm - (meters - d)) / d) * dt : 0);
        splits.push(Math.round((at - kmStartMs) / 1000));
        kmStartMs = at;
        nextKm += 1000;
      }
    }
  }
  // Allure actuelle : derniers ~200 m.
  let m = 0;
  let ms = 0;
  for (let i = tail.length - 1; i >= 0 && m < 200; i--) {
    m += tail[i]!.m;
    ms += tail[i]!.ms;
  }
  const pace = (meters_: number, ms_: number) => (meters_ >= 50 ? Math.round(ms_ / 1000 / (meters_ / 1000)) : undefined);
  return { meters: Math.round(meters), movingMs, avgPace: pace(meters, movingMs), currentPace: pace(m, ms), splits };
}

export const fmtPace = (sPerKm?: number) => (sPerKm === undefined || !Number.isFinite(sPerKm) ? '—' : `${Math.floor(sPerKm / 60)}:${String(sPerKm % 60).padStart(2, '0')}`);

/** Annonce à faire (demi-tour à mi-distance, objectif atteint, km passé) quand on franchit un seuil. */
export function cue(prevM: number, nowM: number, targetKm?: number, outAndBack = false): string | undefined {
  if (targetKm && outAndBack && prevM < (targetKm * 1000) / 2 && nowM >= (targetKm * 1000) / 2) return 'Demi-tour';
  if (targetKm && prevM < targetKm * 1000 && nowM >= targetKm * 1000) return 'Objectif atteint';
  if (Math.floor(nowM / 1000) > Math.floor(prevM / 1000)) return `${Math.floor(nowM / 1000)} kilomètre${Math.floor(nowM / 1000) > 1 ? 's' : ''}`;
  return undefined;
}
