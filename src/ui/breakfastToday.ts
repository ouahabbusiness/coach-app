// Petit-déjeuner choisi « pour aujourd'hui seulement » : rangé sous la date du jour, il n'existe plus le lendemain.
// Il ne touche jamais à l'habitude déclarée ni à ce qui a été mangé.

import type { MealSlot, UsualItem } from '../engine/dayPlan';
import type { Repository } from '../storage/db';

export const breakfastKey = (day: string) => `dayplan.breakfast.${day}`;

/** Le choix du jour donné, sinon rien (jamais celui d'un autre jour). */
export async function loadBreakfastToday(repo: Pick<Repository, 'getKv'>, day: string): Promise<UsualItem[] | undefined> {
  const v = await repo.getKv<UsualItem[]>(breakfastKey(day));
  return v && v.length ? v : undefined;
}

/** `undefined` efface le choix du jour (valeur vide : le stockage n'a pas de suppression). */
export async function saveBreakfastToday(repo: Pick<Repository, 'setKv'>, day: string, items: UsualItem[] | undefined): Promise<void> {
  await repo.setKv(breakfastKey(day), items ?? []);
}

export const mealsKey = (day: string) => `dayplan.meals.${day}`;
export type MealsToday = Partial<Record<MealSlot, UsualItem[]>>;

/** Repas choisis « pour aujourd'hui seulement » (déjeuner, dîner, collations) : rangés sous la date, ils n'existent plus le lendemain. */
export async function loadMealsToday(repo: Pick<Repository, 'getKv'>, day: string): Promise<MealsToday> {
  const v = (await repo.getKv<MealsToday>(mealsKey(day))) ?? {};
  return Object.fromEntries(Object.entries(v).filter(([, items]) => (items as UsualItem[] | undefined)?.length)) as MealsToday;
}

export async function saveMealsToday(repo: Pick<Repository, 'setKv' | 'getKv'>, day: string, slot: MealSlot, items: UsualItem[] | undefined): Promise<MealsToday> {
  const next: MealsToday = { ...(await loadMealsToday(repo, day)) };
  if (items?.length) next[slot] = items;
  else delete next[slot];
  await repo.setKv(mealsKey(day), next);
  return next;
}
