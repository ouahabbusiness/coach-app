// Agenda : engagements récurrents (au-delà du travail) et indisponibilités ponctuelles, stockés localement.

import { replanDay, type OneOff } from '../engine/availability';
import { adaptToEquipment, inTrip, type Trip } from '../engine/trip';
import { dateOf, fixedEventsFromAnswers, type FixedEvent, type PlannedItem } from '../engine/planning';
import { loadTemplates } from './templates';
import type { Repository } from '../storage/db';
import { loadOnboarding } from './profileStore';
import { loadPrayer, withPrayers } from './prayerStore';

const RECURRING = 'agenda.recurring';
const ONE_OFFS = 'planning.oneoffs';

export async function loadRecurring(repo: Repository): Promise<FixedEvent[]> {
  return (await repo.getKv<FixedEvent[]>(RECURRING)) ?? [];
}
export async function saveRecurring(repo: Repository, list: FixedEvent[]): Promise<void> {
  await repo.setKv(RECURRING, list);
}
export async function loadOneOffs(repo: Repository): Promise<OneOff[]> {
  return (await repo.getKv<OneOff[]>(ONE_OFFS)) ?? [];
}
export async function saveOneOffs(repo: Repository, list: OneOff[]): Promise<void> {
  await repo.setKv(ONE_OFFS, list);
}

/** Tout ce qui occupe une semaine type : travail, trajets, sommeil (configuration) + engagements récurrents. */
export async function loadAllFixed(repo: Repository): Promise<FixedEvent[]> {
  return [...fixedEventsFromAnswers((await loadOnboarding(repo)).answers), ...(await loadRecurring(repo))];
}

export async function loadTrips(repo: Repository): Promise<Trip[]> {
  return (await repo.getKv<Trip[]>('agenda.trips')) ?? [];
}

/**
 * Cale le planning futur sur l'agenda : séances des séjours adaptées au matériel disponible,
 * puis séances et courses replacées dans les trous (même jour). Retourne ce qui a changé.
 */
export async function fitPlanning(repo: Repository, items: PlannedItem[], today: string): Promise<{ items: PlannedItem[]; notes: string[] }> {
  const [templates, trips, fixed, baseOneOffs, prayer] = await Promise.all([loadTemplates(repo), loadTrips(repo), loadAllFixed(repo), loadOneOffs(repo), loadPrayer(repo)]);
  const oneOffs = withPrayers(baseOneOffs, [...new Set(items.map((i) => dateOf(i.weekStart, i.day)))], prayer);
  const notes: string[] = [];
  let out = items.map((i) => {
    const date = dateOf(i.weekStart, i.day);
    const t = trips.find((x) => inTrip(date, x));
    if (!t || i.sessionId || i.kind !== 'seance' || date < today || i.adjustment) return i;
    const tpl = templates.find((x) => x.id === i.templateId);
    if (!tpl) return i;
    const a = adaptToEquipment(tpl.lines, t.equipment);
    if (!a.removed.length) return i;
    notes.push(`${date} · ${i.title} : ${a.removed.join(', ')}`);
    return { ...i, adapted: { lines: a.lines, estimatedMin: a.estimatedMin, removed: a.removed }, adjustment: { reason: 'deplacement' as const, decision: 'adaptée' as const, at: Date.now(), note: t.label } };
  });
  for (const d of [...new Set(out.map((i) => dateOf(i.weekStart, i.day)).filter((d) => d >= today))]) {
    const r = replanDay(out, d, fixed, oneOffs, Date.now());
    out = r.items;
    for (const m of r.moves) notes.push(`${d} · ${m.title} : ${m.from} → ${m.to ?? 'aucun trou ce jour'}`);
  }
  return { items: out, notes };
}
