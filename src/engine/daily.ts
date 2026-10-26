// Données du jour déclarées par l'utilisateur (lues sur sa montre ou estimées par lui).
// La version web n'a pas accès à Apple Santé : tout est « déclaré », jamais présenté comme mesuré par l'app.

export interface DailyMetrics {
  sleepH?: number;
  steps?: number;
  waterMl?: number;
  /** Calories actives affichées par la montre. Jamais converties en « crédit » alimentaire. */
  activeKcal?: number;
  /** Pages lues ce jour, calculées depuis le journal de lecture. */
  readPages?: number;
  updatedAt: number;
}

export const dailyKey = (day: string) => `daily.${day}`;

export function addWater(m: DailyMetrics | undefined, deltaMl: number, at: number): DailyMetrics {
  const next = Math.max(0, (m?.waterMl ?? 0) + deltaMl);
  return { ...(m ?? {}), waterMl: next, updatedAt: at };
}

/**
 * Valeurs du défi pour un jour : le sommeil et les pas viennent des données du jour
 * (une seule saisie pour toute l'app) ; le reste vient des cases du défi.
 */
export function challengeValues(
  entryValues: Record<string, boolean | number> | undefined,
  daily: DailyMetrics | undefined,
): Record<string, boolean | number> {
  const v = { ...(entryValues ?? {}) };
  if (daily?.sleepH !== undefined) v.sleep = daily.sleepH;
  if (daily?.steps !== undefined) v.steps = daily.steps;
  // Lecture : coche automatique à partir de 10 pages notées ; ne décoche jamais une case cochée à la main.
  if ((daily?.readPages ?? 0) >= 10) v.read = true;
  return v;
}

/** Jours restants jusqu'à une date AAAA-MM-JJ (négatif si dépassée). */
export function daysUntil(today: string, target: string): number {
  return Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}
