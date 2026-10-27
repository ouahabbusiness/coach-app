import { describe, expect, it } from 'vitest';
import { reviewBreakfast, breakfastTarget } from '../src/engine/breakfastReview';
import { buildDayPlan, coffeeExtras, fatExtras, usualBreakfast, type CustomFood, type NutritionAnswers } from '../src/engine/dayPlan';

const base: NutritionAnswers = {
  wake: '07:00', bedtime: '23:00', meals: 4, proteins: ['oeuf', 'poulet', 'skyr'], carbs: ['avoine', 'riz'], fats: ['amandes', 'huile_olive'], fruits: ['banane'], exclude: [], supplements: [],
  usualBreakfast: [{ foodId: 'oeuf', grams: 240 }, { foodId: 'cracotte', grams: 36 }],
  breakfastCoffee: true,
};
const plan = (a: NutritionAnswers, extra: object = {}) => buildDayPlan({ answers: a, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 0, ...extra });

describe('repère du petit-déjeuner', () => {
  it('par défaut : part standard de la journée, expliquée', () => {
    const t = breakfastTarget(4, 2600, 140);
    expect(t).toMatchObject({ kcal: 650, protein: 35, sharePct: 25 });
    expect(t.how).toMatch(/pas un quota/);
  });
  it('ajustable selon l’appétit du matin', () => {
    expect(breakfastTarget(4, 2600, 140, 20)).toMatchObject({ kcal: 520, protein: 28, sharePct: 20 });
    expect(breakfastTarget(4, 2600, 140, 35).kcal).toBe(910);
  });
});

describe('œufs : poids sans coquille', () => {
  it('moyenne 60 g affichée comme estimation, calibre choisi sinon', () => {
    expect(reviewBreakfast(base, 2600, 140)!.eggAssumption).toMatch(/moyenne estimée/);
    const r = reviewBreakfast({ ...base, usualBreakfast: [{ foodId: 'oeuf', grams: 4 * 53 }], breakfastDetails: { eggG: 53 } }, 2600, 140)!;
    expect(r.eggAssumption).toMatch(/53 g.*réglé par toi/);
  });
  it('4 œufs de 53 g donnent moins de calories que 4 œufs de 60 g', () => {
    const a = usualBreakfast([{ foodId: 'oeuf', grams: 4 * 53 }], false, { eggG: 53 });
    const b = usualBreakfast([{ foodId: 'oeuf', grams: 4 * 60 }], false);
    expect(a.items).toEqual(['4 œufs']);
    expect(a.kcal).toBeLessThan(b.kcal);
  });
});

describe('café et cuisson : quantités, inconnu ≠ zéro', () => {
  it('café noir déclaré : compté à 0 et connu', () => {
    expect(coffeeExtras({ milkMl: 0, sugarG: 0 })).toMatchObject({ kcal: 0, known: true, label: 'Café noir' });
  });
  it('lait et sucre en quantités : calculés', () => {
    const c = coffeeExtras({ milkKind: 'entier', milkMl: 100, sugarG: 8 });
    expect(c.known).toBe(true);
    expect(Math.round(c.kcal)).toBe(Math.round(64 + 8 * 3.9));
  });
  it('rien de précisé ou inconnu : non compté, signalé, jamais zéro déguisé', () => {
    expect(coffeeExtras({})).toMatchObject({ known: false });
    expect(coffeeExtras({ coffeeUnknown: true })).toMatchObject({ known: false, kcal: 0 });
    const r = reviewBreakfast({ ...base, breakfastDetails: { coffeeUnknown: true, fatUnknown: true } }, 2600, 140)!;
    expect(r.missing).toEqual([]);
    expect(r.unknownNotCounted).toEqual(['matière grasse de cuisson', 'lait / sucre du café']);
  });
  it('cuisson : type et quantité (beurre ≠ huile)', () => {
    expect(fatExtras({ fatKind: 'beurre', fatG: 10 }).kcal).toBe(74);
    expect(fatExtras({ fatKind: 'huile', fatG: 10 }).kcal).toBe(90);
    expect(fatExtras({ fatG: 0 })).toMatchObject({ known: true, kcal: 0 });
    expect(fatExtras({})).toMatchObject({ known: false });
  });
  it('demande une seule fois : plus rien à préciser une fois renseigné', () => {
    const r = reviewBreakfast({ ...base, breakfastDetails: { fatG: 5, fatKind: 'huile', milkMl: 0, sugarG: 0 } }, 2600, 140)!;
    expect(r.missing).toEqual([]);
  });
  it('manque signalé tant que rien n’est précisé', () => {
    const r = reviewBreakfast(base, 2600, 140)!;
    expect(r.missing).toEqual(['matière grasse de cuisson (type et quantité)', 'lait et sucre dans le café (type et quantité)']);
  });
  it('le plan du jour utilise ces précisions', () => {
    const bf = plan({ ...base, breakfastDetails: { fatG: 5, fatKind: 'huile', milkKind: 'demi', milkMl: 50, sugarG: 4 } }).find((e) => e.id === 'petit_dej')!;
    expect(bf.items).toContain('5 g huile de cuisson');
    expect(bf.items.some((x) => x.startsWith('Café + 50 ml'))).toBe(true);
  });
});

describe('produit scanné à la place du générique', () => {
  const cracottes: CustomFood = { id: 'kf-cracotte-x', name: 'Cracottes Marque X', kcal: 400, protein: 12, unitG: 10, unitName: 'cracotte' };
  const withCustom: NutritionAnswers = { ...base, breakfastCoffee: false, usualBreakfast: [{ foodId: 'kf-cracotte-x', grams: 40 }] };
  it('les valeurs du produit remplacent la moyenne dans le calcul', () => {
    const r = reviewBreakfast(withCustom, 2600, 140, { custom: [cracottes] })!;
    expect(r.options[0]!.kcal).toBe(160);
    expect(r.options[0]!.protein).toBe(5);
    expect(r.generic).toEqual([]);
  });
  it('sans produit scanné : l’écran peut afficher « valeurs génériques »', () => {
    const r = reviewBreakfast(base, 2600, 140)!;
    expect(r.generic).toEqual(['œufs', 'cracottes']);
  });
  it('le plan du jour utilise aussi le produit', () => {
    const bf = plan(withCustom, { customFoods: [cracottes] }).find((e) => e.id === 'petit_dej')!;
    expect(bf.items[0]).toContain('Cracottes Marque X');
    expect(bf.kcal).toBe(160);
  });
});

describe('avis : recommandation motivée et composition', () => {
  it('4 œufs : variantes avec écarts et changements ingrédient par ingrédient', () => {
    const r = reviewBreakfast(base, 2600, 140)!;
    expect(r.options.map((o) => o.id)).toEqual(['habituel', 'moins-jaunes', 'alterner', 'fruit']);
    const moins = r.options.find((o) => o.id === 'moins-jaunes')!;
    expect(moins.changes.join(' | ')).toMatch(/Œufs : 4 → 2/);
    expect(moins.changes.join(' | ')).toMatch(/Blancs d’œuf : 0 g → \d+ g/);
    expect(Math.abs(moins.dProtein)).toBeLessThanOrEqual(3);
    expect(r.options[0]!.dKcal).toBe(0);
    expect(r.recommendedWhy.length).toBeGreaterThan(10);
  });
  it('garde ta version quand elle colle déjà au repère', () => {
    const a: NutritionAnswers = { ...base, usualBreakfast: [{ foodId: 'oeuf', grams: 3 * 60 }, { foodId: 'avoine', grams: 60 }, { foodId: 'banane', grams: 120 }] };
    const r = reviewBreakfast(a, 2600, 140)!;
    expect(r.recommendedId).toBe('habituel');
    expect(r.recommendedWhy).toMatch(/rien à changer/);
  });
  it('trois œufs ou plus : rappel choisi par l’app, jamais présenté comme frontière scientifique', () => {
    const r = reviewBreakfast(base, 2600, 140)!;
    const t = r.notes.join(' ');
    expect(t).toMatch(/pas un seuil scientifique/);
    expect(t).toMatch(/professionnel/);
  });
  it('pas de petit-déjeuner habituel : pas d’avis', () => {
    expect(reviewBreakfast({ ...base, usualBreakfast: [] }, 2600, 140)).toBeUndefined();
  });
});

describe('aujourd’hui seulement ≠ habitude', () => {
  it('l’override change le plan du jour sans toucher aux réponses', () => {
    const answers = JSON.parse(JSON.stringify(base)) as NutritionAnswers;
    const before = JSON.stringify(answers);
    const p = plan(answers, { breakfastOverride: [{ foodId: 'oeuf', grams: 120 }, { foodId: 'blanc_oeuf', grams: 130 }] });
    expect(p.find((e) => e.id === 'petit_dej')!.items).toContain('2 œufs');
    expect(JSON.stringify(answers)).toBe(before);
    const normal = plan(answers).find((e) => e.id === 'petit_dej')!;
    expect(normal.items).toContain('4 œufs');
  });
});
