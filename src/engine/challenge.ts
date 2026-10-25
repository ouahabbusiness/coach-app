// Défi mensuel (habitudes quotidiennes + objectifs hebdomadaires). Calculs purs.
// Règle : une journée sans saisie est « non renseignée », jamais « ratée ».

export type HabitKind = 'check' | 'number';

export interface DailyHabit {
  id: string;
  label: string;
  kind: HabitKind;
  unit?: string;
  /** Pour kind 'number' : valeur minimale pour considérer l'habitude tenue. */
  min?: number;
  hint?: string;
}

export interface WeeklyGoal {
  id: string;
  label: string;
  perWeek: number;
}

export interface ChallengeDef {
  id: string;
  title: string;
  /** AAAA-MM-JJ inclus, jours locaux. */
  start: string;
  end: string;
  daily: DailyHabit[];
  weekly: WeeklyGoal[];
  source: string;
}

export interface DayEntry {
  /** Valeurs déclarées par habitude ou objectif hebdo (true = fait ce jour-là). */
  values: Record<string, boolean | number>;
  /** Jour excusé (maladie, blessure, repos prescrit) : rien n'est compté comme manqué. */
  excused?: boolean;
  updatedAt: number;
}

export type Entries = Record<string, DayEntry>;

export type HabitStatus = 'done' | 'not_done' | 'unknown' | 'excused';

export const NOVEMBER_2026: ChallengeDef = {
  id: 'november-2026',
  title: 'Défi de novembre',
  start: '2026-11-01',
  end: '2026-11-30',
  source: 'Liste « November challenge » partagée par Hmidou (publication Instagram). Ce n’est pas un programme validé.',
  daily: [
    { id: 'water_only', label: 'Uniquement de l’eau', kind: 'check' },
    { id: 'no_junk', label: 'Pas de malbouffe', kind: 'check', hint: 'Tu définis toi-même ce que tu comptes comme malbouffe.' },
    { id: 'sleep', label: 'Sommeil 7–8 h', kind: 'number', unit: 'h', min: 7, hint: 'Durée déclarée.' },
    { id: 'steps', label: '10 000 pas', kind: 'number', unit: 'pas', min: 10000, hint: 'Valeur déclarée (lue sur ta montre), pas importée.' },
    { id: 'journal', label: 'Journal', kind: 'check' },
    { id: 'read', label: 'Lire 10 pages', kind: 'check' },
  ],
  weekly: [
    { id: 'gym', label: 'Salle / muscu', perWeek: 4 },
    { id: 'run', label: 'Course', perWeek: 3 },
  ],
};

export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function habitStatus(habit: DailyHabit, entry: DayEntry | undefined): HabitStatus {
  if (entry?.excused) return 'excused';
  const v = entry?.values[habit.id];
  if (v === undefined) return 'unknown';
  if (habit.kind === 'check') return v === true ? 'done' : 'not_done';
  return typeof v === 'number' && v >= (habit.min ?? 0) ? 'done' : 'not_done';
}

export interface HabitSummary {
  id: string;
  done: number;
  notDone: number;
  unknown: number;
  excused: number;
}

/** Bilan des habitudes jusqu'à `today` inclus (les jours futurs ne comptent pas). */
export function summarizeHabits(def: ChallengeDef, entries: Entries, today: string): HabitSummary[] {
  const days = dayRange(def.start, def.end).filter((d) => d <= today);
  return def.daily.map((h) => {
    const s: HabitSummary = { id: h.id, done: 0, notDone: 0, unknown: 0, excused: 0 };
    for (const d of days) {
      const st = habitStatus(h, entries[d]);
      if (st === 'done') s.done++;
      else if (st === 'not_done') s.notDone++;
      else if (st === 'excused') s.excused++;
      else s.unknown++;
    }
    return s;
  });
}

/** Lundi (AAAA-MM-JJ) de la semaine contenant ce jour. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export interface WeekSummary {
  weekStart: string;
  /** Jours de la semaine qui font partie du défi. */
  days: string[];
  partial: boolean;
  counts: Record<string, number>;
}

/**
 * Compte par semaine les jours où un objectif hebdo est fait.
 * `appDays` : jours où une séance a été enregistrée dans l'app (compte pour « gym » automatiquement).
 */
export function summarizeWeeks(def: ChallengeDef, entries: Entries, appDays: Set<string>): WeekSummary[] {
  const weeks = new Map<string, WeekSummary>();
  for (const d of dayRange(def.start, def.end)) {
    const ws = weekStart(d);
    const w = weeks.get(ws) ?? { weekStart: ws, days: [], partial: false, counts: Object.fromEntries(def.weekly.map((g) => [g.id, 0])) };
    w.days.push(d);
    for (const g of def.weekly) {
      const manual = entries[d]?.values[g.id] === true;
      const fromApp = g.id === 'gym' && appDays.has(d);
      if (manual || fromApp) w.counts[g.id] = (w.counts[g.id] ?? 0) + 1;
    }
    weeks.set(ws, w);
  }
  return [...weeks.values()].map((w) => ({ ...w, partial: w.days.length < 7 }));
}
