import { describe, expect, it } from 'vitest';
import { reviewBreakfast, breakfastTarget } from '../src/engine/breakfastReview';
import { buildDayPlan, type NutritionAnswers } from '../src/engine/dayPlan';

const base: NutritionAnswers = {
  wake: '07:00', bedtime: '23:00', meals: 4, proteins: ['oeuf', 'poulet', 'skyr'], carbs: ['avoine', 'riz'], fats: ['amandes', 'huile_olive'], fruits: ['banane'], exclude: [], supplements: [],
  usualBreakfast: [{ foodId: 'oeuf', grams: 240 }, { foodId: 'cracotte', grams: 36 }],
  breakfastCoffee: true,
};

describe('avis sur le petit-déjeuner habituel', () => {
  it('cible d’un repas : part des calories et des protéines', () => {
    expect(breakfastTarget(4, 2600, 140)).toEqual({ kcal: 650, protein: 35 });
  });

  it('4 œufs entiers : propose moins de jaunes, une source alternée et un fruit, avec écarts calculés', () => {
    const r = reviewBreakfast(base, 2600, 140)!;
    expect(r.options.map((o) => o.id)).toEqual(['habituel', 'moins-jaunes', 'alterner', 'fruit']);
    const moins = r.options.find((o) => o.id === 'moins-jaunes')!;
    expect(moins.parts.find((p) => p.foodId === 'oeuf')!.grams).toBe(120);
    expect(moins.parts.find((p) => p.foodId === 'blanc_oeuf')!.grams).toBeGreaterThan(0);
    expect(Math.abs(moins.dProtein)).toBeLessThanOrEqual(3);
    expect(moins.dKcal).toBeLessThan(0);
    const habituel = r.options[0]!;
    expect(habituel.dKcal).toBe(0);
  });

  it('ne valide pas automatiquement : note de prudence sans diagnostic, et rien n’est supposé', () => {
    const r = reviewBreakfast(base, 2600, 140)!;
    expect(r.notes.join(' ')).toMatch(/professionnel/);
    expect(r.notes.join(' ')).not.toMatch(/danger|malade|diagnostic posé/i);
    expect(r.missing).toEqual(['matière grasse de cuisson (huile, beurre)', 'lait ou sucre dans le café']);
  });

  it('demande une seule fois : plus rien à préciser une fois renseigné', () => {
    const r = reviewBreakfast({ ...base, breakfastDetails: { fatG: 5, coffee: 'lait' } }, 2600, 140)!;
    expect(r.missing).toEqual([]);
  });

  it('la matière grasse et le lait du café comptent dans les calories', () => {
    const plain = reviewBreakfast(base, 2600, 140)!.options[0]!.kcal;
    const full = reviewBreakfast({ ...base, breakfastDetails: { fatG: 10, coffee: 'lait-sucre' } }, 2600, 140)!.options[0]!.kcal;
    expect(full - plain).toBe(Math.round(9 * 10 + 41));
  });

  it('le plan du jour utilise ces précisions', () => {
    const p = buildDayPlan({ answers: { ...base, breakfastDetails: { fatG: 5, coffee: 'sucre' } }, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 0 });
    const bf = p.find((e) => e.id === 'petit_dej')!;
    expect(bf.items).toContain('5 g matière grasse de cuisson');
    expect(bf.items).toContain('Café sucré');
  });

  it('pas de petit-déjeuner habituel : pas d’avis', () => {
    expect(reviewBreakfast({ ...base, usualBreakfast: [] }, 2600, 140)).toBeUndefined();
  });
});
