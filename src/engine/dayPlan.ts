// Plan du jour : repas avec quantités, compléments DÉCLARÉS par l'utilisateur, eau répartie dans la journée.
// Valeurs nutritionnelles : moyennes indicatives pour 100 g (ordre de grandeur des tables Ciqual/ANSES),
// à remplacer par l'étiquette quand elle est connue. Tout est une estimation.
// L'app ne recommande aucun complément : elle place seulement ceux que l'utilisateur déclare, à la dose qu'il recopie.

import { fromMin, toMin } from './planning';

export type FoodGroup = 'proteine' | 'glucide' | 'lipide' | 'legume' | 'fruit';

export interface Food {
  id: string;
  name: string;
  group: FoodGroup;
  /** Pour 100 g (ou 100 ml). */
  kcal: number;
  protein: number;
  /** Poids d'une unité si l'aliment se compte (œuf, banane, tranche). */
  unitG?: number;
  unitName?: string;
  breakfast?: boolean;
}

export const FOODS: Food[] = [
  { id: 'oeuf', name: 'Œufs', group: 'proteine', kcal: 140, protein: 12.5, unitG: 60, unitName: 'œuf', breakfast: true },
  { id: 'poulet', name: 'Blanc de poulet', group: 'proteine', kcal: 120, protein: 23 },
  { id: 'dinde', name: 'Escalope de dinde', group: 'proteine', kcal: 110, protein: 24 },
  { id: 'boeuf5', name: 'Steak haché 5 %', group: 'proteine', kcal: 125, protein: 21 },
  { id: 'thon', name: 'Thon au naturel', group: 'proteine', kcal: 115, protein: 26 },
  { id: 'saumon', name: 'Saumon', group: 'proteine', kcal: 200, protein: 20 },
  { id: 'skyr', name: 'Skyr', group: 'proteine', kcal: 63, protein: 11, breakfast: true },
  { id: 'fromage_blanc', name: 'Fromage blanc 0 %', group: 'proteine', kcal: 47, protein: 7.5, breakfast: true },
  { id: 'lentilles', name: 'Lentilles cuites', group: 'proteine', kcal: 115, protein: 9 },
  { id: 'avoine', name: 'Flocons d’avoine', group: 'glucide', kcal: 370, protein: 13, breakfast: true },
  { id: 'pain', name: 'Pain complet', group: 'glucide', kcal: 245, protein: 9, unitG: 35, unitName: 'tranche', breakfast: true },
  { id: 'riz', name: 'Riz (cuit)', group: 'glucide', kcal: 130, protein: 2.7 },
  { id: 'pates', name: 'Pâtes (cuites)', group: 'glucide', kcal: 150, protein: 5.5 },
  { id: 'pdt', name: 'Pommes de terre (cuites)', group: 'glucide', kcal: 80, protein: 2 },
  { id: 'patate_douce', name: 'Patate douce (cuite)', group: 'glucide', kcal: 90, protein: 1.6 },
  { id: 'huile_olive', name: 'Huile d’olive', group: 'lipide', kcal: 900, protein: 0 },
  { id: 'avocat', name: 'Avocat', group: 'lipide', kcal: 160, protein: 2 },
  { id: 'amandes', name: 'Amandes', group: 'lipide', kcal: 600, protein: 21, breakfast: true },
  { id: 'cacahuete', name: 'Beurre de cacahuète', group: 'lipide', kcal: 600, protein: 25, breakfast: true },
  { id: 'legumes', name: 'Légumes', group: 'legume', kcal: 30, protein: 2 },
  { id: 'banane', name: 'Banane', group: 'fruit', kcal: 90, protein: 1.1, unitG: 120, unitName: 'banane', breakfast: true },
  { id: 'pomme', name: 'Pomme', group: 'fruit', kcal: 52, protein: 0.3, unitG: 150, unitName: 'pomme', breakfast: true },
  { id: 'fruits_rouges', name: 'Fruits rouges', group: 'fruit', kcal: 45, protein: 1, breakfast: true },
];

export const food = (id: string) => FOODS.find((f) => f.id === id);

/** Complément déclaré : nom, dose et valeurs recopiés de l'emballage par l'utilisateur. */
export interface DeclaredSupplement {
  id: string;
  name: string;
  doseG?: number;
  /** Valeurs par dose (étiquette), si renseignées. */
  kcalPerDose?: number;
  proteinPerDose?: number;
  timing: 'apres_petit_dej' | 'apres_seance' | 'collation';
  /** Eau à boire avec la prise (ml). */
  waterMl?: number;
}

export interface NutritionAnswers {
  wake?: string;
  bedtime?: string;
  meals?: 3 | 4 | 5;
  proteins: string[];
  carbs: string[];
  fats: string[];
  fruits: string[];
  exclude: string[];
  supplements: DeclaredSupplement[];
  cooking?: 'rapide' | 'normal';
}

export type PlanKind = 'eau' | 'repas' | 'complement' | 'seance' | 'coucher';

export interface PlanEntry {
  id: string;
  time: string;
  kind: PlanKind;
  title: string;
  items: string[];
  kcal?: number;
  protein?: number;
  waterMl?: number;
  /** Repas remplacé par un imprévu (valeurs estimées). */
  unplanned?: boolean;
  /** Repas recalculé après un imprévu. */
  adjusted?: 'allégé' | 'renforcé';
}

export interface DayPlanInput {
  answers: NutritionAnswers;
  kcal: number;
  proteinG: number;
  waterMl: number;
  /** Séance ou course du jour (heure de début, durée). */
  workout?: { start: string; durationMin: number; title: string };
  /** Index du jour (0 = lundi) : fait tourner les aliments pour éviter la lassitude. */
  dayIndex: number;
  /** Imprévus : repas réellement mangés à la place du plan (estimation). */
  eaten?: Record<string, EatenMeal>;
}

/** Repas imprévu (préparé par quelqu'un, resto…) : estimation grossière par type et taille. */
export interface EatenMeal {
  label: string;
  kcal: number;
  protein: number;
}

export type UnplannedKind = 'maison' | 'resto' | 'fastfood' | 'sandwich' | 'saute';
export type UnplannedSize = 'petite' | 'normale' | 'grosse';

/** Ordres de grandeur (règle produit, pas une mesure) : kcal et protéines selon le type et la taille. */
const UNPLANNED: Record<UnplannedKind, { label: string; kcal: [number, number, number]; protein: [number, number, number] }> = {
  maison: { label: 'Plat préparé par quelqu’un', kcal: [550, 750, 1000], protein: [25, 35, 45] },
  resto: { label: 'Restaurant', kcal: [700, 950, 1300], protein: [30, 40, 50] },
  fastfood: { label: 'Fast-food', kcal: [700, 1050, 1400], protein: [25, 35, 45] },
  sandwich: { label: 'Sandwich / snack', kcal: [350, 500, 700], protein: [15, 22, 30] },
  saute: { label: 'Repas sauté', kcal: [0, 0, 0], protein: [0, 0, 0] },
};

export function estimateUnplanned(kind: UnplannedKind, size: UnplannedSize): EatenMeal {
  const u = UNPLANNED[kind];
  const k = size === 'petite' ? 0 : size === 'normale' ? 1 : 2;
  return { label: kind === 'saute' ? u.label : `${u.label} · portion ${size} (≈)`, kcal: u.kcal[k], protein: u.protein[k] };
}

export const UNPLANNED_LABELS = Object.fromEntries(Object.entries(UNPLANNED).map(([k, v]) => [k, v.label])) as Record<UnplannedKind, string>;

const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const pick = (ids: string[], k: number, fallback: string, filter?: (f: Food) => boolean) => {
  const list = ids.map(food).filter((f): f is Food => !!f && (!filter || filter(f)));
  return list.length ? list[k % list.length]! : food(fallback)!;
};

/** Quantité d'un aliment pour un apport donné ; en unités si l'aliment se compte. */
function portion(f: Food, grams: number): { label: string; g: number } {
  if (f.unitG) {
    // Plafonds de bon sens : 4 œufs, 2 fruits, 3 tranches par repas.
    const cap = f.id === 'oeuf' ? 4 : f.group === 'fruit' ? 2 : 3;
    const n = Math.max(1, Math.min(cap, Math.round(grams / f.unitG)));
    return { label: `${n} ${f.unitName}${n > 1 ? 's' : ''}`, g: n * f.unitG };
  }
  const g = r5(grams);
  return { label: `${g} g ${f.name.toLowerCase()}`, g };
}

/** Construit un repas : protéine pour la part de protéines, puis glucides et lipides pour compléter les calories. */
function meal(kcal: number, protein: number, foods: { p: Food; c: Food; f?: Food; fruit?: Food; veg: boolean }, supplementProtein = 0) {
  const items: string[] = [];
  let k = 0;
  let pr = 0;
  const add = (f: Food, grams: number) => {
    const p = portion(f, grams);
    items.push(f.unitG ? `${p.label}` : p.label);
    k += (f.kcal * p.g) / 100;
    pr += (f.protein * p.g) / 100;
  };
  // La source principale couvre ~75 % des protéines : glucides, lipides et légumes apportent le reste.
  add(foods.p, ((Math.max(0, protein - supplementProtein) * 0.75) / foods.p.protein) * 100);
  if (foods.veg) add(food('legumes')!, 200);
  if (foods.fruit) add(foods.fruit, foods.fruit.unitG ?? 125);
  const rest = Math.max(0, kcal - k);
  if (rest > 0) add(foods.c, ((foods.f ? rest * 0.75 : rest) / foods.c.kcal) * 100);
  if (foods.f) add(foods.f, ((rest * 0.25) / foods.f.kcal) * 100);
  return { items, kcal: Math.round(k), protein: Math.round(pr) };
}

function rawPlan(i: DayPlanInput, scale: Record<string, { k: number; p: number }>): PlanEntry[] {
  const sk = (id: string) => scale[id]?.k ?? 1;
  const sp = (id: string) => scale[id]?.p ?? 1;
  const a = i.answers;
  const ok = (ids: string[]) => ids.filter((x) => !a.exclude.includes(x));
  const wake = toMin(a.wake ?? '07:00');
  const bed = toMin(a.bedtime ?? '23:00');
  const meals = a.meals ?? 4;
  const d = i.dayIndex;
  const out: PlanEntry[] = [];
  const supp = (t: DeclaredSupplement['timing']) => a.supplements.filter((s) => s.timing === t);

  // Répartition : petit-déj 25 %, déjeuner 30 %, dîner 30 %, collation(s) le reste.
  const shares = meals === 3 ? [0.3, 0.35, 0.35] : meals === 4 ? [0.25, 0.3, 0.15, 0.3] : [0.2, 0.1, 0.25, 0.15, 0.3];
  const proteinPer = i.proteinG / meals;

  out.push({ id: 'reveil', time: fromMin(wake), kind: 'eau', title: 'Réveil', items: ['Grand verre d’eau'], waterMl: 400 });

  const bfTime = wake + 30;
  const bf = meal(i.kcal * shares[0]! * sk('petit_dej'), proteinPer * sp('petit_dej'), {
    p: pick(ok(a.proteins), d, 'oeuf', (f) => !!f.breakfast),
    c: pick(ok(a.carbs), d, 'avoine', (f) => !!f.breakfast),
    f: pick(ok(a.fats), d, 'amandes', (f) => !!f.breakfast),
    fruit: pick(ok(a.fruits), d, 'banane'),
    veg: false,
  });
  out.push({ id: 'petit_dej', time: fromMin(bfTime), kind: 'repas', title: 'Petit-déjeuner', ...bf });
  for (const s of supp('apres_petit_dej')) {
    out.push({ id: `supp-${s.id}`, time: fromMin(bfTime + 20), kind: 'complement', title: s.name, items: [s.doseG ? `${s.doseG} g (ta dose déclarée)` : 'ta dose habituelle', `avec ${s.waterMl ?? 300} ml d’eau`], waterMl: s.waterMl ?? 300 });
  }

  const lunchTime = Math.max(bfTime + 240, toMin('12:30'));
  const dinnerTime = Math.min(bed - 150, toMin('19:30'));
  const w = i.workout;
  const wStart = w ? toMin(w.start) : undefined;
  const wEnd = w && wStart !== undefined ? wStart + w.durationMin : undefined;

  const lunch = meal(i.kcal * shares[meals === 3 ? 1 : meals === 4 ? 1 : 2]! * sk('dejeuner'), proteinPer * sp('dejeuner'), {
    p: pick(ok(a.proteins), d + 1, 'poulet', (f) => !f.breakfast),
    c: pick(ok(a.carbs), d + 1, 'riz', (f) => !f.breakfast),
    f: pick(ok(a.fats), d + 1, 'huile_olive', (f) => f.id === 'huile_olive' || f.id === 'avocat'),
    veg: true,
  });
  out.push({ id: 'dejeuner', time: fromMin(lunchTime), kind: 'repas', title: 'Déjeuner', ...lunch });

  if (meals >= 4) {
    // Collation : 90 min avant la séance si elle tombe l'après-midi, sinon 16:30.
    const snackTime = wStart !== undefined && wStart > lunchTime + 150 && wStart < dinnerTime ? wStart - 90 : toMin('16:30');
    const whey = supp('collation')[0];
    const snackShare = shares[meals === 4 ? 2 : 3]!;
    const snack = meal(i.kcal * snackShare * sk('collation') - (whey?.kcalPerDose ?? 0), proteinPer * sp('collation'), { p: pick(ok(a.proteins), d + 2, 'skyr', (f) => !!f.breakfast && f.id !== 'oeuf'), fruit: pick(ok(a.fruits), d + 2, 'banane'), c: pick(ok(a.carbs), d + 2, 'avoine', (f) => !!f.breakfast), veg: false }, whey?.proteinPerDose ?? 0);
    if (whey) {
      snack.kcal += whey.kcalPerDose ?? 0;
      snack.protein += whey.proteinPerDose ?? 0;
    }
    if (whey) snack.items.unshift(`${whey.name}${whey.doseG ? ` ${whey.doseG} g` : ''}`);
    out.push({ id: 'collation', time: fromMin(snackTime), kind: 'repas', title: wStart !== undefined && snackTime === wStart - 90 ? 'Collation avant séance' : 'Collation', ...snack });
  }
  if (meals === 5) {
    const second = meal(i.kcal * shares[1]! * sk('collation_matin'), proteinPer * sp('collation_matin'), { p: pick(ok(a.proteins), d + 3, 'fromage_blanc', (f) => !!f.breakfast && f.id !== 'oeuf'), c: pick(ok(a.fruits), d + 3, 'pomme'), veg: false });
    out.push({ id: 'collation_matin', time: fromMin(bfTime + 150), kind: 'repas', title: 'Collation du matin', ...second });
  }

  if (w && wStart !== undefined && wEnd !== undefined) {
    out.push({ id: 'seance', time: w.start, kind: 'seance', title: w.title, items: [`${w.durationMin} min`, '500 ml d’eau pendant'], waterMl: 500 });
    for (const s of supp('apres_seance')) {
      out.push({ id: `supp-${s.id}`, time: fromMin(wEnd + 10), kind: 'complement', title: s.name, items: [s.doseG ? `${s.doseG} g (ta dose déclarée)` : 'ta dose habituelle', `avec ${s.waterMl ?? 300} ml d’eau`], waterMl: s.waterMl ?? 300, protein: s.proteinPerDose, kcal: s.kcalPerDose });
    }
  }

  const dinner = meal(i.kcal * shares[shares.length - 1]! * sk('diner'), proteinPer * sp('diner'), {
    p: pick(ok(a.proteins), d + 4, 'saumon', (f) => !f.breakfast),
    c: pick(ok(a.carbs), d + 4, 'pdt', (f) => !f.breakfast),
    f: pick(ok(a.fats), d + 4, 'huile_olive', (f) => f.id === 'huile_olive' || f.id === 'avocat'),
    veg: true,
  });
  out.push({ id: 'diner', time: fromMin(wEnd !== undefined && wEnd + 30 > dinnerTime && wEnd + 30 <= bed - 90 ? wEnd + 30 : dinnerTime), kind: 'repas', title: 'Dîner', ...dinner });

  // Eau : le reste de la cible réparti en prises régulières entre le réveil et 2 h avant le coucher.
  const planned = out.reduce((s, e) => s + (e.waterMl ?? 0), 0);
  const left = Math.max(0, i.waterMl - planned);
  const slots = Math.max(1, Math.round(left / 500));
  const startW = wake + 90;
  const endW = bed - 120;
  for (let k = 0; k < slots; k++) {
    const t = startW + ((endW - startW) * (k + 0.5)) / slots;
    out.push({ id: `eau-${k}`, time: fromMin(Math.round(t / 15) * 15), kind: 'eau', title: 'Eau', items: [`${Math.round(left / slots / 50) * 50} ml`], waterMl: Math.round(left / slots / 50) * 50 });
  }
  out.push({ id: 'coucher', time: fromMin(bed), kind: 'coucher', title: 'Au lit', items: ['Écrans coupés 30 min avant'] });
  return out.sort((x, y) => toMin(x.time) - toMin(y.time));
}

/**
 * Plan complet de la journée. Avec des imprévus, les repas imprévus remplacent ceux du plan
 * et les repas suivants sont recalculés pour rester au plus près de la cible du jour.
 */
export function buildDayPlan(i: DayPlanInput): PlanEntry[] {
  const eaten = i.eaten ?? {};
  const base = rawPlan(i, {});
  const ids = Object.keys(eaten).filter((id) => base.some((e) => e.id === id));
  if (!ids.length) return base;
  const lastEaten = Math.max(...ids.map((id) => toMin(base.find((e) => e.id === id)!.time)));
  const meals = base.filter((e) => e.kind === 'repas');
  const adjustable = meals.filter((e) => !ids.includes(e.id) && toMin(e.time) > lastEaten);
  const fixedK = meals.filter((e) => !adjustable.includes(e)).reduce((t, e) => t + (ids.includes(e.id) ? eaten[e.id]!.kcal : e.kcal ?? 0), 0);
  const fixedP = meals.filter((e) => !adjustable.includes(e)).reduce((t, e) => t + (ids.includes(e.id) ? eaten[e.id]!.protein : e.protein ?? 0), 0);
  const suppK = base.filter((e) => e.kind === 'complement').reduce((t, e) => t + (e.kcal ?? 0), 0);
  const plannedK = adjustable.reduce((t, e) => t + (e.kcal ?? 0), 0);
  const plannedP = adjustable.reduce((t, e) => t + (e.protein ?? 0), 0);
  // Facteur borné : on ne supprime jamais un repas (≥ 40 %) et on ne double pas (≤ 140 %).
  const clamp = (x: number) => Math.min(1.4, Math.max(0.4, x));
  const k = plannedK > 0 ? clamp((i.kcal - fixedK - suppK) / plannedK) : 1;
  const p = plannedP > 0 ? clamp((i.proteinG - fixedP) / plannedP) : 1;
  const scale = Object.fromEntries(adjustable.map((e) => [e.id, { k, p }]));
  return rawPlan(i, scale).map((e) =>
    ids.includes(e.id)
      ? { ...e, items: [eaten[e.id]!.label], kcal: eaten[e.id]!.kcal, protein: eaten[e.id]!.protein, unplanned: true }
      : adjustable.some((x) => x.id === e.id) && Math.abs(k - 1) > 0.05
        ? { ...e, adjusted: k < 1 ? 'allégé' : 'renforcé' }
        : e,
  );
}

/** Totaux du plan (pour comparer à la cible). */
export function planTotals(plan: PlanEntry[]) {
  return plan.reduce((t, e) => ({ kcal: t.kcal + (e.kcal ?? 0), protein: t.protein + (e.protein ?? 0), waterMl: t.waterMl + (e.waterMl ?? 0) }), { kcal: 0, protein: 0, waterMl: 0 });
}
