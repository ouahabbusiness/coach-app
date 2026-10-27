// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { docOf, estimateUnplanned, knownIntake, type PlanEntry } from '../src/engine/dayPlan';

const meal = (id: string, kcal: number, extra: Partial<PlanEntry> = {}): PlanEntry => ({ id, time: '12:00', kind: 'repas', title: id, items: [], kcal, protein: 30, ...extra });
const plan = [meal('matin', 600), meal('midi', 800), meal('soir', 700), { id: 'whey', time: '18:00', kind: 'complement' as const, title: 'Whey', items: [], kcal: 120, protein: 24 }];

describe('apports classés par documentation et incertitude', () => {
  it('repas simplement cochés → documentation « coché », incertitude inconnue, rien compté', () => {
    const r = knownIntake(plan, ['matin', 'midi', 'soir'], [])!;
    expect(r).toMatchObject({ kcal: 0, known: 0, complete: false });
    expect(r.meals.map((m) => [m.doc, m.uncertainty])).toEqual([['coché', null], ['coché', null], ['coché', null]]);
  });

  it('« exactement le plan » partout → journée comptée, marge ±15 %, complément coché inclus', () => {
    const r = knownIntake(plan, ['matin', 'midi', 'soir', 'whey'], ['matin', 'midi', 'soir'])!;
    expect(r).toMatchObject({ kcal: 2220, known: 3, complete: true, unknown: [], marginKcal: 315 });
  });

  it('le classement suit la preuve, pas le type de repas : resto détaillé compté, resto estimé non compté', () => {
    const resto = estimateUnplanned('resto', 'normale');
    expect(resto.source).toBe('estimation');
    expect(estimateUnplanned('saute', 'normale').source).toBe('sauté');
    const p = [
      meal('matin', 0, { unplanned: true, source: 'sauté' }),
      meal('midi', resto.kcal, { unplanned: true, source: 'estimation' }),
      meal('soir', 900, { unplanned: true, source: 'portions déclarées', title: 'soir (resto détaillé)' }),
    ];
    const r = knownIntake(p, [], [])!;
    expect(r).toMatchObject({ kcal: 900, known: 2, complete: false, unknown: ['midi'], marginKcal: 180 });
  });

  it('anciennes saisies converties prudemment', () => {
    expect(docOf('détaillé')).toBe('portions déclarées');
    expect(docOf('estimé')).toBe('estimation');
    expect(docOf(undefined)).toBe('estimation');
  });

  it('rien de noté → pas d’entrée', () => {
    expect(knownIntake(plan, [], [])).toBeUndefined();
  });
});
