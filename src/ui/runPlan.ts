// Sortie de course prévue au planning : c'est elle qui fixe la distance visée, pas un pourcentage de ta plus longue sortie.

import { dateOf, type PlannedItem } from '../engine/planning';
import type { Repository } from '../storage/db';

/** Distance (km) de la course prévue aujourd'hui, sinon de la prochaine dans les 7 jours. Annulée, suspendue ou remplacée : ignorée. */
export async function plannedRunKm(repo: Pick<Repository, 'getKv'>, today: string): Promise<number | undefined> {
  const items = (await repo.getKv<PlannedItem[]>('planning.items')) ?? [];
  const limit = dateOf(today, 7);
  const next = items
    .filter((i) => i.kind === 'course' && i.km !== undefined && !i.sessionId && !(i.adjustment && i.adjustment.decision !== 'adaptée'))
    .map((i) => ({ km: i.km as number, date: dateOf(i.weekStart, i.day) }))
    .filter((i) => i.date >= today && i.date <= limit)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return next?.km;
}
