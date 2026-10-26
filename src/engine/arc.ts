// Statut Winter Arc (novembre) : jours tenus, série, semaines tenues. Calculs purs sur données réelles.
// Règle produit (affichée dans l'app) : un jour est « tenu » s'il atteint au moins LOCK_HABITS habitudes du défi.
// Jour excusé : ne casse pas la série, ne compte pas comme tenu. Jour non renseigné : pas tenu, jamais inventé.

import { NOVEMBER_2026, dayRange, habitStatus, summarizeWeeks, type ChallengeDef, type DayEntry, type Entries } from './challenge';

export const LOCK_HABITS = 5;

export type ArcDay = 'tenu' | 'excusé' | 'manqué' | 'à venir' | 'aujourd’hui';

export interface ArcStats {
  days: { day: string; state: ArcDay; done: number }[];
  /** Index (0-based) du jour courant dans le défi, -1 avant, length après. */
  todayIndex: number;
  locked: number;
  streak: number;
  weeksHeld: number;
  weeksJudged: number;
}

export function arcStats(entries: Entries, appDays: Set<string>, today: string, def: ChallengeDef = NOVEMBER_2026): ArcStats {
  const all = dayRange(def.start, def.end);
  const doneOf = (e: DayEntry | undefined) => def.daily.filter((h) => habitStatus(h, e) === 'done').length;
  const days = all.map((day) => {
    const e = entries[day];
    const done = doneOf(e);
    let state: ArcDay;
    if (e?.excused) state = 'excusé';
    else if (done >= LOCK_HABITS) state = 'tenu';
    else if (day > today) state = 'à venir';
    else if (day === today) state = 'aujourd’hui';
    else state = 'manqué';
    return { day, state, done };
  });
  const todayIndex = today < def.start ? -1 : today > def.end ? all.length : all.indexOf(today);

  // Série : jours tenus consécutifs en remontant depuis aujourd'hui (aujourd'hui non tenu ne casse pas encore la série).
  let streak = 0;
  for (let i = Math.min(todayIndex, all.length - 1); i >= 0; i--) {
    const st = days[i]!.state;
    if (st === 'tenu') streak++;
    else if (st === 'excusé' || st === 'aujourd’hui') continue;
    else break;
  }

  // Semaines tenues : semaines complètes et passées où salle ≥ objectif et course ≥ objectif.
  const weeks = summarizeWeeks(def, entries, appDays).filter((w) => !w.partial && w.days[w.days.length - 1]! < today);
  const weeksHeld = weeks.filter((w) => def.weekly.every((g) => (w.counts[g.id] ?? 0) >= g.perWeek)).length;

  return { days, todayIndex, locked: days.filter((d) => d.state === 'tenu').length, streak, weeksHeld, weeksJudged: weeks.length };
}
