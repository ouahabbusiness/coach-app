// Moment de la journée pour l'ambiance visuelle et le rappel de coucher.
// Basé sur les heures de coucher/lever déclarées ; valeurs par défaut purement visuelles.

export type DayPhase = 'matin' | 'jour' | 'soir' | 'nuit';

const DEFAULT_BED = 23 * 60;
const DEFAULT_WAKE = 7 * 60;
/** Le mode nuit commence 1 h avant le coucher (règle d'affichage, pas une recommandation). */
export const NIGHT_LEAD_MIN = 60;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Vrai si `t` est dans l'intervalle [start, end) qui peut passer minuit. */
function within(t: number, start: number, end: number): boolean {
  return start <= end ? t >= start && t < end : t >= start || t < end;
}

export function phaseAt(minuteOfDay: number, bedtime?: string, wake?: string): DayPhase {
  const bed = bedtime ? toMin(bedtime) : DEFAULT_BED;
  const up = wake ? toMin(wake) : DEFAULT_WAKE;
  const nightStart = (bed - NIGHT_LEAD_MIN + 1440) % 1440;
  if (within(minuteOfDay, nightStart, up)) return 'nuit';
  if (within(minuteOfDay, up, 11 * 60)) return 'matin';
  if (within(minuteOfDay, 11 * 60, 17 * 60)) return 'jour';
  return 'soir';
}

/**
 * Rappel de coucher : seulement si l'utilisateur a déclaré son heure de coucher
 * et qu'il est passé cette heure (avant le lever).
 */
export function pastBedtime(minuteOfDay: number, bedtime?: string, wake?: string): boolean {
  if (!bedtime || !wake) return false;
  return within(minuteOfDay, toMin(bedtime), toMin(wake));
}
