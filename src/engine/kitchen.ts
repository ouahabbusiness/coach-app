// « Ma cuisine » : produits personnels (étiquette, code-barres), plats maison, et lecture d'un repas écrit
// (« 3 œufs, 80 g d'avoine, 1 portion de riz-poulet ») → calories et protéines.
// Les valeurs viennent de l'étiquette ou d'Open Food Facts quand c'est possible ; sinon des moyennes (estimation).

import { FOODS, type Food } from './dayPlan';

export type FoodSource = 'étiquette' | 'Open Food Facts' | 'moyenne' | 'calculé';

export interface KitchenFood {
  id: string;
  name: string;
  /** Pour 100 g (ou 100 ml). */
  kcal: number;
  protein: number;
  carbs?: number;
  fat?: number;
  /** Une unité (œuf, tranche, dose de whey…) en grammes. */
  unitG?: number;
  unitName?: string;
  barcode?: string;
  brand?: string;
  source: FoodSource;
  /** Mots qui désignent cet aliment dans un texte (« whey », « prot »). */
  aliases?: string[];
}

export interface Dish {
  id: string;
  name: string;
  ingredients: { foodId: string; grams: number }[];
  portions: number;
  aliases?: string[];
}

export interface Nutrients {
  kcal: number;
  protein: number;
}

/** Aliments de base (moyennes) convertis au format cuisine. */
export const BASE_FOODS: KitchenFood[] = FOODS.map((f: Food) => ({ id: f.id, name: f.name, kcal: f.kcal, protein: f.protein, unitG: f.unitG, unitName: f.unitName, source: 'moyenne' as const }));

export function dishNutrients(d: Dish, foods: KitchenFood[]): Nutrients & { grams: number } {
  let kcal = 0;
  let protein = 0;
  let grams = 0;
  for (const ing of d.ingredients) {
    const f = foods.find((x) => x.id === ing.foodId);
    if (!f) continue;
    kcal += (f.kcal * ing.grams) / 100;
    protein += (f.protein * ing.grams) / 100;
    grams += ing.grams;
  }
  const p = Math.max(1, d.portions);
  return { kcal: Math.round(kcal / p), protein: Math.round(protein / p), grams: Math.round(grams / p) };
}

export interface LogItem {
  ref: string;
  kind: 'food' | 'dish';
  qty: number;
  unit: 'g' | 'unité' | 'portion';
  label: string;
}

export function itemNutrients(it: LogItem, foods: KitchenFood[], dishes: Dish[]): Nutrients {
  if (it.kind === 'dish') {
    const d = dishes.find((x) => x.id === it.ref);
    if (!d) return { kcal: 0, protein: 0 };
    const n = dishNutrients(d, foods);
    return { kcal: Math.round(n.kcal * it.qty), protein: Math.round(n.protein * it.qty) };
  }
  const f = foods.find((x) => x.id === it.ref);
  if (!f) return { kcal: 0, protein: 0 };
  const grams = it.unit === 'g' ? it.qty : it.qty * (f.unitG ?? 100);
  return { kcal: Math.round((f.kcal * grams) / 100), protein: Math.round((f.protein * grams) / 100) };
}

export const totalOf = (items: LogItem[], foods: KitchenFood[], dishes: Dish[]): Nutrients =>
  items.reduce((t, i) => {
    const n = itemNutrients(i, foods, dishes);
    return { kcal: t.kcal + n.kcal, protein: t.protein + n.protein };
  }, { kcal: 0, protein: 0 });

/** Normalise pour comparer : minuscules, sans accents, sans pluriel simple. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w))
    .join(' ');
}

const STOP = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'un', 'une', 'avec', 'et', 'portion', 'portions', 'part', 'parts', 'g', 'gr', 'ml']);

/** Score de correspondance entre un morceau de texte et un nom (mots en commun). */
function score(chunk: string, name: string, aliases: string[] = []): number {
  const words = norm(chunk).split(' ').filter((w) => !STOP.has(w) && !/^\d/.test(w));
  if (!words.length) return 0;
  let best = 0;
  for (const cand of [name, ...aliases]) {
    const c = norm(cand).split(' ');
    const hit = words.filter((w) => c.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x))))).length;
    best = Math.max(best, hit / words.length);
  }
  return best;
}

/**
 * Lit un repas écrit, morceau par morceau (séparés par virgules, « + » ou « et »).
 * Quantités : « 3 œufs » (unités), « 80 g … », « 1,5 portion de … » ; sans nombre → 1 unité / 1 portion / 100 g.
 * Un morceau non reconnu est renvoyé dans `unknown`, jamais deviné.
 */
export function parseMeal(text: string, foods: KitchenFood[], dishes: Dish[]): { items: LogItem[]; unknown: string[] } {
  const items: LogItem[] = [];
  const unknown: string[] = [];
  for (const raw of text.split(/,|\+|\bet\b|\n/i).map((x) => x.trim()).filter(Boolean)) {
    const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|grammes?|ml)?\b/i);
    const qty = m ? Number(m[1]!.replace(',', '.')) : undefined;
    const grams = !!m?.[2];
    const candidates = [
      ...dishes.map((d) => ({ kind: 'dish' as const, id: d.id, name: d.name, s: score(raw, d.name, d.aliases) })),
      ...foods.map((f) => ({ kind: 'food' as const, id: f.id, name: f.name, s: score(raw, f.name, f.aliases), f })),
    ].sort((a, b) => b.s - a.s);
    const best = candidates[0];
    if (!best || best.s < 0.5) {
      unknown.push(raw);
      continue;
    }
    if (best.kind === 'dish') {
      items.push({ ref: best.id, kind: 'dish', qty: qty ?? 1, unit: 'portion', label: `${qty ?? 1} × ${best.name}` });
      continue;
    }
    const f = foods.find((x) => x.id === best.id)!;
    // Avec « g » ou pour un aliment qui ne se compte pas : grammes (100 g par défaut). Sinon : unités.
    if (grams || !f.unitG) {
      const g = qty ?? 100;
      items.push({ ref: f.id, kind: 'food', qty: g, unit: 'g', label: `${g} g ${f.name.toLowerCase()}` });
    } else {
      const n = qty ?? 1;
      items.push({ ref: f.id, kind: 'food', qty: n, unit: 'unité', label: `${n} ${f.unitName ?? f.name}${n > 1 ? 's' : ''}` });
    }
  }
  return { items, unknown };
}

/** Produit Open Food Facts → aliment de ma cuisine (valeurs pour 100 g de l'étiquette). */
export function fromOpenFoodFacts(barcode: string, p: { product_name?: string; brands?: string; nutriments?: Record<string, number | undefined>; serving_quantity?: number | string }): KitchenFood | undefined {
  const n = p.nutriments ?? {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] !== undefined ? Math.round(Number(n['energy_100g']) / 4.184) : undefined);
  const protein = n['proteins_100g'];
  if (kcal === undefined || protein === undefined || !p.product_name) return undefined;
  const serving = Number(p.serving_quantity);
  return {
    id: `off-${barcode}`,
    name: p.product_name,
    brand: p.brands?.split(',')[0]?.trim(),
    kcal: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    carbs: n['carbohydrates_100g'],
    fat: n['fat_100g'],
    unitG: Number.isFinite(serving) && serving > 0 ? serving : undefined,
    unitName: Number.isFinite(serving) && serving > 0 ? 'portion' : undefined,
    barcode,
    source: 'Open Food Facts',
  };
}
