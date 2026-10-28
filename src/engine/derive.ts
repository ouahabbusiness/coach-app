// Calculs dérivés de l'état d'une séance. Fonctions pures, sans IA.

import type { EpochMs, Interval, SessionOutcome, SessionState, SetResult, SetState } from './types';

/** Dernière saisie non annulée, ou undefined si rien n'a été saisi. */
export function currentResult(set: SetState): SetResult | undefined {
  for (let i = set.entries.length - 1; i >= 0; i--) {
    const e = set.entries[i]!;
    if (!e.undone) return e.result;
  }
  return undefined;
}

export interface Timings {
  totalMs: number;
  activeMs: number;
  restMs: number;
  interruptedMs: number;
  /** Repos en cours (interruptions déduites), si la séance est au repos. */
  currentRestMs?: number;
  /** Série en cours, si une série est active. */
  currentSetMs?: number;
}

function overlap(a: Interval, b: Interval, now: EpochMs): number {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end ?? now, b.end ?? now);
  return Math.max(0, end - start);
}

/** Durées calculées uniquement à partir d'instants UTC : insensibles aux changements d'heure. */
export function timings(st: SessionState, now: EpochMs): Timings {
  const until = st.endedAt ?? now;
  const len = (i: Interval) => Math.max(0, (i.end ?? until) - i.start);

  const activeMs = st.sets.reduce(
    (sum, s) => (s.startedAt !== undefined ? sum + Math.max(0, (s.endedAt ?? until) - s.startedAt) : sum),
    0,
  );
  const interruptedMs = st.interruptions.reduce((sum, i) => sum + len(i), 0);
  const restNet = (r: Interval) => len(r) - st.interruptions.reduce((sum, i) => sum + overlap(r, i, until), 0);
  const restMs = st.rests.reduce((sum, r) => sum + restNet(r), 0);

  const t: Timings = { totalMs: until - st.startedAt, activeMs, restMs, interruptedMs };
  const lastRest = st.rests[st.rests.length - 1];
  if ((st.phase === 'resting' || st.phase === 'interrupted') && lastRest && lastRest.end === undefined) {
    t.currentRestMs = restNet(lastRest);
  }
  const current = st.sets.find((s) => s.planned.id === st.currentSetId);
  if (st.phase === 'in_set' && current?.startedAt !== undefined) t.currentSetMs = until - current.startedAt;
  return t;
}

export function sessionOutcome(st: SessionState): SessionOutcome {
  if (st.safetyStop) return 'stopped_for_safety';
  if (st.phase !== 'ended') return 'in_progress';
  // Un mouvement passé volontairement (« Passé : tolérance inconnue ») n'est ni fait ni compté comme manquant : pas de pénalité.
  const counted = st.sets.filter((s) => !(s.status === 'skipped' && /passé : tolérance inconnue/i.test(s.skipReason ?? '')));
  return counted.length > 0 && counted.every((s) => s.status === 'done') ? 'completed' : 'partial';
}

/** Jour calendaire (AAAA-MM-JJ) d'un instant dans un fuseau donné. */
export function localDay(at: EpochMs, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export interface SetSummary {
  plannedSetId: string;
  status: SetState['status'];
  planned: SetState['planned'];
  actual?: SetResult;
  durationMs?: number;
}

export interface VariantSummary {
  variantId: string;
  sets: SetSummary[];
  done: number;
  skipped: number;
  /** Séries réalisées dont le résultat n'a pas été saisi (inconnu, pas zéro). */
  missingResults: number;
}

/** Bilan de séance calculé uniquement à partir des données enregistrées. */
export function summarizeSession(st: SessionState): VariantSummary[] {
  const groups = new Map<string, VariantSummary>();
  for (const set of st.sets) {
    const id = set.planned.variantId;
    const g = groups.get(id) ?? { variantId: id, sets: [], done: 0, skipped: 0, missingResults: 0 };
    const actual = currentResult(set);
    g.sets.push({
      plannedSetId: set.planned.id,
      status: set.status,
      planned: set.planned,
      actual,
      durationMs: set.startedAt !== undefined && set.endedAt !== undefined ? set.endedAt - set.startedAt : undefined,
    });
    if (set.status === 'done') {
      g.done++;
      if (!actual) g.missingResults++;
    }
    if (set.status === 'skipped') g.skipped++;
    groups.set(id, g);
  }
  return [...groups.values()];
}

export interface Comparable {
  sessionId: string;
  at: EpochMs;
  results: SetResult[];
}

/**
 * Dernière performance comparable : même variante exacte, séance antérieure,
 * séries réalisées avec un résultat saisi. Retourne undefined s'il n'y en a pas.
 */
export function lastComparable(sessions: SessionState[], variantId: string, before: EpochMs): Comparable | undefined {
  const candidates = sessions
    .filter((s) => s.startedAt < before)
    .sort((a, b) => b.startedAt - a.startedAt);
  for (const s of candidates) {
    const results = s.sets
      .filter((set) => set.planned.variantId === variantId && set.status === 'done')
      .map(currentResult)
      .filter((r): r is SetResult => r !== undefined);
    if (results.length > 0) return { sessionId: s.sessionId, at: s.startedAt, results };
  }
  return undefined;
}
