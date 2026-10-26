// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { buildDayPlan, planTotals, type NutritionAnswers } from '../src/engine/dayPlan';

const answers: NutritionAnswers = {
  wake: '07:00',
  bedtime: '23:00',
  meals: 4,
  proteins: ['oeuf', 'poulet', 'skyr'],
  carbs: ['avoine', 'riz'],
  fats: ['amandes', 'huile_olive'],
  fruits: ['banane'],
  exclude: [],
  supplements: [
    { id: 'crea', name: 'Créatine', doseG: 3, timing: 'apres_petit_dej', waterMl: 300 },
    { id: 'whey', name: 'Whey', doseG: 30, kcalPerDose: 115, proteinPerDose: 24, timing: 'collation' },
  ],
};

describe('plan du jour', () => {
  const plan = buildDayPlan({ answers, kcal: 2600, proteinG: 140, waterMl: 3000, workout: { start: '18:30', durationMin: 45, title: 'Force haut du corps' }, dayIndex: 0 });

  it('créatine déclarée juste après le petit-déjeuner, avec de l’eau', () => {
    const bf = plan.find((e) => e.id === 'petit_dej')!;
    const crea = plan.find((e) => e.id === 'supp-crea')!;
    expect(bf.time).toBe('07:30');
    expect(crea.time).toBe('07:50');
    expect(crea.items.join(' ')).toContain('3 g');
    expect(crea.waterMl).toBe(300);
  });

  it('petit-déjeuner en œufs comptés à l’unité', () => {
    expect(plan.find((e) => e.id === 'petit_dej')!.items[0]).toMatch(/\d œufs?/);
  });

  it('collation 90 min avant la séance, whey déclarée incluse', () => {
    const snack = plan.find((e) => e.id === 'collation')!;
    expect(snack.time).toBe('17:00');
    expect(snack.items[0]).toContain('Whey');
  });

  it('totaux proches de la cible (± 15 %), eau = cible', () => {
    const t = planTotals(plan);
    expect(Math.abs(t.kcal - 2600) / 2600).toBeLessThan(0.15);
    expect(Math.abs(t.protein - 140) / 140).toBeLessThan(0.2);
    expect(Math.abs(t.waterMl - 3000)).toBeLessThanOrEqual(300);
  });

  it('aliment exclu jamais proposé', () => {
    const p = buildDayPlan({ answers: { ...answers, exclude: ['oeuf'] }, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 0 });
    expect(p.some((e) => e.items.some((x) => x.includes('œuf')))).toBe(false);
  });
});

describe('imprévu de repas', () => {
  it('déjeuner préparé par quelqu’un (grosse portion) → dîner allégé, journée proche de la cible', async () => {
    const { estimateUnplanned } = await import('../src/engine/dayPlan');
    const eaten = { dejeuner: estimateUnplanned('maison', 'grosse') };
    const plan = buildDayPlan({ answers, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 0, eaten });
    const lunch = plan.find((e) => e.id === 'dejeuner')!;
    expect(lunch.unplanned).toBe(true);
    expect(lunch.kcal).toBe(1000);
    const dinner = plan.find((e) => e.id === 'diner')!;
    expect(dinner.adjusted).toBe('allégé');
    const t = planTotals(plan);
    expect(Math.abs(t.kcal - 2600) / 2600).toBeLessThan(0.12);
  });
});

describe('sommeil dans le plan du jour', () => {
  it('lever 07:00, coucher déclaré 00:30 → coucher conseillé 23:00, dernier café 15:00', () => {
    const p = buildDayPlan({ answers: { ...answers, bedtime: '00:30' }, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 0 });
    expect(p.find((e) => e.id === 'coucher')!.time).toBe('23:00');
    expect(p.find((e) => e.id === 'cafe')!.time).toBe('15:00');
    expect(p.find((e) => e.id === 'lumiere')!.time).toBe('07:15');
  });
});
