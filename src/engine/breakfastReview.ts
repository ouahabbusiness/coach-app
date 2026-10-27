// Avis sur le petit-déjeuner habituel : comparaison chiffrée avec un repère de repas, et variantes calculées.
// Aucun avis médical : l'app compare des quantités à des repères ajustables ; valeurs nutritionnelles = moyennes (estimation)
// sauf pour un produit personnel (étiquette). Une quantité inconnue n'est jamais comptée comme zéro.

import { coffeeExtras, EGG_COUNT_G, EGG_SOURCE, eggBasis, eggUnit, fatExtras, food, usualBreakfast, type BreakfastDetails, type CustomFood, type NutritionAnswers, type UsualItem } from './dayPlan';

type Part = UsualItem;

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
  /** Ce qui change dans la composition, ingrédient par ingrédient. */
  changes: string[];
  why: string;
}

export interface BreakfastReview {
  /** Repère d'un petit-déjeuner d'après ta journée (ajustable), et comment il est calculé. */
  target: { kcal: number; protein: number; sharePct: number; how: string };
  options: BreakfastOption[];
  recommendedId: BreakfastOption['id'];
  recommendedWhy: string;
  /** Informations à préciser (demandées une fois, jamais supposées). */
  missing: string[];
  /** Éléments dont la quantité est inconnue : non comptés, jamais comptés comme zéro. */
  unknownNotCounted: string[];
  /** Aliments calculés avec une moyenne générique (pas un produit scanné). */
  generic: string[];
  /** Hypothèse sur le poids d'un œuf, et d'où elle vient. */
  eggAssumption?: string;
  eggSource?: string;
  /** Critères exacts de la recommandation. */
  criteria: string;
  notes: string[];
}

const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** Parts de la journée proposées pour le petit-déjeuner (appétit du matin). */
export const BREAKFAST_SHARES = [
  { pct: 20, label: 'Léger' },
  { pct: 25, label: 'Normal' },
  { pct: 35, label: 'Copieux' },
] as const;

/** Repère d'un petit-déjeuner : sa part des calories et des protéines de la journée (25 % par défaut), ajustable. */
export function breakfastTarget(meals: number | undefined, kcal: number, proteinG: number, sharePct?: number) {
  const m = meals ?? 4;
  const defaultPct = m === 3 ? 30 : m === 4 ? 25 : 20;
  const pct = sharePct ?? defaultPct;
  const how = sharePct
    ? `Repère = ${pct} % de ta journée (réglé par toi : appétit du matin).`
    : `Repère = ${pct} % de ta journée (${m} repas par jour). Ajuste-le selon ton appétit : ce n’est pas un quota.`;
  return { kcal: Math.round((kcal * pct) / 100), protein: Math.round((proteinG * pct) / 100), sharePct: pct, how };
}

const merge = (parts: Part[], add: Part): Part[] =>
  parts.some((p) => p.foodId === add.foodId) ? parts.map((p) => (p.foodId === add.foodId ? { ...p, grams: p.grams + add.grams } : p)) : [...parts, add];

const nameOf = (id: string, custom: CustomFood[]) => food(id)?.name ?? custom.find((c) => c.id === id)?.name ?? id;

export interface ReviewOptions {
  custom?: CustomFood[];
}

export function reviewBreakfast(a: NutritionAnswers, kcal: number, proteinG: number, opts: ReviewOptions = {}): BreakfastReview | undefined {
  const custom = opts.custom ?? [];
  const known = (id: string) => !!food(id) || custom.some((c) => c.id === id);
  const usual = (a.usualBreakfast ?? []).filter((u) => known(u.foodId) && u.grams > 0);
  if (!usual.length) return undefined;
  const coffee = !!a.breakfastCoffee;
  const details: BreakfastDetails | undefined = a.breakfastDetails;
  const target = breakfastTarget(a.meals, kcal, proteinG, a.breakfastShare);
  const base = usualBreakfast(usual, coffee, details, custom);
  const gramsOf = (parts: Part[], id: string) => parts.find((p) => p.foodId === id)?.grams ?? 0;
  const describe = (id: string, fromG: number, toG: number) => {
    const f = food(id);
    const unit = id === 'oeuf' ? EGG_COUNT_G : f?.unitG ?? custom.find((c) => c.id === id)?.unitG;
    const fmt = (g: number) => (unit ? `${Math.round(g / unit)}` : `${g} g`);
    return `${nameOf(id, custom)} : ${fmt(fromG)} → ${fmt(toG)}`;
  };
  const build = (id: BreakfastOption['id'], label: string, parts: Part[], why: string): BreakfastOption => {
    const t = usualBreakfast(parts, coffee, details, custom);
    const ids = [...new Set([...usual.map((u) => u.foodId), ...parts.map((p) => p.foodId)])];
    const changes = ids.filter((x) => gramsOf(usual, x) !== gramsOf(parts, x)).map((x) => describe(x, gramsOf(usual, x), gramsOf(parts, x)));
    return { id, label, items: t.items, parts, kcal: t.kcal, protein: t.protein, dKcal: t.kcal - base.kcal, dProtein: t.protein - base.protein, changes, why };
  };

  const options: BreakfastOption[] = [build('habituel', 'Ma version habituelle', usual, 'Ce que tu manges d’habitude, quantités gardées.')];

  const egg = food('oeuf')!;
  const white = food('blanc_oeuf')!;
  const unit = eggUnit(details); // poids comestible d'un œuf (g)
  const eggs = usual.find((u) => u.foodId === 'oeuf');
  const nEggs = eggs ? Math.round(eggs.grams / EGG_COUNT_G) : 0; // les œufs sont enregistrés « nombre × 60 »

  if (nEggs >= 3) {
    // Garde 2 œufs entiers ; les protéines des œufs retirés sont reprises par des blancs (même convention de poids).
    const removedProtein = (nEggs - 2) * unit * (egg.protein / 100);
    const whites = r5((removedProtein / white.protein) * 100);
    const parts = merge(usual.map((u) => (u.foodId === 'oeuf' ? { ...u, grams: 2 * EGG_COUNT_G } : u)), { foodId: 'blanc_oeuf', grams: whites });
    options.push(build('moins-jaunes', 'Moins d’œufs entiers', parts, `2 œufs entiers + ${whites} g de blancs : protéines proches, moins de jaunes.`));
  }
  if (nEggs >= 2) {
    // Remplace 2 œufs par une autre source de protéines, servie à part.
    const removedProtein = 2 * unit * (egg.protein / 100);
    const other = usual.some((u) => u.foodId === 'cottage') || !usual.some((u) => u.foodId === 'skyr') ? 'cottage' : 'skyr';
    const f = food(other)!;
    const grams = r5((removedProtein / f.protein) * 100);
    const parts = merge(usual.map((u) => (u.foodId === 'oeuf' ? { ...u, grams: u.grams - 2 * EGG_COUNT_G } : u)), { foodId: other, grams });
    options.push(build('alterner', 'Alterner la source', parts.filter((p) => p.grams > 0), `2 œufs de moins, +${grams} g de ${f.name.toLowerCase()} : protéines proches, aliments séparés.`));
  }
  if (!usual.some((u) => food(u.foodId)?.group === 'fruit')) {
    options.push(build('fruit', 'Ajouter un fruit', merge(usual, { foodId: 'banane', grams: food('banane')!.unitG ?? 120 }), '+1 banane : fruit du matin, sans rien retirer.'));
  }

  // Recommandation : ta version si elle colle déjà au repère (± 15 % sur les calories et les protéines) ; sinon la variante la plus proche.
  const gap = (o: BreakfastOption) => Math.abs(o.kcal - target.kcal) / target.kcal + Math.abs(o.protein - target.protein) / target.protein;
  const close = (o: BreakfastOption) => Math.abs(o.kcal - target.kcal) / target.kcal <= 0.15 && Math.abs(o.protein - target.protein) / target.protein <= 0.15;
  const habituel = options[0]!;
  const best = options.reduce((m, o) => (gap(o) < gap(m) - 0.02 ? o : m), habituel);
  const recommended = close(habituel) ? habituel : best;
  const pct = (v: number, t: number) => `${Math.round((v / t) * 100)} %`;
  const recommendedWhy =
    recommended.id === 'habituel'
      ? `Ta version colle déjà à ton repère (${pct(habituel.kcal, target.kcal)} des calories, ${pct(habituel.protein, target.protein)} des protéines) : rien à changer.`
      : `Ta version est à ${pct(habituel.kcal, target.kcal)} des calories et ${pct(habituel.protein, target.protein)} des protéines du repère ; celle-ci est à ${pct(recommended.kcal, target.kcal)} et ${pct(recommended.protein, target.protein)}. Compare aussi ce qui change dans la composition.`;

  const missing: string[] = [];
  const unknownNotCounted: string[] = [];
  const fat = fatExtras(details);
  if (details?.fatUnknown) unknownNotCounted.push('matière grasse de cuisson');
  else if (!fat.known) missing.push('matière grasse de cuisson (type et quantité)');
  if (coffee) {
    const c = coffeeExtras(details);
    if (details?.coffeeUnknown) unknownNotCounted.push('lait / sucre du café');
    else if (!c.known) missing.push('lait et sucre dans le café (type et quantité)');
  }

  const generic = usual.filter((u) => !!food(u.foodId)).map((u) => nameOf(u.foodId, custom).toLowerCase());
  const notes: string[] = [];
  if (nEggs >= 3) {
    notes.push(`Rappel choisi par l’app, pas un seuil scientifique : ${nEggs} œufs entiers par jour. Les repères de santé varient selon les personnes ; si tu as un cholestérol élevé, un diabète ou des antécédents cardiovasculaires, fais valider la quantité par un professionnel.`);
  }
  const basis = eggBasis(details);
  const eggAssumption = eggs
    ? basis === 'pesé'
      ? `Œuf : ${unit} g de contenu sans coquille, pesé par toi.`
      : basis === 'calibre'
        ? `Œuf calibre ${details!.eggCalibre} : ≈ ${unit} g comestibles par œuf (estimation, le calibre est un poids avec coquille).`
        : `Calibre inconnu : œuf M supposé, ≈ ${unit} g comestibles (estimation). Précise le calibre, ou pèse le contenu, pour affiner.`
    : undefined;
  const criteria = `Critères : les calories ET les protéines, chacune à ± 15 % du repère, pour garder ta version. Sinon, la version dont l’écart cumulé (calories + protéines) est le plus faible. Cela ne juge pas la qualité du repas (fibres, graisses, satiété).`;
  return { target, options, recommendedId: recommended.id, recommendedWhy, missing, unknownNotCounted, generic, eggAssumption, eggSource: eggs ? EGG_SOURCE : undefined, criteria, notes };
}
