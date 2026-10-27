// Avis sur le petit-déjeuner habituel : comparaison chiffrée avec la cible d'un repas, et variantes calculées.
// Aucun avis médical : l'app compare des quantités à tes cibles ; valeurs nutritionnelles = moyennes (estimation).

import { food, usualBreakfast, type BreakfastDetails, type NutritionAnswers } from './dayPlan';

type Part = { foodId: string; grams: number };

export interface BreakfastOption {
  id: 'habituel' | 'moins-jaunes' | 'alterner' | 'fruit';
  label: string;
  items: string[];
  parts: Part[];
  kcal: number;
  protein: number;
  /** Écart avec ton petit-déjeuner habituel. */
  dKcal: number;
  dProtein: number;
  why: string;
}

export interface BreakfastReview {
  /** Cible d'un petit-déjeuner d'après ta journée. */
  target: { kcal: number; protein: number };
  options: BreakfastOption[];
  recommendedId: BreakfastOption['id'];
  /** Informations à préciser (demandées une fois, jamais supposées). */
  missing: string[];
  notes: string[];
}

const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const EGG_G = 60;

/** Cible d'un petit-déjeuner : sa part des calories de la journée, et sa part égale des protéines. */
export function breakfastTarget(meals: number | undefined, kcal: number, proteinG: number) {
  const m = meals ?? 4;
  const share = m === 3 ? 0.3 : m === 4 ? 0.25 : 0.2;
  return { kcal: Math.round(kcal * share), protein: Math.round(proteinG / m) };
}

const merge = (parts: Part[], add: Part): Part[] =>
  parts.some((p) => p.foodId === add.foodId) ? parts.map((p) => (p.foodId === add.foodId ? { ...p, grams: p.grams + add.grams } : p)) : [...parts, add];

export function reviewBreakfast(a: NutritionAnswers, kcal: number, proteinG: number): BreakfastReview | undefined {
  const usual = (a.usualBreakfast ?? []).filter((u) => food(u.foodId) && u.grams > 0);
  if (!usual.length) return undefined;
  const coffee = !!a.breakfastCoffee;
  const details: BreakfastDetails | undefined = a.breakfastDetails;
  const target = breakfastTarget(a.meals, kcal, proteinG);
  const base = usualBreakfast(usual, coffee, details);
  const build = (id: BreakfastOption['id'], label: string, parts: Part[], why: string): BreakfastOption => {
    const t = usualBreakfast(parts, coffee, details);
    return { id, label, items: t.items, parts, kcal: t.kcal, protein: t.protein, dKcal: t.kcal - base.kcal, dProtein: t.protein - base.protein, why };
  };

  const options: BreakfastOption[] = [build('habituel', 'Ma version habituelle', usual, 'Ce que tu manges d’habitude, quantités gardées.')];

  const eggs = usual.find((u) => u.foodId === 'oeuf');
  const nEggs = eggs ? Math.round(eggs.grams / EGG_G) : 0;
  const egg = food('oeuf')!;
  const white = food('blanc_oeuf')!;

  if (nEggs >= 3) {
    // Garde 2 œufs entiers ; les protéines des œufs retirés sont reprises par des blancs.
    const removedProtein = (nEggs - 2) * EGG_G * (egg.protein / 100);
    const whites = r5((removedProtein / white.protein) * 100);
    const parts = merge(usual.map((u) => (u.foodId === 'oeuf' ? { ...u, grams: 2 * EGG_G } : u)), { foodId: 'blanc_oeuf', grams: whites });
    options.push(build('moins-jaunes', 'Moins d’œufs entiers', parts, `2 œufs entiers + ${whites} g de blancs : mêmes protéines, moins de jaunes.`));
  }
  if (nEggs >= 2) {
    // Remplace 2 œufs par une autre source de protéines, servie à part.
    const removedProtein = 2 * EGG_G * (egg.protein / 100);
    const other = usual.some((u) => u.foodId === 'cottage') || !usual.some((u) => u.foodId === 'skyr') ? 'cottage' : 'skyr';
    const f = food(other)!;
    const grams = r5((removedProtein / f.protein) * 100);
    const parts = merge(usual.map((u) => (u.foodId === 'oeuf' ? { ...u, grams: u.grams - 2 * EGG_G } : u)), { foodId: other, grams });
    options.push(build('alterner', 'Alterner la source', parts.filter((p) => p.grams > 0), `2 œufs de moins, +${grams} g de ${f.name.toLowerCase()} : protéines proches, aliments séparés.`));
  }
  if (!usual.some((u) => food(u.foodId)?.group === 'fruit')) {
    options.push(build('fruit', 'Ajouter un fruit', merge(usual, { foodId: 'banane', grams: food('banane')!.unitG ?? 120 }), '+1 banane : fruit du matin, sans rien retirer.'));
  }

  // Choix recommandé : la version la plus proche de la cible d'un repas (calories et protéines), à égalité l'habituelle.
  const gap = (o: BreakfastOption) => Math.abs(o.kcal - target.kcal) / target.kcal + Math.abs(o.protein - target.protein) / target.protein;
  const best = options.reduce((m, o) => (gap(o) < gap(m) - 0.02 ? o : m), options[0]!);

  const missing: string[] = [];
  if (details?.fatG === undefined) missing.push('matière grasse de cuisson (huile, beurre)');
  if (coffee && !details?.coffee) missing.push('lait ou sucre dans le café');
  const notes: string[] = [];
  if (usual.some((u) => u.foodId === 'cracotte')) notes.push('Cracottes : valeurs moyennes. Pour ta marque exacte, scanne-la dans Ma cuisine.');
  if (nEggs >= 3) {
    notes.push(`${nEggs} œufs entiers par jour : les repères de santé varient selon les personnes, il n’existe pas de seuil unique. L’app ne tranche pas. Si tu as un cholestérol élevé, un diabète ou des antécédents cardiovasculaires, fais valider la quantité par un professionnel.`);
  }
  return { target, options, recommendedId: best.id, missing, notes };
}
