import { decide, project } from '../engine/session';
import { currentResult } from '../engine/derive';
import { lightLoad, nextSessionAdjust, type LightLoad } from '../engine/progression';
import { decide as decideProgression, type Decision, type Sample } from '../engine/decide';
import { findVariant } from '../catalog/exercises';
import { appendJournal } from './journal';
import { loadEquipment, loadsFor } from './equipment';
import type { SessionPlan, SessionState, SetResult } from '../engine/types';
import { EXERCISES } from '../catalog/exercises';
import type { Repository } from '../storage/db';
import { deviceTimeZone, newId } from './support';
import { planFromTemplate, type SessionTemplate } from './templates';

export const OVERRIDES = 'progression.overrides';

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

/** Raisons de séries retirées par le coach : elles ne comptent ni comme demandées ni comme ratées. */
export const COACH_REMOVED = /contrôle avant séance|version courte|allégée|retirée par le coach/;

/**
 * Échantillons comparables pour une variante (plus récent d'abord) : séries de travail faites, séries demandées
 * (hors retraits du coach), comparabilité (prescription identique, ni allégée, ni interrompue).
 */
export async function samplesFor(repo: Repository, states: SessionState[], set: { variantId: string; repRange?: [number, number]; targetRir?: number }, n = 3): Promise<{ samples: Sample[]; pain: boolean }> {
  const out: Sample[] = [];
  let pain = false;
  for (const s of [...states].sort((a, b) => b.startedAt - a.startedAt)) {
    const sets = s.sets.filter((x) => x.planned.variantId === set.variantId && x.planned.role === 'work');
    if (!sets.length || !sets.some((x) => x.status === 'done')) continue;
    if (out.length === 0) pain = s.pain.some((p) => p.plannedSetId && sets.some((x) => x.planned.id === p.plannedSetId));
    const done = sets.filter((x) => x.status === 'done');
    const results = done.map((x) => currentResult(x) ?? {});
    const removed = sets.filter((x) => x.status === 'skipped' && COACH_REMOVED.test(x.skipReason ?? '')).length;
    const readiness = await repo.getKv<{ d: { decision: string } }>(`readiness.${s.sessionId}`);
    const p = sets[0]!.planned;
    let why: string | undefined;
    if (readiness && readiness.d.decision !== 'normale') why = `contrôle avant séance : ${readiness.d.decision}`;
    else if (s.interruptions.length) why = 'séance interrompue';
    else if (JSON.stringify(p.repRange) !== JSON.stringify(set.repRange) || p.targetRir !== set.targetRir) why = 'prescription différente';
    out.push({ results, planned: sets.length - removed, comparable: !why, why });
    if (out.length >= n) break;
  }
  return { samples: out, pain };
}

/**
 * Au lancement : une décision par exercice, enregistrée dans le journal AVANT d'être appliquée.
 * Transition → seule la 1re série passe à la charge d'essai. Proposition (baisse) → rien n'est appliqué
 * tant qu'elle n'est pas validée. Baisse validée (override) → appliquée une fois puis effacée.
 */
export async function withProgression(repo: Repository, plan: SessionPlan): Promise<SessionPlan> {
  const states = [...(await repo.allSessionEvents()).values()].map((ev) => project(ev)).filter((s): s is SessionState => s !== null);
  const eq = await loadEquipment(repo);
  const weights = (await repo.getKv<{ day: string; kg: number }[]>('weight.log')) ?? [];
  const bodyweightKg = weights.length ? [...weights].sort((a, b) => (a.day < b.day ? -1 : 1)).pop()!.kg : undefined;
  const overrides = (await repo.getKv<Record<string, { loadKg: number }>>(OVERRIDES)) ?? {};
  const decisions = new Map<string, Decision>();
  const forced = new Map<string, number>();
  const legacy = new Map<string, ReturnType<typeof nextSessionAdjust>>();
  for (const set of plan.sets) {
    if (set.role !== 'work' || set.kind !== 'reps' || decisions.has(set.blockId) || legacy.has(set.blockId) || forced.has(set.blockId)) continue;
    const ov = overrides[set.variantId];
    if (ov) {
      forced.set(set.blockId, ov.loadKg);
      continue;
    }
    const loads = loadsFor(set.variantId, eq);
    if (set.repRange) {
      const { samples, pain } = await samplesFor(repo, states, set);
      const rx = { lo: set.repRange[0], hi: set.repRange[1], rir: set.targetRir ?? 2, loadKg: set.loadKg, target: set.targetReps ?? set.repRange[0] };
      const addedLoad = (findVariant(set.variantId)?.variant.equipment ?? []).includes('ceinture de lest');
      decisions.set(set.blockId, decideProgression(set.variantId, rx, samples, loads, { pain, bodyweightKg, addedLoad }));
    } else legacy.set(set.blockId, nextSessionAdjust(lastWork(states, set.variantId), set, loads));
  }
  if (decisions.size) await appendJournal(repo, [...decisions.values()], `lancement · ${plan.title}`, plan.id);
  if (forced.size) {
    const rest = { ...overrides };
    for (const s of plan.sets) if (forced.has(s.blockId)) delete rest[s.variantId];
    await repo.setKv(OVERRIDES, rest);
  }
  const firstOfBlock = new Set<string>();
  return {
    ...plan,
    sets: plan.sets.map((set) => {
      if (set.role !== 'work') return set;
      const f = forced.get(set.blockId);
      if (f !== undefined) return { ...set, loadKg: f, targetReps: set.repRange?.[0] ?? set.targetReps, progression: `Baisse validée par toi : ${f} kg` };
      const d = decisions.get(set.blockId);
      if (d) {
        const first = !firstOfBlock.has(set.blockId);
        firstOfBlock.add(set.blockId);
        if (d.transition && first) return { ...set, loadKg: d.transition.loadKg, targetReps: d.transition.target, progression: d.reason, cue: `Série d’essai à ${d.transition.loadKg} kg` };
        // Proposition non validée : on garde la prescription actuelle.
        const after = d.proposal ? d.before : d.after;
        const changed = after.loadKg !== d.before.loadKg || after.target !== d.before.target;
        return { ...set, loadKg: after.loadKg ?? set.loadKg, targetReps: after.target, progression: changed || d.action !== 'maintenir' ? d.reason : undefined };
      }
      const a = legacy.get(set.blockId);
      if (!a || set.kind !== 'reps') return set;
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
