// Changement de journée, historique et réglages : ce qui est passé ne se réécrit pas.
import { describe, expect, it } from 'vitest';
import { loadBreakfastToday, saveBreakfastToday } from '../src/ui/breakfastToday';
import { buildDayPlan, freezeConfirmed, planTotals, type EatenMeal, type NutritionAnswers, type PlanEntry } from '../src/engine/dayPlan';

const answers: NutritionAnswers = {
  wake: '07:00', bedtime: '23:00', meals: 4, proteins: ['oeuf', 'poulet', 'skyr'], carbs: ['avoine', 'riz'], fats: ['amandes', 'huile_olive'], fruits: ['banane'], exclude: [], supplements: [],
  usualBreakfast: [{ foodId: 'oeuf', grams: 240 }, { foodId: 'cracotte', grams: 36 }],
  breakfastCoffee: true,
};
const day = (a: NutritionAnswers, extra: object = {}) => buildDayPlan({ answers: a, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 1, ...extra });
const entry = (p: PlanEntry[], id: string) => p.find((e) => e.id === id)!;

/** Stockage minimal en mémoire (même contrat que le dépôt). */
function fakeRepo() {
  const kv = new Map<string, unknown>();
  return {
    getKv: async <T>(k: string) => kv.get(k) as T | undefined,
    setKv: async (k: string, v: unknown) => void kv.set(k, v),
  };
}

describe('« Utiliser aujourd’hui » expire au changement de journée', () => {
  it('le choix du jour n’existe pas le lendemain, ni la veille', async () => {
    const repo = fakeRepo();
    const items = [{ foodId: 'oeuf', grams: 120 }, { foodId: 'blanc_oeuf', grams: 140 }];
    await saveBreakfastToday(repo, '2026-10-27', items);
    expect(await loadBreakfastToday(repo, '2026-10-27')).toEqual(items);
    expect(await loadBreakfastToday(repo, '2026-10-28')).toBeUndefined();
    expect(await loadBreakfastToday(repo, '2026-10-26')).toBeUndefined();
  });

  it('effacer le choix du jour le retire sans toucher aux autres jours', async () => {
    const repo = fakeRepo();
    await saveBreakfastToday(repo, '2026-10-27', [{ foodId: 'oeuf', grams: 120 }]);
    await saveBreakfastToday(repo, '2026-10-28', [{ foodId: 'banane', grams: 120 }]);
    await saveBreakfastToday(repo, '2026-10-27', undefined);
    expect(await loadBreakfastToday(repo, '2026-10-27')).toBeUndefined();
    expect(await loadBreakfastToday(repo, '2026-10-28')).toEqual([{ foodId: 'banane', grams: 120 }]);
  });

  it('le plan du lendemain retombe sur l’habitude, qui n’a jamais changé', () => {
    const habit = JSON.stringify(answers.usualBreakfast);
    const today = day(answers, { breakfastOverride: [{ foodId: 'oeuf', grams: 120 }] });
    const tomorrow = day(answers, { breakfastOverride: undefined });
    expect(entry(today, 'petit_dej').items).toContain('2 œufs');
    expect(entry(tomorrow, 'petit_dej').items).toContain('4 œufs');
    expect(JSON.stringify(answers.usualBreakfast)).toBe(habit);
  });
});

describe('ce qui a été mangé reste dans l’historique', () => {
  const eaten: Record<string, EatenMeal> = { petit_dej: { label: 'Mon petit-déjeuner', kcal: 520, protein: 41, source: 'estimé' } };

  it('changer l’habitude ou l’appétit plus tard ne modifie pas le repas enregistré', () => {
    const before = entry(day(answers, { eaten }), 'petit_dej');
    const afterHabit = entry(day({ ...answers, usualBreakfast: [{ foodId: 'banane', grams: 120 }] }, { eaten }), 'petit_dej');
    const afterShare = entry(day({ ...answers, breakfastShare: 35 }, { eaten }), 'petit_dej');
    for (const e of [before, afterHabit, afterShare]) {
      expect(e.kcal).toBe(520);
      expect(e.protein).toBe(41);
      expect(e.items).toEqual(['Mon petit-déjeuner']);
    }
  });

  it('un repas déjà consommé n’est jamais redistribué ; seuls les repas à venir s’ajustent', () => {
    const plan = day(answers, { eaten: { ...eaten, dejeuner: { label: 'Resto', kcal: 900, protein: 50, source: 'estimé' } } });
    expect(entry(plan, 'petit_dej').kcal).toBe(520);
    expect(entry(plan, 'dejeuner').kcal).toBe(900);
    // les repas à venir portent l'écart, pas les repas passés
    const avant = day(answers, { eaten: { petit_dej: eaten.petit_dej! } });
    expect(entry(plan, 'diner').kcal!).toBeLessThanOrEqual(entry(avant, 'diner').kcal!);
  });

  it('repas confirmé (« exactement le plan ») : ses valeurs sont figées, même si le plan change ensuite', () => {
    const matin = day(answers);
    const snapshot = { petit_dej: entry(matin, 'petit_dej') };
    const apres = day({ ...answers, usualBreakfast: [{ foodId: 'banane', grams: 120 }] });
    const figé = freezeConfirmed(apres, snapshot, ['petit_dej']);
    expect(entry(figé, 'petit_dej').kcal).toBe(entry(matin, 'petit_dej').kcal);
    expect(entry(figé, 'dejeuner').kcal).toBe(entry(apres, 'dejeuner').kcal);
    // non confirmé : le plan, lui, peut changer
    expect(entry(freezeConfirmed(apres, snapshot, []), 'petit_dej').kcal).toBe(entry(apres, 'petit_dej').kcal);
  });
});

describe('réglage Léger / Normal / Copieux', () => {
  const generated: NutritionAnswers = { ...answers, usualBreakfast: [], breakfastCoffee: false };
  const total = (a: NutritionAnswers, extra: object = {}) => planTotals(day(a, extra)).kcal;

  it('conserve le total quotidien prévu', () => {
    const normal = total(generated);
    for (const pct of [20, 35]) expect(Math.abs(total({ ...generated, breakfastShare: pct }) - normal) / normal).toBeLessThan(0.03);
  });

  it('plus d’appétit le matin : le petit-déjeuner grossit, les autres repas se partagent le reste', () => {
    const leger = day({ ...generated, breakfastShare: 20 });
    const copieux = day({ ...generated, breakfastShare: 35 });
    expect(entry(copieux, 'petit_dej').kcal!).toBeGreaterThan(entry(leger, 'petit_dej').kcal!);
    expect(entry(copieux, 'dejeuner').kcal!).toBeLessThan(entry(leger, 'dejeuner').kcal!);
  });

  it('ne touche pas aux repas déjà consommés', () => {
    const eaten: Record<string, EatenMeal> = { petit_dej: { label: 'Déjà mangé', kcal: 600, protein: 40, source: 'estimé' } };
    const a = day({ ...generated, breakfastShare: 20 }, { eaten });
    const b = day({ ...generated, breakfastShare: 35 }, { eaten });
    expect(entry(a, 'petit_dej').kcal).toBe(600);
    expect(entry(b, 'petit_dej').kcal).toBe(600);
  });

  it('avec un petit-déjeuner habituel fixe, le réglage ne le modifie pas', () => {
    const a = entry(day({ ...answers, breakfastShare: 20 }), 'petit_dej');
    const b = entry(day({ ...answers, breakfastShare: 35 }), 'petit_dej');
    expect(a.kcal).toBe(b.kcal);
  });
});
