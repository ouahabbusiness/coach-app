// Petit-déjeuner choisi « pour aujourd'hui seulement » : rangé sous la date du jour, il n'existe plus le lendemain.
// Il ne touche jamais à l'habitude déclarée ni à ce qui a été mangé.

import type { UsualItem } from '../engine/dayPlan';
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
