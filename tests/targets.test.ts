// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { calorieTarget, runTarget, waterTarget, type RunEntry } from '../src/engine/targets';
import { DEFAULT_PIECES, availableLoads, liveLoad, nextSessionAdjust, tooEasy } from '../src/engine/progression';
import type { PlannedSet, SessionState, SetState } from '../src/engine/types';

const run = (day: string, km: number, effort?: number): RunEntry => ({ id: day, day, km, effort, at: 0 });

describe('eau', () => {
  it('35 ml/kg + 0,5 L par heure de séance, arrondi au quart de litre', () => {
    expect(waterTarget(77).value).toBe(2750);
    expect(waterTarget(77, 60).value).toBe(3250);
  });
  it('sans poids : pas de cible inventée', () => {
    expect(waterTarget(undefined)).toEqual({ why: [], missing: ['poids'] });
  });
});

describe('calories', () => {
  const base = { sex: 'homme' as const, age: 25, heightCm: 178, weightKg: 77, sessionsPerWeek: 4 };
  it('Mifflin-St Jeor × activité', () => {
    // 10×77 + 6,25×178 − 5×25 + 5 = 1762,5 ; × 1,55 = 2731,9
    expect(calorieTarget(base).value?.maintenance).toBe(2750);
    expect(calorieTarget(base).value?.proteinG).toBe(139);
  });
  it('perte de graisse : déficit plafonné à 500, puis −150 si le poids ne baisse pas', () => {
    expect(calorieTarget({ ...base, goal: 'perte_de_graisse' }).value?.kcal).toBe(2250);
    expect(calorieTarget({ ...base, goal: 'perte_de_graisse', trend: 'stable' }).value?.kcal).toBe(2100);
  });
  it('données manquantes listées, aucune valeur', () => {
    const c = calorieTarget({ weightKg: 77 });
    expect(c.value).toBeUndefined();
    expect(c.missing).toEqual(['formule', 'âge', 'taille']);
  });
});

describe('course', () => {
  it('départ à 3 km sans historique', () => {
    expect(runTarget([], '2026-11-03').value).toEqual({ km: 3, move: 'départ' });
  });
  it('+10 % sur la plus longue récente (min +0,5 km)', () => {
    expect(runTarget([run('2026-11-01', 4.5, 6)], '2026-11-03').value).toEqual({ km: 5, move: 'hausse' });
    expect(runTarget([run('2026-10-28', 8, 6), run('2026-11-01', 5, 6)], '2026-11-03').value?.km).toBe(9);
  });
  it('effort 9/10 : on garde ; pause > 14 j : on redescend', () => {
    expect(runTarget([run('2026-11-01', 5, 9)], '2026-11-03').value).toEqual({ km: 5, move: 'maintien' });
    expect(runTarget([run('2026-10-01', 5, 6)], '2026-11-03').value).toEqual({ km: 4, move: 'reprise' });
  });
});

describe('lest', () => {
  it('série facile = 3 de réserve, ou cible + 2 sans réserve notée', () => {
    expect(tooEasy({ reps: 8, rir: 3 }, 8)).toBe(true);
    expect(tooEasy({ reps: 8, rir: 1 }, 8)).toBe(false);
    expect(tooEasy({ reps: 10 }, 8)).toBe(true);
  });

  it('séance suivante : tout tenu avec marge → +2,5 kg ; manqué → −2,5 kg ; sinon garde', () => {
    const line = { targetReps: 8, loadKg: 15 };
    expect(nextSessionAdjust([{ reps: 8, rir: 2, loadKg: 15 }, { reps: 8, rir: 2, loadKg: 15 }], line)).toEqual({ loadKg: 17.5, targetReps: 8, note: '↑ 17,5 kg' });
    expect(nextSessionAdjust([{ reps: 5, loadKg: 15 }, { reps: 8, loadKg: 15 }], line).loadKg).toBe(12.5);
    expect(nextSessionAdjust([{ reps: 8, rir: 1, loadKg: 15 }], line)).toEqual({});
    expect(nextSessionAdjust([{ reps: 9, rir: 2 }], { targetReps: 8 })).toEqual({ targetReps: 10, note: '↑ +1 rép.' });
  });

  it('en séance : 15 kg trop facile → la série suivante passe à 17,5 kg, puis reste à 17,5', () => {
    const ps = (id: string): PlannedSet => ({ id, exerciseId: 'e', variantId: 'v', blockId: 'b', blockType: 'straight', role: 'work', kind: 'reps', targetReps: 8, loadKg: 15, restSeconds: 90 });
    const done = (id: string, loadKg: number, rir: number): SetState => ({ planned: ps(id), status: 'done', entries: [{ eventId: id, at: 0, undone: false, result: { reps: 8, loadKg, rir } }] });
    const pending: SetState = { planned: ps('s3'), status: 'pending', entries: [] };
    const st = { sets: [done('s1', 15, 4), pending] } as unknown as SessionState;
    expect(liveLoad(st, ps('s3'))).toEqual({ loadKg: 17.5, reason: 'facile' });
    const st2 = { sets: [done('s1', 15, 4), done('s2', 17.5, 2), pending] } as unknown as SessionState;
    expect(liveLoad(st2, ps('s3'))).toEqual({ loadKg: 17.5, reason: 'suite' });
  });

  it('charges réalisables avec 5, 5, 6 et 12 kg', () => {
    expect(availableLoads(DEFAULT_PIECES)).toEqual([0, 5, 6, 10, 11, 12, 16, 17, 18, 22, 23, 28]);
  });

  it('matériel réel : 10 → 11 kg direct ; 12 → 16 kg seulement après +2 répétitions', () => {
    const loads = availableLoads(DEFAULT_PIECES);
    const line = { targetReps: 8, loadKg: 10 };
    expect(nextSessionAdjust([{ reps: 8, rir: 2, loadKg: 10 }], line, loads)).toMatchObject({ loadKg: 11, note: '↑ 11 kg' });
    const at12 = { targetReps: 8, loadKg: 12 };
    expect(nextSessionAdjust([{ reps: 8, rir: 2, loadKg: 12 }], at12, loads)).toMatchObject({ loadKg: 12, targetReps: 9, note: '↑ +1 rép. avant 16 kg' });
    expect(nextSessionAdjust([{ reps: 9, rir: 2, loadKg: 12 }], at12, loads)).toMatchObject({ loadKg: 12, targetReps: 10 });
    expect(nextSessionAdjust([{ reps: 10, rir: 2, loadKg: 12 }], at12, loads)).toEqual({ loadKg: 16, targetReps: 8, note: '↑ 16 kg' });
    expect(nextSessionAdjust([{ reps: 5, loadKg: 16 }], { targetReps: 8, loadKg: 16 }, loads)).toMatchObject({ loadKg: 12 });
  });

  it('en séance avec mon matériel : 12 kg trop facile → 16 kg et 2 répétitions de moins', () => {
    const loads = availableLoads(DEFAULT_PIECES);
    const ps = (id: string): PlannedSet => ({ id, exerciseId: 'e', variantId: 'v', blockId: 'b', blockType: 'straight', role: 'work', kind: 'reps', targetReps: 8, loadKg: 12, restSeconds: 90 });
    const st = { sets: [{ planned: ps('s1'), status: 'done', entries: [{ eventId: 'x', at: 0, undone: false, result: { reps: 8, loadKg: 12, rir: 4 } }] }] } as unknown as SessionState;
    expect(liveLoad(st, ps('s2'), loads)).toEqual({ loadKg: 16, targetReps: 6, reason: 'facile' });
  });

  it('kettlebell : on ne monte pas à 16 kg (une seule KB de 12 kg) → répétitions', () => {
    const kbLoads = [6, 12];
    expect(nextSessionAdjust([{ reps: 10, rir: 3, loadKg: 12 }], { targetReps: 10, loadKg: 12 }, kbLoads)).toMatchObject({ loadKg: 12, targetReps: 11 });
    expect(nextSessionAdjust([{ reps: 10, rir: 3, loadKg: 6 }], { targetReps: 10, loadKg: 6 }, kbLoads)).toMatchObject({ loadKg: 6, targetReps: 11 });
    expect(nextSessionAdjust([{ reps: 12, rir: 3, loadKg: 6 }], { targetReps: 10, loadKg: 6 }, kbLoads)).toMatchObject({ loadKg: 12, targetReps: 10 });
  });
});
