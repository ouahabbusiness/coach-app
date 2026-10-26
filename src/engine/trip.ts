// Séjours et semaines exceptionnelles : le matériel change, le coach adapte les séances de la période.
// Chaque exercice impossible est remplacé par l'équivalent faisable le plus proche (même schéma de mouvement),
// sinon retiré ; tout est affiché (« Tractions lestées → Tractions strictes »).

import { findVariant } from '../catalog/exercises';
import { estimateMinutes, type Adapted, type PlanLine } from './disruption';

export interface Trip {
  id: string;
  from: string;
  to: string;
  label: string;
  /** Matériel disponible sur place (mêmes noms que le catalogue). */
  equipment: string[];
}

export const TRIP_EQUIPMENT = ['barre fixe', 'barres parallèles', 'barre basse', 'banc', 'kettlebell', 'ceinture de lest', 'élastique', 'tapis'] as const;

/** Remplaçants par ordre de préférence (même schéma de mouvement). */
const SUBS: Record<string, string[]> = {
  'pullup-weighted': ['pullup-strict', 'chinup-strict', 'pullup-band', 'row-australian', 'kb-row-1arm'],
  'pullup-strict': ['chinup-strict', 'pullup-band', 'row-australian', 'kb-row-1arm'],
  'chinup-strict': ['pullup-strict', 'pullup-band', 'row-australian', 'kb-row-1arm'],
  'pullup-negative': ['pullup-band', 'row-australian', 'kb-row-1arm'],
  'pullup-band': ['pullup-negative', 'row-australian', 'kb-row-1arm'],
  'kb-row-1arm': ['row-australian', 'pullup-strict', 'chinup-strict'],
  'dips-weighted': ['dips-bars', 'dips-bench', 'pushup-diamond'],
  'dips-bars': ['dips-bench', 'pushup-diamond'],
  'dips-bench': ['dips-bars', 'pushup-diamond'],
  'kb-press-1arm': ['pike-pushup'],
  'squat-goblet-kb': ['split-squat-bulgarian', 'lunge-reverse', 'squat-bodyweight'],
  'split-squat-bulgarian': ['lunge-reverse', 'squat-bodyweight'],
  'kb-rdl': ['lunge-reverse', 'squat-bodyweight'],
  'kb-swing-2h': ['lunge-reverse', 'squat-bodyweight'],
  'glute-bridge-kb': ['lunge-reverse', 'squat-bodyweight'],
  'leg-raise-hanging': ['knee-raise-hanging', 'hollow-hold', 'plank-forearm'],
  'knee-raise-hanging': ['hollow-hold', 'plank-forearm'],
};

const nameOf = (id: string) => findVariant(id)?.variant.name ?? id;
const feasible = (id: string, have: Set<string>) => (findVariant(id)?.variant.equipment ?? []).every((e) => have.has(e));

/** Adapte une séance au matériel disponible. Les charges disparaissent si le remplaçant n'en a pas besoin. */
export function adaptToEquipment<T extends PlanLine & { loadKg?: number }>(lines: T[], equipment: string[]): Adapted<T> {
  const have = new Set(equipment);
  const removed: string[] = [];
  const out: T[] = [];
  for (const l of lines) {
    if (feasible(l.variantId, have)) {
      out.push(l);
      continue;
    }
    const sub = (SUBS[l.variantId] ?? []).find((id) => feasible(id, have));
    if (!sub) {
      removed.push(`${nameOf(l.variantId)} : retiré (matériel absent)`);
      continue;
    }
    const v = findVariant(sub)!.variant;
    const loaded = v.equipment.includes('kettlebell') || v.equipment.includes('ceinture de lest');
    const next = { ...l, variantId: sub, kind: v.kind, loadKg: loaded ? l.loadKg : undefined } as T;
    if (v.kind === 'hold') Object.assign(next, { targetReps: undefined, targetSeconds: 30 });
    else if (l.kind === 'hold') Object.assign(next, { targetSeconds: undefined, targetReps: 10 });
    out.push(next);
    removed.push(`${nameOf(l.variantId)} → ${v.name}`);
  }
  return { lines: out, estimatedMin: estimateMinutes(out), removed };
}

export const inTrip = (date: string, t: Trip) => date >= t.from && date <= t.to;
