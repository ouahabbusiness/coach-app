// Données du jour déclarées par l'utilisateur (lues sur sa montre ou estimées par lui).
// La version web n'a pas accès à Apple Santé : tout est « déclaré », jamais présenté comme mesuré par l'app.

export interface DailyMetrics {
  sleepH?: number;
  steps?: number;
  waterMl?: number;
  /** Calories actives affichées par la montre. Jamais converties en « crédit » alimentaire. */
  activeKcal?: number;
  /** Pas du tapis de marche (affichés par le tapis), en plus de la montre qui les compte mal mains posées. */
  treadmillSteps?: number;
  /** « separe » (défaut) : pas hors tapis + tapis ; « total » : total du jour, tapis et courses éventuellement compris. */
  stepsMode?: 'separe' | 'total';
  /** Mode total : ce que le total comprend déjà, pour ne rien compter deux fois. */
  stepsIncludes?: ('tapis' | 'courses')[];
  /** Pas mesurés (montre, tapis) ou estimés. Absent : déclaré. */
  stepsMeasured?: boolean;
  /** Journée terminée : le bilan d'activité n'est plus « partiel ». */
  dayFinal?: boolean;
  /** Pages lues ce jour, calculées depuis le journal de lecture. */
  readPages?: number;
  updatedAt: number;
}

/** Total de pas du jour : en mode total, le tapis n'est jamais ajouté une seconde fois. */
export function dayStepsTotal(d?: DailyMetrics): number {
  if (!d) return 0;
  return d.stepsMode === 'total' ? (d.steps ?? 0) : (d.steps ?? 0) + (d.treadmillSteps ?? 0);
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
  if (daily?.steps !== undefined || daily?.treadmillSteps !== undefined) v.steps = dayStepsTotal(daily);
  // Lecture : coche automatique à partir de 10 pages notées ; ne décoche jamais une case cochée à la main.
  if ((daily?.readPages ?? 0) >= 10) v.read = true;
  return v;
}

/** Jours restants jusqu'à une date AAAA-MM-JJ (négatif si dépassée). */
export function daysUntil(today: string, target: string): number {
  return Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}
