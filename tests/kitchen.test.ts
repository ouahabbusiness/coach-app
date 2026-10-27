// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { BASE_FOODS, dishNutrients, fromOpenFoodFacts, parseMeal, totalOf, type Dish, type KitchenFood } from '../src/engine/kitchen';

const whey: KitchenFood = { id: 'whey', name: 'Whey chocolat', kcal: 380, protein: 76, unitG: 30, unitName: 'dose', source: 'étiquette', aliases: ['prot', 'shaker'] };
const foods = [...BASE_FOODS, whey];
const rizPoulet: Dish = { id: 'rp', name: 'Riz poulet maison', ingredients: [{ foodId: 'riz', grams: 600 }, { foodId: 'poulet', grams: 400 }, { foodId: 'huile_olive', grams: 20 }], portions: 2 };

describe('ma cuisine', () => {
  it('plat maison : valeurs par portion', () => {
    expect(dishNutrients(rizPoulet, foods)).toEqual({ kcal: 720, protein: 54, grams: 510 });
  });

  it('« 3 œufs, 80 g d’avoine, 1 banane » → unités et grammes reconnus', () => {
    const r = parseMeal('3 œufs, 80 g d’avoine, 1 banane', foods, []);
    expect(r.unknown).toEqual([]);
    expect(r.items.map((i) => [i.ref, i.qty, i.unit])).toEqual([
      ['oeuf', 3, 'unité'],
      ['avoine', 80, 'g'],
      ['banane', 1, 'unité'],
    ]);
    const t = totalOf(r.items, foods, []);
    expect(t.kcal).toBe(Math.round(140 * 1.53) + Math.round(370 * 0.8) + Math.round(90 * 1.2));
  });

  it('mes plats et mes alias : « 1 portion riz poulet + 1 shaker »', () => {
    const r = parseMeal('1 portion riz poulet + 1 shaker', foods, [rizPoulet]);
    expect(r.items.map((i) => i.ref)).toEqual(['rp', 'whey']);
    expect(totalOf(r.items, foods, [rizPoulet])).toEqual({ kcal: 720 + 114, protein: 54 + 23 });
  });

  it('inconnu jamais deviné', () => {
    expect(parseMeal('2 tacos maison', foods, []).unknown).toEqual(['2 tacos maison']);
  });

  it('Open Food Facts : valeurs pour 100 g et portion de l’étiquette', () => {
    const f = fromOpenFoodFacts('3760', { product_name: 'Whey Native', brands: 'Protimuscle, X', nutriments: { 'energy-kcal_100g': 379, proteins_100g: 77 }, serving_quantity: '30' });
    expect(f).toMatchObject({ id: 'off-3760', kcal: 379, protein: 77, unitG: 30, brand: 'Protimuscle', source: 'Open Food Facts' });
    expect(fromOpenFoodFacts('1', { product_name: 'X', nutriments: {} })).toBeUndefined();
  });
});
