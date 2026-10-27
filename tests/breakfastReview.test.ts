import { describe, expect, it } from 'vitest';
import { reviewBreakfast, breakfastTarget } from '../src/engine/breakfastReview';
import { buildDayPlan, shoppingList, coffeeExtras, eggBasis, eggUnit, fatExtras, usualBreakfast, type CustomFood, type NutritionAnswers } from '../src/engine/dayPlan';

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

describe('œufs : calibre estimé ≠ poids pesé', () => {
  it('calibre inconnu : œuf M supposé, annoncé comme estimation avec sa source', () => {
    const r = reviewBreakfast(base, 2600, 140)!;
    expect(r.eggAssumption).toMatch(/Calibre inconnu : œuf M supposé.*51 g.*estimation/);
    expect(r.eggSource).toMatch(/poids avec coquille/);
    expect(r.eggSource).toMatch(/USDA/);
  });
  it('calibre connu : intervalle avec coquille → poids comestible estimé, pas un poids exact', () => {
    const r = reviewBreakfast({ ...base, breakfastDetails: { eggCalibre: 'L' } }, 2600, 140)!;
    expect(r.eggAssumption).toMatch(/calibre L.*60 g comestibles.*estimation.*poids avec coquille/);
    expect(eggUnit({ eggCalibre: 'S' })).toBeLessThan(eggUnit({ eggCalibre: 'M' }));
    expect(eggUnit({ eggCalibre: 'XL' })).toBeGreaterThan(eggUnit({ eggCalibre: 'L' }));
  });
  it('contenu pesé : le poids saisi est utilisé tel quel et prime sur le calibre', () => {
    expect(eggUnit({ eggG: 48, eggCalibre: 'XL' })).toBe(48);
    expect(eggBasis({ eggG: 48 })).toBe('pesé');
    expect(reviewBreakfast({ ...base, breakfastDetails: { eggG: 48 } }, 2600, 140)!.eggAssumption).toMatch(/48 g de contenu sans coquille, pesé par toi/);
  });
  it('changer de calibre ne change pas le nombre d’œufs, seulement les calories', () => {
    const list = [{ foodId: 'oeuf', grams: 4 * 60 }];
    const s = usualBreakfast(list, false, { eggCalibre: 'S' });
    const xl = usualBreakfast(list, false, { eggCalibre: 'XL' });
    expect(s.items).toEqual(['4 œufs']);
    expect(xl.items).toEqual(['4 œufs']);
    expect(s.kcal).toBeLessThan(xl.kcal);
    expect(xl.kcal).toBe(Math.round(1.4 * 4 * 69));
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
  it('garde ta version quand elle colle vraiment au repère (calories ET protéines à ± 15 %)', () => {
    const a: NutritionAnswers = { ...base, usualBreakfast: [{ foodId: 'oeuf', grams: 4 * 60 }, { foodId: 'avoine', grams: 80 }, { foodId: 'banane', grams: 120 }] };
    const r = reviewBreakfast(a, 2600, 140)!;
    const h = r.options[0]!;
    expect(Math.abs(h.kcal - r.target.kcal) / r.target.kcal).toBeLessThanOrEqual(0.15);
    expect(Math.abs(h.protein - r.target.protein) / r.target.protein).toBeLessThanOrEqual(0.15);
    expect(r.recommendedId).toBe('habituel');
    expect(r.recommendedWhy).toMatch(/rien à changer/);
  });
  it('ne dit jamais « rien à changer » quand ta version est loin du repère et qu’aucune variante ne fait mieux', () => {
    const a: NutritionAnswers = { ...base, usualBreakfast: [{ foodId: 'avoine', grams: 40 }, { foodId: 'banane', grams: 120 }] };
    const r = reviewBreakfast(a, 2600, 140)!;
    expect(r.options.map((o) => o.id)).toEqual(['habituel']);
    expect(r.recommendedId).toBe('habituel');
    expect(r.recommendedWhy).not.toMatch(/rien à changer|colle déjà/);
    expect(r.recommendedWhy).toMatch(/Aucune variante ne te rapproche davantage/);
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

describe('frigo : un aliment manque à la maison', () => {
  const habit: NutritionAnswers = {
    ...base,
    usualBreakfast: [{ foodId: 'cottage', grams: 150 }, { foodId: 'oeuf', grams: 4 * 60 }, { foodId: 'cracotte', grams: 36 }],
  };
  const fridge = ['oeuf', 'cracotte', 'skyr', 'poulet', 'riz'];

  it('le plan signale ce qui manque mais ne remplace rien tout seul', () => {
    const bf = buildDayPlan({ answers: { ...habit, pantry: fridge }, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 1 }).find((e) => e.id === 'petit_dej')!;
    expect(bf.missing).toEqual(['Cottage cheese']);
    expect(bf.items).toContain('150 g cottage cheese');
  });

  it('frigo non déclaré ou vide : rien n’est signalé comme manquant', () => {
    for (const pantry of [undefined, []]) {
      const bf = buildDayPlan({ answers: { ...habit, pantry }, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: 1 }).find((e) => e.id === 'petit_dej')!;
      expect(bf.missing).toBeUndefined();
    }
  });

  it('l’avis propose « avec ce que tu as », avec les protéines gardées, et le recommande', () => {
    const r = reviewBreakfast({ ...habit, pantry: fridge }, 2600, 140)!;
    expect(r.missingNames).toEqual(['Cottage cheese']);
    const v = r.options.find((o) => o.id === 'sans-manquant')!;
    expect(v.changes.join(' | ')).toMatch(/Cottage cheese : 150 g → 0 g/);
    expect(v.changes.join(' | ')).toMatch(/Skyr : 0 g → \d+ g/);
    expect(v.parts.some((p) => p.foodId === 'cottage')).toBe(false);
    expect(Math.abs(v.dProtein)).toBeLessThanOrEqual(2);
    expect(r.recommendedId).toBe('sans-manquant');
    expect(r.recommendedWhy).toMatch(/Il te manque Cottage cheese à la maison/);
  });

  it('rien à la maison pour remplacer : on le dit, on ne devine pas', () => {
    const r = reviewBreakfast({ ...habit, usualBreakfast: [{ foodId: 'cottage', grams: 150 }, { foodId: 'cracotte', grams: 36 }], pantry: ['cracotte', 'poulet'] }, 2600, 140)!;
    expect(r.options.some((o) => o.id === 'sans-manquant')).toBe(false);
    expect(r.noSubstitute).toEqual(['Cottage cheese']);
    expect(r.notes.join(' ')).toMatch(/Rien à la maison pour remplacer : Cottage cheese/);
  });

  it('plusieurs manques : chacun remplacé par ce qui est au frigo', () => {
    const r = reviewBreakfast({ ...habit, pantry: ['skyr', 'avoine', 'poulet'] }, 2600, 140)!;
    expect(r.missingNames).toEqual(['Cottage cheese', 'Œufs', 'Cracottes']);
    const v = r.options.find((o) => o.id === 'sans-manquant')!;
    expect(v.parts.every((p) => ['skyr', 'avoine'].includes(p.foodId))).toBe(true);
  });
});

describe('frigo déclaré : cohérence des variantes', () => {
  const eggs: NutritionAnswers = { ...base, breakfastCoffee: false, usualBreakfast: [{ foodId: 'oeuf', grams: 4 * 60 }, { foodId: 'avoine', grams: 60 }] };

  it('une variante n’utilise que ce qui est au frigo : pas de blancs, de cottage ni de banane si absents', () => {
    const r = reviewBreakfast({ ...eggs, pantry: ['oeuf', 'avoine', 'skyr'] }, 2600, 140)!;
    const ids = r.options.map((o) => o.id);
    expect(ids).not.toContain('moins-jaunes'); // pas de blancs d'œuf au frigo
    expect(ids).not.toContain('fruit'); // aucun fruit au frigo
    const alt = r.options.find((o) => o.id === 'alterner')!;
    expect(alt.parts.some((p) => p.foodId === 'skyr')).toBe(true);
    expect(alt.parts.some((p) => p.foodId === 'cottage')).toBe(false);
  });

  it('frigo non déclaré : variantes inchangées', () => {
    expect(reviewBreakfast(eggs, 2600, 140)!.options.map((o) => o.id)).toEqual(['habituel', 'moins-jaunes', 'alterner', 'fruit']);
  });

  it('un aliment manque : les variantes qui le contiendraient ne sont pas proposées', () => {
    const r = reviewBreakfast({ ...eggs, usualBreakfast: [...eggs.usualBreakfast!, { foodId: 'cottage', grams: 100 }], pantry: ['oeuf', 'avoine', 'skyr', 'blanc_oeuf', 'banane'] }, 2600, 140)!;
    expect(r.options.map((o) => o.id)).toEqual(['habituel', 'sans-manquant']);
  });

  it('remplacement partiel : la version est étiquetée « incomplet », dit ce qui est retiré et n’est pas recommandée aveuglément', () => {
    const habit: NutritionAnswers = { ...eggs, usualBreakfast: [{ foodId: 'cottage', grams: 150 }, { foodId: 'avoine', grams: 60 }], pantry: ['skyr', 'poulet'] };
    const r = reviewBreakfast(habit, 2600, 140)!;
    expect(r.missingNames).toEqual(['Cottage cheese', 'Flocons d’avoine']);
    expect(r.noSubstitute).toEqual(['Flocons d’avoine']);
    const v = r.options.find((o) => o.id === 'sans-manquant')!;
    expect(v.label).toMatch(/incomplet/);
    expect(v.why).toMatch(/Flocons d’avoine retiré : rien au frigo pour le remplacer/);
    expect(r.recommendedWhy).not.toMatch(/gardent tes/);
  });

  it('rien à remplacer du tout : on le dit et on propose les courses', () => {
    const r = reviewBreakfast({ ...eggs, usualBreakfast: [{ foodId: 'cottage', grams: 150 }], pantry: ['poulet'] }, 2600, 140)!;
    expect(r.recommendedId).toBe('habituel');
    expect(r.recommendedWhy).toMatch(/rien au frigo ne peut le remplacer/);
  });

  it('critères affichés : complets', () => {
    const t = reviewBreakfast(eggs, 2600, 140)!.criteria;
    expect(t).toMatch(/calories ET les protéines/);
    expect(t).toMatch(/2 points près/);
    expect(t).toMatch(/Avec ce que tu as/);
  });
});

describe('courses : les œufs se comptent en œufs, pas en grammes', () => {
  it('4 œufs de calibre L par jour sur 7 jours : 28 œufs, soit 30 (5 boîtes de 6)', () => {
    const a: NutritionAnswers = { ...base, breakfastCoffee: false, usualBreakfast: [{ foodId: 'oeuf', grams: 4 * 60 }], breakfastDetails: { eggCalibre: 'L' } };
    const week = Array.from({ length: 7 }, (_, d) => buildDayPlan({ answers: a, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: d }));
    const line = shoppingList(week).find((l) => l.foodId === 'oeuf')!;
    expect(line.buy).toBe('30 œufs (5 boîtes de 6)');
  });
  it('même nombre d’œufs en calibre S ou XL', () => {
    for (const eggCalibre of ['S', 'XL'] as const) {
      const a: NutritionAnswers = { ...base, breakfastCoffee: false, usualBreakfast: [{ foodId: 'oeuf', grams: 4 * 60 }], breakfastDetails: { eggCalibre } };
      const week = Array.from({ length: 7 }, (_, d) => buildDayPlan({ answers: a, kcal: 2600, proteinG: 140, waterMl: 3000, dayIndex: d }));
      expect(shoppingList(week).find((l) => l.foodId === 'oeuf')!.buy).toMatch(/^30 œufs/);
    }
  });
});
