import { decide, project } from '../engine/session';
import { currentResult } from '../engine/derive';
import { nextSessionAdjust } from '../engine/progression';
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

/** Applique la progression calculée (charge ou répétitions) aux séries de travail, avec la raison visible. */
export async function withProgression(repo: Repository, plan: SessionPlan): Promise<SessionPlan> {
  const states = [...(await repo.allSessionEvents()).values()].map((ev) => project(ev)).filter((s): s is SessionState => s !== null);
  const eq = await loadEquipment(repo);
  const memo = new Map<string, ReturnType<typeof nextSessionAdjust>>();
  return {
    ...plan,
    sets: plan.sets.map((set) => {
      if (set.role !== 'work' || set.kind !== 'reps') return set;
      if (!memo.has(set.blockId)) memo.set(set.blockId, nextSessionAdjust(lastWork(states, set.variantId), set, loadsFor(set.variantId, eq)));
      const a = memo.get(set.blockId)!;
      return { ...set, loadKg: a.loadKg ?? set.loadKg, targetReps: a.targetReps ?? set.targetReps, progression: a.note };
    }),
  };
}
