// Applique UNE fois la répartition A/B/C confirmée (orientation + redistribution) aux séances à venir.
// L'historique (séances faites, résultats, journal) n'est jamais modifié ; l'opération est tracée dans le journal des décisions.

import type { Decision } from '../engine/decide';
import { dateOf, type PlannedItem } from '../engine/planning';
import { estimateLineMinutes } from '../engine/programBuilder';
import { ORIENTATION, redistribute, type RLine } from '../engine/redistribute';
import { adaptToEquipment, inTrip, type Trip } from '../engine/trip';
import type { Repository } from '../storage/db';
import { appendJournal } from './journal';
import { localDay } from '../engine/derive';
import { deviceTimeZone } from './support';
import type { SessionTemplate } from './templates';

export const REDISTRIBUTION_KEY = 'program.redistribution';
const PLAN_KEY = 'planning.items';
const PROGRAM_KEY = 'program.current';
const ORIENTATION_KEY = 'program.orientation';
const OLD_LOWER_NOTE = 'Bas du corps prioritaire';

interface ProgramShape {
  program: {
    templates: { key: string; title: string; lines: RLine[] }[];
    week: { day: number; durationMin: number; templateKey?: string }[];
    weekly?: { day: number; durationMin: number; templateKey?: string }[][];
    notes?: string[];
  };
}

const minutes = (lines: RLine[]) => estimateLineMinutes(lines as never);

/** Retourne le nombre de modèles modifiés (0 si déjà appliqué ou si le programme n'a pas la forme attendue). */
export async function applyRedistribution(repo: Repository): Promise<number> {
  if (await repo.getKv(REDISTRIBUTION_KEY)) return 0;
  const stored = (await repo.getKv<SessionTemplate[]>('templates')) ?? [];
  const get = (id: string) => stored.find((t) => t.id === id);
  const a = get('prog-A');
  const b = get('prog-B');
  const c = get('prog-C');
  if (!a || !b || !c) return 0;
  const r = redistribute(a.lines as unknown as RLine[], b.lines as unknown as RLine[], c.lines as unknown as RLine[]);
  if (!r) return 0;
  const now = Date.now();
  const nextLines: Record<string, RLine[]> = { 'prog-A': r.A, 'prog-B': r.B, 'prog-C': r.C };
  const templates = stored.map((t) => (nextLines[t.id] ? { ...t, lines: nextLines[t.id] as never, updatedAt: now } : t));
  await repo.setKv('templates', templates);

  // Copie du programme (modèles + durées + note d'orientation).
  const prog = await repo.getKv<ProgramShape>(PROGRAM_KEY);
  if (prog?.program?.templates) {
    const byKey: Record<string, RLine[]> = { A: r.A, B: r.B, C: r.C };
    const stripIds = (lines: RLine[]) => lines.map(({ id: _id, ...rest }) => rest as RLine);
    const dur: Record<string, number> = { A: minutes(r.A), B: minutes(r.B), C: minutes(r.C) };
    const retime = <W extends { durationMin: number; templateKey?: string }>(w: W[]) => w.map((x) => (x.templateKey && dur[x.templateKey] ? { ...x, durationMin: dur[x.templateKey]! } : x));
    const notes = (prog.program.notes ?? []).filter((n) => !n.startsWith(OLD_LOWER_NOTE));
    await repo.setKv(PROGRAM_KEY, {
      ...prog,
      program: {
        ...prog.program,
        templates: prog.program.templates.map((t) => (byKey[t.key] ? { ...t, lines: stripIds(byKey[t.key]!) } : t)),
        week: retime(prog.program.week),
        weekly: prog.program.weekly?.map(retime),
        notes: [...notes, `Orientation : ${ORIENTATION}`],
      },
    });
  }
  await repo.setKv(ORIENTATION_KEY, { text: ORIENTATION, at: now });

  // Séances à venir : durée recalculée ; versions adaptées (voyage) refaites à partir des nouveaux modèles. Les séances faites ne bougent pas.
  const today = localDay(now, deviceTimeZone());
  const trips = (await repo.getKv<Trip[]>('agenda.trips')) ?? [];
  const items = ((await repo.getKv<PlannedItem[]>(PLAN_KEY)) ?? []).map((x) => {
    const tpl = x.templateId ? templates.find((t) => t.id === x.templateId) : undefined;
    if (!tpl || !nextLines[tpl.id] || x.kind !== 'seance' || x.sessionId || dateOf(x.weekStart, x.day) < today) return x;
    const trip = trips.find((t) => inTrip(dateOf(x.weekStart, x.day), t));
    if (x.adapted && trip) {
      const ad = adaptToEquipment(tpl.lines, trip.equipment);
      return { ...x, durationMin: minutes(tpl.lines as unknown as RLine[]), adapted: { lines: ad.lines, estimatedMin: ad.estimatedMin, removed: ad.removed } };
    }
    return x.adapted ? x : { ...x, durationMin: minutes(tpl.lines as unknown as RLine[]) };
  });
  await repo.setKv(PLAN_KEY, items);

  const decisions: Decision[] = r.moves.map((m) => ({
    variantId: m.variantId,
    before: { target: 0 },
    after: { target: 0 },
    action: 'maintenir',
    done: true,
    targetReached: false,
    progressionAllowed: false,
    observations: [`séance ${m.from} → ${m.to}`],
    rule: 'programme : répartition A/B/C',
    missing: [],
    reason: `Même volume, aucune séance ajoutée : le travail des jambes est réparti sur les trois séances. ${ORIENTATION}`,
    reevaluate: 'après quelques séances : résultats, symptômes et évolution corporelle',
  }));
  await appendJournal(repo, decisions, 'programme · répartition A/B/C', `repartition-${today}`);
  await repo.setKv(REDISTRIBUTION_KEY, { at: now, templates: ['prog-A', 'prog-B', 'prog-C'] });
  return 3;
}
