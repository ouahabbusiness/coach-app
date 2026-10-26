// Progression des charges (lest) et des répétitions, à partir des résultats réels.
// Règle « double progression » avec la réserve déclarée (RIR) :
//  - toutes les séries tenues avec de la marge → on monte ;
//  - séries nettement manquées → on redescend ;
//  - sinon on garde.
// Pendant la séance : une série trop facile fait monter la suivante tout de suite.

import type { PlannedSet, SessionState, SetResult } from './types';
import { currentResult } from './derive';

/** Pas de charge : 1,25 kg sous 10 kg de lest, 2,5 kg au-delà. */
export const loadStep = (kg: number) => (kg < 10 ? 1.25 : 2.5);

const fmtKg = (kg: number) => kg.toLocaleString('fr-BE', { maximumFractionDigits: 2 });

/** Série « facile » : au moins 3 répétitions de réserve, ou 2 de plus que la cible si la réserve n'est pas notée. */
export function tooEasy(r: SetResult, target?: number): boolean {
  if (target === undefined || r.reps === undefined) return false;
  if (r.reps < target) return false;
  return r.rir !== undefined ? r.rir >= 3 : r.reps >= target + 2;
}

/** Série « manquée » : au moins 2 répétitions sous la cible. */
export const missed = (r: SetResult, target?: number) => target !== undefined && r.reps !== undefined && r.reps <= target - 2;

export interface Adjust {
  loadKg?: number;
  targetReps?: number;
  /** Texte court affiché (ex. « ↑ +2,5 kg »). */
  note?: string;
}

/** Séance suivante : à partir des séries de travail de la dernière fois sur la même variante. */
export function nextSessionAdjust(prev: SetResult[] | undefined, line: { targetReps?: number; loadKg?: number }): Adjust {
  if (!prev || prev.length === 0 || line.targetReps === undefined) return {};
  const target = line.targetReps;
  const lastLoad = prev.reduce<number | undefined>((m, r) => (r.loadKg !== undefined ? Math.max(m ?? 0, r.loadKg) : m), undefined) ?? line.loadKg;
  const hitAll = prev.every((r) => r.reps !== undefined && r.reps >= target);
  const easy = hitAll && prev.every((r) => (r.rir !== undefined ? r.rir >= 2 : (r.reps ?? 0) >= target + 1));
  const missedMany = prev.filter((r) => missed(r, target)).length * 2 >= prev.length;

  if (easy) {
    if (lastLoad !== undefined && lastLoad > 0) {
      const next = lastLoad + loadStep(lastLoad);
      return { loadKg: next, note: `↑ +${fmtKg(next - lastLoad)} kg` };
    }
    return { targetReps: target + 1, note: '↑ +1 rép.' };
  }
  if (missedMany && lastLoad !== undefined && lastLoad > 0) {
    const next = Math.max(0, lastLoad - loadStep(lastLoad));
    return { loadKg: next, note: `↓ −${fmtKg(lastLoad - next)} kg` };
  }
  if (lastLoad !== undefined && lastLoad !== line.loadKg) return { loadKg: lastLoad, note: `= ${fmtKg(lastLoad)} kg` };
  return {};
}

/**
 * Charge conseillée pour une série, d'après les séries déjà faites du même bloc dans cette séance.
 * Retourne undefined si rien à dire.
 */
export function liveLoad(st: SessionState, set: PlannedSet): { loadKg?: number; targetReps?: number; reason: 'facile' | 'manqué' | 'suite' } | undefined {
  if (set.role !== 'work' || set.kind !== 'reps') return undefined;
  const before = st.sets.filter((s) => s.planned.blockId === set.blockId && s.status === 'done' && s.planned.id !== set.id);
  const last = before[before.length - 1];
  const r = last && currentResult(last);
  if (!r) return undefined;
  const base = r.loadKg ?? last!.planned.loadKg;
  if (tooEasy(r, last!.planned.targetReps)) {
    if (base !== undefined && base > 0) return { loadKg: base + loadStep(base), reason: 'facile' };
    return { targetReps: (r.reps ?? 0) + 1, reason: 'facile' };
  }
  if (missed(r, last!.planned.targetReps) && base !== undefined && base > 0) return { loadKg: Math.max(0, base - loadStep(base)), reason: 'manqué' };
  // Garde la charge réellement utilisée à la série précédente (si elle a déjà été montée).
  if (base !== undefined && base !== set.loadKg) return { loadKg: base, reason: 'suite' };
  return undefined;
}
