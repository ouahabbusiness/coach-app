// « Mes repas » : tu décris un repas, l'app le prend tel quel et ajuste les autres.
import { describe, expect, it } from 'vitest';
import { buildDayPlan, planTotals, type EatenMeal, type NutritionAnswers, type PlanEntry } from '../src/engine/dayPlan';

const base: NutritionAnswers = {
  wake: '07:00', bedtime: '23:00', meals: 4, proteins: ['oeuf', 'poulet', 'skyr', 'thon'], carbs: ['avoine', 'riz', 'pates'], fats: ['amandes', 'huile_olive'], fruits: ['banane'], exclude: [], supplements: [],
};
const day = (a: NutritionAnswers, extra: object = {}) => buildDayPlan({ answers: a, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 1, ...extra });
const entry = (p: PlanEntry[], id: string) => p.find((e) => e.id === id)!;
const lunch = [{ foodId: 'riz', grams: 250 }, { foodId: 'poulet', grams: 200 }, { foodId: 'legumes', grams: 200 }];

describe('Mes repas : un repas décrit est pris tel quel', () => {
  it('le déjeuner décrit garde ses quantités, ses valeurs, et est marqué « décrit par toi »', () => {
    const l = entry(day({ ...base, usualMeals: { dejeuner: lunch } }), 'dejeuner');
    expect(l.declared).toBe(true);
    expect(l.items).toEqual(['250 g riz (cuit)', '200 g blanc de poulet', '200 g légumes']);
    expect(l.kcal).toBe(Math.round(1.3 * 250 + 1.2 * 200 + 0.3 * 200));
    expect(l.protein).toBe(Math.round(0.027 * 250 + 0.23 * 200 + 0.02 * 200));
  });

  it('les autres repas ajustent : la journée reste proche de la cible', () => {
    const plain = planTotals(day(base)).kcal;
    const t = planTotals(day({ ...base, usualMeals: { dejeuner: lunch, diner: [{ foodId: 'pates', grams: 300 }, { foodId: 'thon', grams: 160 }] } })).kcal;
    expect(Math.abs(t - plain) / plain).toBeLessThan(0.06);
    expect(Math.abs(t - 2600) / 2600).toBeLessThan(0.08);
  });

  it('un gros repas décrit fait baisser les autres repas', () => {
    const big = [{ foodId: 'riz', grams: 600 }, { foodId: 'poulet', grams: 300 }];
    const without = entry(day(base), 'diner').kcal!;
    const withBig = entry(day({ ...base, usualMeals: { dejeuner: big } }), 'diner').kcal!;
    expect(withBig).toBeLessThan(without);
  });

  it('petit-déjeuner et déjeuner décrits ensemble : les deux sont fixes, dîner et collation absorbent', () => {
    const a: NutritionAnswers = { ...base, usualBreakfast: [{ foodId: 'oeuf', grams: 240 }], usualMeals: { dejeuner: lunch } };
    const p = day(a);
    expect(entry(p, 'petit_dej').declared).toBe(true);
    expect(entry(p, 'dejeuner').declared).toBe(true);
    expect(entry(p, 'diner').declared).toBeUndefined();
    expect(Math.abs(planTotals(p).kcal - 2600) / 2600).toBeLessThan(0.08);
  });

  it('collation décrite : pas de whey ajouté automatiquement dessus', () => {
    const a: NutritionAnswers = { ...base, supplements: [{ id: 'whey', name: 'Whey', doseG: 30, kcalPerDose: 115, proteinPerDose: 24, timing: 'collation' }], usualMeals: { collation: [{ foodId: 'banane', grams: 120 }] } };
    const s = entry(day(a), 'collation');
    expect(s.items.some((x) => /whey/i.test(x))).toBe(false);
    expect(s.kcal).toBe(Math.round(0.9 * 120));
  });
});

describe('Mes repas : pour aujourd’hui seulement ≠ habitude', () => {
  it('le choix du jour change le plan du jour sans toucher aux réponses', () => {
    const a: NutritionAnswers = { ...base, usualMeals: { dejeuner: lunch } };
    const before = JSON.stringify(a);
    const today = day(a, { mealOverrides: { dejeuner: [{ foodId: 'pates', grams: 200 }] } });
    expect(entry(today, 'dejeuner').items).toEqual(['200 g pâtes (cuites)']);
    expect(JSON.stringify(a)).toBe(before);
    expect(entry(day(a), 'dejeuner').items[0]).toBe('250 g riz (cuit)');
  });
});

describe('Mes repas : historique et frigo', () => {
  it('un repas mangé reste tel quel même si l’habitude change ensuite', () => {
    const eaten: Record<string, EatenMeal> = { dejeuner: { label: 'Resto', kcal: 900, protein: 50, source: 'estimé' } };
    const a = entry(day({ ...base, usualMeals: { dejeuner: lunch } }, { eaten }), 'dejeuner');
    const b = entry(day({ ...base, usualMeals: { dejeuner: [{ foodId: 'pates', grams: 100 }] } }, { eaten }), 'dejeuner');
    for (const e of [a, b]) {
      expect(e.kcal).toBe(900);
      expect(e.declared).toBeUndefined();
    }
  });

  it('un repas décrit n’est jamais « ajustable » après un imprévu plus tôt dans la journée', () => {
    const eaten: Record<string, EatenMeal> = { petit_dej: { label: 'Gros petit-déj', kcal: 1000, protein: 60, source: 'estimé' } };
    const a: NutritionAnswers = { ...base, usualMeals: { dejeuner: lunch } };
    const plain = entry(day(a), 'dejeuner').kcal;
    const afterEaten = entry(day(a, { eaten }), 'dejeuner').kcal;
    expect(afterEaten).toBe(plain);
  });

  it('un aliment du repas décrit absent du frigo est signalé, rien n’est remplacé', () => {
    const p = day({ ...base, usualMeals: { dejeuner: lunch }, pantry: ['riz', 'legumes', 'skyr'] });
    expect(entry(p, 'dejeuner').missing).toEqual(['Blanc de poulet']);
    expect(entry(p, 'dejeuner').items).toContain('200 g blanc de poulet');
  });

  it('rien de décrit : comportement inchangé', () => {
    expect(day({ ...base, usualMeals: {} })).toEqual(day(base));
  });
});

import { loadMealsToday, saveMealsToday } from '../src/ui/breakfastToday';

function fakeRepo() {
  const kv = new Map<string, unknown>();
  return {
    getKv: async <T>(k: string) => kv.get(k) as T | undefined,
    setKv: async (k: string, v: unknown) => void kv.set(k, v),
  };
}

describe('Mes repas : « aujourd’hui seulement » expire au changement de journée', () => {
  it('rangé sous la date : absent le lendemain, un repas par créneau, effaçable', async () => {
    const repo = fakeRepo();
    await saveMealsToday(repo, '2026-10-27', 'dejeuner', [{ foodId: 'pates', grams: 200 }]);
    await saveMealsToday(repo, '2026-10-27', 'diner', [{ foodId: 'riz', grams: 250 }]);
    expect(Object.keys(await loadMealsToday(repo, '2026-10-27')).sort()).toEqual(['dejeuner', 'diner']);
    expect(await loadMealsToday(repo, '2026-10-28')).toEqual({});
    await saveMealsToday(repo, '2026-10-27', 'dejeuner', undefined);
    expect(Object.keys(await loadMealsToday(repo, '2026-10-27'))).toEqual(['diner']);
  });
});
