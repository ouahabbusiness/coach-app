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

describe('liste de courses', () => {
  it('7 jours de plan → œufs par boîtes de 6, riz en poids cru, rangés par rayon', async () => {
    const { shoppingList } = await import('../src/engine/dayPlan');
    const plans = Array.from({ length: 7 }, (_, d) => buildDayPlan({ answers, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: d }));
    const list = shoppingList(plans);
    const eggs = list.find((l) => l.foodId === 'oeuf')!;
    expect(eggs.buy).toMatch(/^\d+ œufs \(\d+ boîtes? de 6\)$/);
    expect(Number(eggs.buy.split(' ')[0]) % 6).toBe(0);
    expect(list.find((l) => l.foodId === 'riz')?.buy).toContain('(cru)');
    expect(list[0]!.aisle).toBe('Frais : viandes, poissons, œufs, laitiers');
    expect(list.some((l) => l.foodId === 'legumes')).toBe(true);
  });
});

describe('routine calée sur les prières', () => {
  it('lever 10 min avant Fajr, 5 prières dans la frise, aucun repas à l’heure d’une prière', () => {
    const times = { fajr: '05:35', sunrise: '07:25', dhuhr: '12:29', asr: '14:59', maghrib: '17:29', isha: '19:14' };
    const p = buildDayPlan({ answers: { ...answers, bedtime: '22:30' }, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 0, prayers: { times, wakeAtFajr: true } });
    expect(p.find((e) => e.id === 'reveil')!.time).toBe('05:25');
    expect(p.filter((e) => e.kind === 'priere')).toHaveLength(5);
    const meals = p.filter((e) => e.kind === 'repas').map((e) => e.time);
    for (const t of Object.values(times)) for (const m of meals) expect(m === t).toBe(false);
    expect(p.find((e) => e.id === 'dejeuner')!.time).toBe('12:44');
  });
});

describe('ce que j’ai à la maison', () => {
  const week = (a: NutritionAnswers) => Array.from({ length: 7 }, (_, d) => buildDayPlan({ answers: a, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: d }));

  it('déjeuner et dîner utilisent d’abord ce qui est à la maison', () => {
    const home = ['poulet', 'riz', 'huile_olive'];
    const plans = week({ ...answers, proteins: ['oeuf', 'poulet', 'skyr'], pantry: home });
    for (const p of plans) {
      const mains = p.filter((e) => e.id === 'dejeuner' || e.id === 'diner');
      expect(mains).toHaveLength(2);
      for (const m of mains) for (const x of m.parts ?? []) if (['oeuf', 'poulet', 'skyr'].includes(x.foodId)) expect(home).toContain(x.foodId);
    }
  });

  it('rien à la maison dans un groupe : on garde les aliments aimés (jamais de repas vide)', () => {
    const p = buildDayPlan({ answers: { ...answers, pantry: ['riz'] }, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 0 });
    expect(p.some((e) => e.kind === 'repas' && (e.parts ?? []).some((x) => ['oeuf', 'poulet', 'skyr'].includes(x.foodId)))).toBe(true);
  });

  it('pantry absent : comportement inchangé', () => {
    const a = buildDayPlan({ answers, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 2 });
    const b = buildDayPlan({ answers: { ...answers, pantry: [] }, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 2 });
    expect(b).toEqual(a);
  });
});

describe('petit-déjeuner habituel', () => {
  const usual: NutritionAnswers = {
    ...answers,
    usualBreakfast: [{ foodId: 'cottage', grams: 150 }, { foodId: 'oeuf', grams: 240 }, { foodId: 'cracotte', grams: 36 }],
    breakfastCoffee: true,
  };
  const day = (a: NutritionAnswers) => buildDayPlan({ answers: a, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 1 });

  it('est repris tel quel : quantités, café, valeurs', () => {
    const bf = day(usual).find((e) => e.id === 'petit_dej')!;
    expect(bf.items).toEqual(['150 g cottage cheese', '4 œufs', '4 cracottes', 'Café']);
    expect(bf.parts).toEqual([{ foodId: 'cottage', grams: 150 }, { foodId: 'oeuf', grams: 204 }, { foodId: 'cracotte', grams: 36 }]);
    expect(bf.kcal).toBe(Math.round(0.98 * 150 + 1.4 * 204 + 3.8 * 36));
  });

  it('les autres repas absorbent l’écart : la journée reste proche de la cible', () => {
    const t = planTotals(day(usual));
    expect(Math.abs(t.kcal - 2600)).toBeLessThanOrEqual(260);
  });

  it('sans petit-déjeuner habituel : inchangé', () => {
    expect(day({ ...answers, usualBreakfast: [] })).toEqual(day(answers));
  });
});
