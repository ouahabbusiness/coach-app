// Suivi du poids : journal de pesées et tendance. Calculs purs, aucune estimation inventée.

export type WeightStatus = 'mesuré' | 'estimé';

export interface WeighIn {
  id: string;
  /** Jour local AAAA-MM-JJ. */
  day: string;
  kg: number;
  status: WeightStatus;
  /** Instant de saisie (UTC ms). */
  at: number;
}

/** Une pesée par jour : la dernière saisie du jour fait foi (les précédentes restent dans le journal brut). */
export function dailyWeights(log: WeighIn[]): WeighIn[] {
  const byDay = new Map<string, WeighIn>();
  for (const w of log) {
    const prev = byDay.get(w.day);
    if (!prev || w.at >= prev.at) byDay.set(w.day, w);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

const dayNum = (d: string) => Date.parse(`${d}T12:00:00Z`) / 86_400_000;

/** Moyenne des pesées des 7 jours se terminant à `day` (inclus). Undefined s'il n'y a aucune pesée. */
export function average7(days: WeighIn[], day: string): { kg: number; count: number } | undefined {
  const end = dayNum(day);
  const window = days.filter((w) => dayNum(w.day) <= end && dayNum(w.day) > end - 7);
  if (window.length === 0) return undefined;
  return { kg: window.reduce((s, w) => s + w.kg, 0) / window.length, count: window.length };
}

export type TrendStatus = 'baisse' | 'stable' | 'hausse' | 'données insuffisantes';

/**
 * Tendance sur 2 semaines : compare la moyenne des 7 derniers jours à celle des 7 jours d'avant.
 * Exige au moins 3 pesées dans chaque semaine ; sinon « données insuffisantes ».
 * Seuil de stabilité : ±0,2 kg (règle produit d'affichage, pas une norme physiologique).
 */
export const STABLE_KG = 0.2;

export function trend(days: WeighIn[], today: string): { status: TrendStatus; deltaKg?: number } {
  const now = average7(days, today);
  const prevEnd = new Date((dayNum(today) - 7) * 86_400_000).toISOString().slice(0, 10);
  const before = average7(days, prevEnd);
  if (!now || !before || now.count < 3 || before.count < 3) return { status: 'données insuffisantes' };
  const delta = Math.round((now.kg - before.kg) * 10) / 10;
  if (Math.abs(delta) <= STABLE_KG) return { status: 'stable', deltaKg: delta };
  return { status: delta < 0 ? 'baisse' : 'hausse', deltaKg: delta };
}

export function isValidKg(kg: number): boolean {
  return Number.isFinite(kg) && kg >= 25 && kg <= 350;
}
