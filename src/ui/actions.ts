import { decide, project } from '../engine/session';
import { currentResult, localDay } from '../engine/derive';
import { DELOAD, deloadSets, inDeload, type Deload } from '../engine/stagnation';
import { lightLoad, nextSessionAdjust, type LightLoad } from '../engine/progression';
import { decide as decideProgression, JOINT_LOADED, type Decision, type Sample } from '../engine/decide';
import { findVariant } from '../catalog/exercises';
import { appendJournal } from './journal';
import { adaptSets, hasJointDeclared } from '../engine/joints';
import { isUpperLoaded, toleranceHistory, toleranceOf, type JointFeedback } from '../engine/tolerance';
import { JOINT_ADAPT, loadComplement, type JointAdapt } from './profileComplement';
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
export const COACH_REMOVED = /contrôle avant séance|version courte|allégée|retirée par le coach|passé : tolérance inconnue/i;

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

/** Épaule ou coudes déclarés sensibles (entretien du programme ou fiche d'accueil) : gèle la montée de charge des tractions, dips et poussées. */
export async function jointGuard(repo: Repository, variantId: string): Promise<boolean> {
  if (!JOINT_LOADED.test(variantId)) return false;
  const prog = await repo.getKv<{ pains?: string[] }>('program.answers');
  if (prog?.pains?.some((p) => p === 'epaules' || p === 'coudes')) return true;
  if (hasJointDeclared((await loadComplement(repo)).joints)) return true;
  const onb = await repo.getKv<{ answers?: { safety?: { pains?: string } } }>('onboarding');
  return /[ée]paule|coude/i.test(onb?.answers?.safety?.pains ?? '');
}

/**
 * Au lancement : une décision par exercice, enregistrée dans le journal AVANT d'être appliquée.
 * Transition → seule la 1re série passe à la charge d'essai. Proposition (baisse) → rien n'est appliqué
 * tant qu'elle n'est pas validée. Baisse validée (override) → appliquée une fois puis effacée.
 */
export async function withProgression(repo: Repository, plan: SessionPlan): Promise<SessionPlan> {
  // Phase allégée validée : pas de progression, séries réduites, réserve +1, pas d'échec.
  const deload = await repo.getKv<Deload>(DELOAD);
  if (inDeload(deload ?? undefined, localDay(Date.now(), deviceTimeZone()))) {
    return { ...plan, sets: deloadSets(plan.sets, `Phase allégée (validée) jusqu’au ${deload!.to} : moins de séries, réserve +1, pas d’échec.`) };
  }
  const states = [...(await repo.allSessionEvents()).values()].map((ev) => project(ev)).filter((s): s is SessionState => s !== null);
  const eq = await loadEquipment(repo);
  const weights = (await repo.getKv<{ day: string; kg: number }[]>('weight.log')) ?? [];
  const bodyweightKg = weights.length ? [...weights].sort((a, b) => (a.day < b.day ? -1 : 1)).pop()!.kg : undefined;
  const overrides = (await repo.getKv<Record<string, { loadKg: number }>>(OVERRIDES)) ?? {};
  // Adaptation à la gêne : la prescription adaptée stable (réserve visée 3) se compare à elle-même. Sans cela, la séance précédente
  // (faite à 3 en réserve) paraîtrait « à prescription différente » du modèle (2 en réserve) et la calibration ne se terminerait jamais.
  const adapt = await repo.getKv<JointAdapt>(JOINT_ADAPT);
  const adaptOn = !!adapt && !!(adapt.patterns.length || adapt.tests?.length);
  const feedback: Record<string, JointFeedback | undefined> = {};
  if (adaptOn) for (const st of states) feedback[st.sessionId] = await repo.getKv<JointFeedback>(`joint.feedback.${st.sessionId}`);
  const tolCtx = { triggerPatterns: adapt?.patterns ?? [], ...toleranceHistory(states, feedback, Date.now(), (at, tz) => localDay(at, tz ?? 'UTC')) };
  const adaptedVariant = (variantId: string) => adaptOn && (adapt!.patterns.some((p) => new RegExp(p).test(variantId)) || (isUpperLoaded(variantId) && toleranceOf(variantId, tolCtx) !== 'toleree'));
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
      const effRir = adaptedVariant(set.variantId) ? Math.max(set.targetRir ?? 2, 3) : set.targetRir;
      const { samples, pain } = await samplesFor(repo, states, { ...set, targetRir: effRir });
      const rx = { lo: set.repRange[0], hi: set.repRange[1], rir: effRir ?? 2, loadKg: set.loadKg, target: set.targetReps ?? set.repRange[0] };
      const addedLoad = (findVariant(set.variantId)?.variant.equipment ?? []).includes('ceinture de lest');
      const guarded = await jointGuard(repo, set.variantId);
      decisions.set(set.blockId, decideProgression(set.variantId, rx, samples, loads, { pain, bodyweightKg, addedLoad, guarded }));
    } else legacy.set(set.blockId, nextSessionAdjust(lastWork(states, set.variantId), set, loads));
  }
  if (decisions.size) await appendJournal(repo, [...decisions.values()], `lancement · ${plan.title}`, plan.id);
  if (forced.size) {
    const rest = { ...overrides };
    for (const s of plan.sets) if (forced.has(s.blockId)) delete rest[s.variantId];
    await repo.setKv(OVERRIDES, rest);
  }
  const blockIdx = new Map<string, number>();
  const out: SessionPlan = {
    ...plan,
    sets: plan.sets.map((set) => {
      if (set.role !== 'work') return set;
      const f = forced.get(set.blockId);
      if (f !== undefined) return { ...set, loadKg: f, targetReps: set.repRange?.[0] ?? set.targetReps, progression: `Baisse validée par toi : ${f} kg` };
      const d = decisions.get(set.blockId);
      if (d) {
        const idx = (blockIdx.get(set.blockId) ?? 0) + 1;
        blockIdx.set(set.blockId, idx);
        // Transition : seules les `transition.sets` premières séries passent à la nouvelle charge.
        if (d.transition && idx <= d.transition.sets) return { ...set, loadKg: d.transition.loadKg, targetReps: d.transition.target, progression: d.reason, cue: `Série à ${d.transition.loadKg} kg (${idx}/${d.transition.sets} à la nouvelle charge)` };
        if (d.transition) return { ...set, loadKg: d.after.loadKg ?? set.loadKg, targetReps: d.after.target, progression: d.reason };
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
  // Adaptation à la gêne acceptée : elle modifie la prescription réelle de la séance (marge, séries, consigne).
  if (!adaptOn || !adapt) return out;
  // Tolérance inconnue (mouvement sollicitant épaule ou coudes, jamais déclaré gênant, pas confirmé par tes réponses) : même prudence au départ.
  const ctx = tolCtx;
  // « Toléré » = réponses explicites ; tout le reste (inconnue, gêne signalée) garde la prudence de départ.
  const unknown = [...new Set(out.sets.filter((x) => x.role === 'work' && isUpperLoaded(x.variantId) && toleranceOf(x.variantId, ctx) !== 'toleree').map((x) => '^' + x.variantId + '$'))];
  // Tests : tolérance non confirmée = série sous-maximale (jamais un maximum imposé) ; tu peux aussi passer le test sans pénalité.
  const unknownTests = [...new Set(out.sets.filter((x) => x.role === 'test' && isUpperLoaded(x.variantId) && toleranceOf(x.variantId, ctx) !== 'toleree').map((x) => '^' + x.variantId + '$'))];
  return { ...out, sets: adaptSets(out.sets, [...adapt.patterns, ...unknown], [...(adapt.tests ?? adapt.patterns), ...unknownTests]) };
}

/** Exercices dont la dernière séance était trop légère pour l'objectif (voir `lightLoad`). */
export async function lightLoadsReport(repo: Repository): Promise<LightLoad[]> {
  const states = [...(await repo.allSessionEvents()).values()].map((ev) => project(ev)).filter((s): s is SessionState => s !== null);
  const eq = await loadEquipment(repo);
  const variants = [...new Set(states.flatMap((s) => s.sets.filter((x) => x.planned.role === 'work' && x.planned.kind === 'reps').map((x) => x.planned.variantId)))];
  return variants.map((v) => lightLoad(v, lastWork(states, v) ?? [], loadsFor(v, eq))).filter((x): x is LightLoad => !!x);
}
