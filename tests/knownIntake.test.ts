// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { DOC_LEVEL, docOf, estimateUnplanned, knownIntake, type PlanEntry } from '../src/engine/dayPlan';

const meal = (id: string, kcal: number, extra: Partial<PlanEntry> = {}): PlanEntry => ({ id, time: '12:00', kind: 'repas', title: id, items: [], kcal, protein: 30, ...extra });
const plan = [meal('matin', 600), meal('midi', 800), meal('soir', 700), { id: 'whey', time: '18:00', kind: 'complement' as const, title: 'Whey', items: [], kcal: 120, protein: 24 }];

describe('apports classés par niveau de documentation', () => {
  it('niveaux définis, sans pourcentage', () => {
    expect(DOC_LEVEL).toEqual({ sauté: 'documenté', 'plan confirmé': 'documenté', 'portions déclarées': 'documenté', estimation: 'estimé', coché: 'non documenté' });
  });

  it('repas simplement cochés → non documentés, exclus : apport du jour INCONNU (null), jamais 0', () => {
    const r = knownIntake(plan, ['matin', 'midi', 'soir'], [])!;
    expect(r).toMatchObject({ kcal: null, documentedKcal: 0, known: 0, complete: false, excluded: ['matin', 'midi', 'soir'] });
    expect(r.meals.map((m) => m.level)).toEqual(['non documenté', 'non documenté', 'non documenté']);
  });

  it('plan confirmé partout → journée documentée, total connu, complément coché inclus', () => {
    expect(knownIntake(plan, ['matin', 'midi', 'soir', 'whey'], ['matin', 'midi', 'soir'])).toMatchObject({ kcal: 2220, known: 3, complete: true, excluded: [] });
  });

  it('le classement suit la preuve : resto détaillé compté, resto estimé exclu ; total du jour inconnu', () => {
    const resto = estimateUnplanned('resto', 'normale');
    expect(resto.source).toBe('estimation');
    expect(estimateUnplanned('saute', 'normale').source).toBe('sauté');
    const p = [
      meal('matin', 0, { unplanned: true, source: 'sauté' }),
      meal('midi', resto.kcal, { unplanned: true, source: 'estimation' }),
      meal('soir', 900, { unplanned: true, source: 'portions déclarées' }),
    ];
    const r = knownIntake(p, [], [])!;
    expect(r).toMatchObject({ kcal: null, documentedKcal: 900, known: 2, complete: false, excluded: ['midi'] });
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
