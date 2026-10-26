import { decide, project } from '../engine/session';
import { currentResult } from '../engine/derive';
import { lightLoad, nextSessionAdjust, type LightLoad } from '../engine/progression';
import { decide as decideProgression, type Decision } from '../engine/decide';
import { appendJournal } from './journal';
import { loadEquipment, loadsFor } from './equipment';
import type { SessionPlan, SessionState, SetResult } from '../engine/types';
import { EXERCISES } from '../catalog/exercises';
import type { Repository } from '../storage/db';
import { deviceTimeZone, newId } from './support';
import { planFromTemplate, type SessionTemplate } from './templates';

function exerciseOf(variantId: string): string {
  return EXERCISES.find((e) => e.variants.some((v) => v.id === variantId))?.id ?? 'unknown';
}

/** Démarre une séance à partir d'un modèle. Retourne l'identifiant de la séance. */
export async function startSessionFromTemplate(repo: Repository, template: SessionTemplate): Promise<string> {
  const sessionId = newId();
  const plan = await withProgression(repo, planFromTemplate(template, exerciseOf));
  const res = decide(
    null,
    { type: 'start_session', plan, timeZone: deviceTimeZone() },
    { now: Date.now(), newId, sessionId },
  );
  if (!res.ok) throw new Error(res.error);
  await repo.append(res.events);
  // Demande au navigateur de ne pas effacer les données automatiquement (peut être refusé).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* sans effet si non pris en charge */
  }
  return sessionId;
}

/** Séries de travail de la dernière séance faite sur cette variante (résultats saisis uniquement). */
function lastWork(states: SessionState[], variantId: string): SetResult[] | undefined {
  for (const s of [...states].sort((a, b) => b.startedAt - a.startedAt)) {
    const r = s.sets
      .filter((x) => x.planned.variantId === variantId && x.planned.role === 'work' && x.status === 'done')
      .map(currentResult)
      .filter((x): x is SetResult => x !== undefined);
    if (r.length) return r;
  }
  return undefined;
}

/** Séries de travail des N dernières séances comparables (plus récente d'abord) + douleur signalée sur cette variante. */
function recentWork(states: SessionState[], variantId: string, n = 2): { sessions: SetResult[][]; pain: boolean } {
  const out: SetResult[][] = [];
  let pain = false;
  for (const s of [...states].sort((a, b) => b.startedAt - a.startedAt)) {
    const sets = s.sets.filter((x) => x.planned.variantId === variantId && x.planned.role === 'work' && x.status === 'done');
    const r = sets.map(currentResult).filter((x): x is SetResult => x !== undefined);
    if (!sets.length) continue;
    if (out.length === 0) pain = s.pain.some((p) => p.plannedSetId && sets.some((x) => x.planned.id === p.plannedSetId));
    out.push(r.length === sets.length ? r : [...r, ...sets.slice(r.length).map(() => ({}))]);
    if (out.length >= n) break;
  }
  return { sessions: out, pain };
}

/**
 * Au lancement : une décision par exercice (double progression si plage définie), enregistrée dans le journal
 * AVANT d'être appliquée au plan. Sans plage (anciens modèles) : règle simple précédente.
 */
export async function withProgression(repo: Repository, plan: SessionPlan): Promise<SessionPlan> {
  const states = [...(await repo.allSessionEvents()).values()].map((ev) => project(ev)).filter((s): s is SessionState => s !== null);
  const eq = await loadEquipment(repo);
  const decisions = new Map<string, Decision>();
  const legacy = new Map<string, ReturnType<typeof nextSessionAdjust>>();
  for (const set of plan.sets) {
    if (set.role !== 'work' || set.kind !== 'reps' || decisions.has(set.blockId) || legacy.has(set.blockId)) continue;
    const loads = loadsFor(set.variantId, eq);
    if (set.repRange) {
      const { sessions, pain } = recentWork(states, set.variantId);
      const rx = { lo: set.repRange[0], hi: set.repRange[1], rir: set.targetRir ?? 2, loadKg: set.loadKg, target: set.targetReps ?? set.repRange[0] };
      decisions.set(set.blockId, decideProgression(set.variantId, rx, sessions, loads, { pain }));
    } else legacy.set(set.blockId, nextSessionAdjust(lastWork(states, set.variantId), set, loads));
  }
  if (decisions.size) await appendJournal(repo, [...decisions.values()], `lancement · ${plan.title}`);
  return {
    ...plan,
    sets: plan.sets.map((set) => {
      const d = decisions.get(set.blockId);
      if (d && set.role === 'work') {
        const changed = d.after.loadKg !== d.before.loadKg || d.after.target !== d.before.target;
        return { ...set, loadKg: d.after.loadKg ?? set.loadKg, targetReps: d.after.target, progression: changed || d.action !== 'maintenir' ? d.reason : undefined };
      }
      const a = legacy.get(set.blockId);
      if (!a || set.role !== 'work' || set.kind !== 'reps') return set;
      return { ...set, loadKg: a.loadKg ?? set.loadKg, targetReps: a.targetReps ?? set.targetReps, progression: a.note };
    }),
  };
}

/** Exercices dont la dernière séance était trop légère pour l'objectif (voir `lightLoad`). */
export async function lightLoadsReport(repo: Repository): Promise<LightLoad[]> {
  const states = [...(await repo.allSessionEvents()).values()].map((ev) => project(ev)).filter((s): s is SessionState => s !== null);
  const eq = await loadEquipment(repo);
  const variants = [...new Set(states.flatMap((s) => s.sets.filter((x) => x.planned.role === 'work' && x.planned.kind === 'reps').map((x) => x.planned.variantId)))];
  return variants.map((v) => lightLoad(v, lastWork(states, v) ?? [], loadsFor(v, eq))).filter((x): x is LightLoad => !!x);
}
