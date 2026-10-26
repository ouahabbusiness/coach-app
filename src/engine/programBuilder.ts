// Programme construit par le coach : réponses à l'entretien → recommandations argumentées → programme.
// Règles d'entraînement générales (double progression, répartition, récupération), rédigées par l'assistant,
// NON relues par un professionnel. Aucune mécanique punitive : la rigueur porte sur l'organisation, pas sur des sanctions.

import type { SetRole } from './types';

export type Priority = 'force' | 'muscle' | 'seche' | 'course' | 'hybride';
export type Intensity = 'controlee' | 'dure' | 'echec';
export type Strictness = 'souple' | 'strict' | 'militaire';
export type Pain = 'epaules' | 'coudes' | 'poignets' | 'dos' | 'genoux';
export type Slot = 'matin' | 'midi' | 'soir';
export type QuitReason = 'ennui' | 'fatigue' | 'temps' | 'douleur' | 'motivation';
export type RunGoal = 'base' | '5k' | '10k';

export interface ProgramAnswers {
  priority?: Priority;
  /** Tests : null = « je ne sais pas » (testé en semaine 1). */
  maxPullups?: number | null;
  maxDips?: number | null;
  maxPushups?: number | null;
  longestRunKm?: number | null;
  pains: Pain[];
  sleepH?: number;
  stress?: 'bas' | 'moyen' | 'eleve';
  physicalJob?: boolean;
  quitReason?: QuitReason;
  minutes?: number;
  days?: number;
  runsPerWeek?: number;
  runGoal?: RunGoal;
  slot?: Slot;
  intensity?: Intensity;
  strictness?: Strictness;
  weeks?: number;
}

export interface Rec<T> {
  value: T;
  why: string;
}

const poorRecovery = (a: ProgramAnswers) => (a.sleepH !== undefined && a.sleepH < 6.5) || a.stress === 'eleve' || a.physicalJob === true;

export function recIntensity(a: ProgramAnswers): Rec<Intensity> {
  if (poorRecovery(a)) {
    const cause = a.sleepH !== undefined && a.sleepH < 6.5 ? `tu dors ${a.sleepH} h` : a.stress === 'eleve' ? 'ton stress est élevé' : 'ton travail est physique';
    return { value: 'controlee', why: `${cause} : on garde 2 répétitions en réserve. Tu progresses sans te cramer.` };
  }
  if (a.pains.length > 0) return { value: 'dure', why: 'Tu as signalé une douleur : dur, mais jamais à l’échec sur les mouvements chargés.' };
  if (a.priority === 'muscle') return { value: 'echec', why: 'Pour le muscle, la dernière série va au bout. Les autres restent propres.' };
  return { value: 'dure', why: 'Dur : 1 répétition en réserve. Assez lourd pour progresser, assez propre pour durer 4 semaines.' };
}

export function recStrictness(a: ProgramAnswers): Rec<Strictness> {
  switch (a.quitReason) {
    case 'motivation':
      return { value: 'militaire', why: 'Tu lâches quand la motivation tombe. Donc on ne compte pas dessus : jours fixes, rien ne se déplace.' };
    case 'temps':
      return { value: 'strict', why: 'Tu lâches par manque de temps : jours fixes, et une version courte prête pour les journées chargées.' };
    case 'douleur':
    case 'fatigue':
      return { value: 'strict', why: 'Tu lâches par fatigue ou douleur : cadre fixe, mais adaptation autorisée quand le corps l’exige.' };
    case 'ennui':
      return { value: 'strict', why: 'Tu lâches par ennui : cadre fixe, et trois séances différentes qui tournent.' };
    default:
      return { value: 'strict', why: 'Jours fixes, imprévu = version courte le jour même. Pas de report.' };
  }
}

export function recDays(a: ProgramAnswers): Rec<number> {
  const base = a.priority === 'course' ? 2 : a.priority === 'hybride' ? 3 : 4;
  if (poorRecovery(a)) return { value: Math.max(2, base - 1), why: `${base - 1} séances : ta récupération est le facteur limitant, pas ta volonté.` };
  return { value: base, why: a.priority === 'hybride' ? '3 séances de force + la course : le meilleur compromis pour progresser sur les deux.' : `${base} séances : assez de volume pour progresser, assez de repos pour encaisser.` };
}

export function recRuns(a: ProgramAnswers): Rec<number> {
  const v = a.priority === 'course' ? 4 : a.priority === 'hybride' || a.priority === 'seche' ? 3 : 2;
  return { value: v, why: v >= 3 ? `${v} sorties : la course est au cœur de ton objectif.` : '2 sorties : le cardio entretient sans voler la récupération de la force.' };
}

export function recWeeks(): Rec<number> {
  return { value: 4, why: '4 semaines = ton Winter Arc. Re-test à la fin, puis nouveau bloc.' };
}

/** Une ligne de séance générée (même forme que les modèles de l'app). */
export interface GenLine {
  variantId: string;
  kind: 'reps' | 'hold';
  role: SetRole;
  sets: number;
  targetReps?: number;
  targetSeconds?: number;
  loadKg?: number;
  targetRir?: number;
  restSeconds: number;
  cue?: string;
}

export interface GenTemplate {
  key: 'A' | 'B' | 'C' | 'T';
  title: string;
  lines: GenLine[];
}

export interface GenItem {
  day: number;
  start: string;
  durationMin: number;
  kind: 'seance' | 'course';
  title: string;
  templateKey?: GenTemplate['key'];
  km?: number;
  /** Contenu de la course (structure du fractionné, allure). */
  detail?: string;
}

export interface Program {
  title: string;
  weeks: number;
  templates: GenTemplate[];
  /** Semaine type (semaine 1). */
  week: GenItem[];
  /** Toutes les semaines du bloc : courses qui progressent, re-test la dernière semaine. */
  weekly: GenItem[][];
  rules: string[];
  notes: string[];
}

const RIR: Record<Intensity, number> = { controlee: 2, dure: 1, echec: 0 };

function scheme(p: Priority | undefined) {
  switch (p) {
    case 'force':
      return { main: { sets: 5, reps: 5, rest: 150 }, acc: { sets: 3, reps: 8, rest: 90 } };
    case 'muscle':
      return { main: { sets: 4, reps: 8, rest: 90 }, acc: { sets: 3, reps: 12, rest: 60 } };
    case 'seche':
      return { main: { sets: 3, reps: 10, rest: 60 }, acc: { sets: 3, reps: 15, rest: 45 } };
    case 'course':
      return { main: { sets: 3, reps: 6, rest: 120 }, acc: { sets: 2, reps: 10, rest: 60 } };
    default:
      return { main: { sets: 4, reps: 6, rest: 120 }, acc: { sets: 3, reps: 10, rest: 75 } };
  }
}

/** Plus petite charge réalisable ≥ kg (ou la plus lourde disponible). */
const fit = (kg: number, loads: number[]) => loads.find((l) => l >= kg) ?? loads[loads.length - 1] ?? kg;

const DAYS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
const START: Record<Slot, string> = { matin: '07:00', midi: '12:15', soir: '18:30' };

export function estimateLineMinutes(lines: GenLine[]): number {
  const sec = lines.reduce((s, l) => s + l.sets * ((l.kind === 'hold' ? l.targetSeconds ?? 30 : 45) + l.restSeconds), 0);
  return Math.ceil(sec / 60) + 8; // + échauffement
}

/** Construit le programme à partir des réponses validées. `loads` = charges de lest réalisables. */
export function buildProgram(a: ProgramAnswers, loads: number[], kettlebells: number[] = [6, 12]): Program {
  const s = scheme(a.priority);
  const intensity = a.intensity ?? recIntensity(a).value;
  const rir = RIR[intensity];
  const pain = new Set(a.pains);
  const notes: string[] = [];
  const main = (variantId: string, extra: Partial<GenLine> = {}): GenLine => ({ variantId, kind: 'reps', role: 'work', sets: s.main.sets, targetReps: s.main.reps, targetRir: rir, restSeconds: s.main.rest, ...extra });
  const acc = (variantId: string, extra: Partial<GenLine> = {}): GenLine => ({ variantId, kind: 'reps', role: 'work', sets: s.acc.sets, targetReps: s.acc.reps, targetRir: Math.max(1, rir), restSeconds: s.acc.rest, ...extra });

  // Tirage : niveau d'après le max de tractions strictes.
  const pull = a.maxPullups;
  let pullLine: GenLine;
  if (pull === null || pull === undefined) {
    pullLine = main('pullup-strict', { cue: 'Semaine 1 : 1re série = test max' });
    notes.push('Tractions : max inconnu → test à la 1re séance, l’app ajuste ensuite.');
  } else if (pull < 3) pullLine = main('pullup-negative', { targetReps: 4, cue: 'Descente 4–5 s' });
  else if (pull < 8) pullLine = main('pullup-strict', { targetReps: Math.max(2, Math.min(s.main.reps, Math.floor(pull * 0.6))) });
  else if (pull < 12 || pain.has('coudes')) pullLine = main('pullup-strict', { targetReps: Math.min(s.main.reps + 2, Math.floor(pull * 0.6)) });
  else {
    const start = fit(pull >= 15 ? 10 : 5, loads.filter((l) => l > 0));
    pullLine = main('pullup-weighted', { loadKg: start, cue: 'Charge de départ estimée' });
    notes.push(`Tractions lestées : départ ${start} kg (estimé), corrigé dès la 1re séance.`);
  }

  // Poussée : dips si les épaules le permettent.
  const dips = a.maxDips;
  let pushLine: GenLine;
  if (pain.has('epaules')) {
    pushLine = main('pushup-standard', { targetReps: Math.max(6, Math.floor((a.maxPushups ?? 15) * 0.5)) });
    notes.push('Épaules : pas de dips ni de pompes piquées. Pompes à la place.');
  } else if (dips === null || dips === undefined) pushLine = main('dips-bars', { cue: 'Semaine 1 : 1re série = test max' });
  else if (dips < 4) pushLine = main('dips-bars', { targetReps: 3, cue: 'Descente contrôlée' });
  else if (dips < 12) pushLine = main('dips-bars', { targetReps: Math.max(3, Math.min(s.main.reps + 2, Math.floor(dips * 0.6))) });
  else {
    const start = fit(5, loads.filter((l) => l > 0));
    pushLine = main('dips-weighted', { loadKg: start, cue: 'Charge de départ estimée' });
  }

  const pushups = a.maxPushups ?? 0;
  const pushAcc = acc(pushups >= 30 && !pain.has('poignets') ? 'pushup-diamond' : 'pushup-standard');
  const legsOk = !pain.has('genoux');
  const backOk = !pain.has('dos');
  const kbs = [...kettlebells].sort((x, y) => x - y);
  const kb = kbs[kbs.length - 1] ?? 12; // la plus lourde pour les jambes et le tirage
  if (!legsOk) notes.push('Genoux : pas de squat bulgare ni de fentes.');
  if (!backOk) notes.push('Dos : pas de swing ni de soulevé de terre.');

  const A: GenTemplate = {
    key: 'A',
    title: 'Force haut du corps',
    lines: [pullLine, pushLine, acc('kb-row-1arm', { loadKg: kb, cue: 'Par bras' }), acc('leg-raise-hanging', { targetReps: 10 })],
  };
  const B: GenTemplate = {
    key: 'B',
    title: 'Jambes et gainage',
    lines: [
      main('squat-goblet-kb', { loadKg: kb, targetReps: Math.max(s.main.reps, 8) }),
      ...(legsOk ? [acc('split-squat-bulgarian', { cue: 'Par jambe' })] : []),
      ...(backOk ? [acc(a.priority === 'seche' ? 'kb-swing-2h' : 'kb-rdl', { loadKg: kb, targetReps: a.priority === 'seche' ? 15 : 10 })] : []),
      { variantId: 'hollow-hold', kind: 'hold', role: 'work', sets: 3, targetSeconds: 30, restSeconds: 45 },
    ],
  };
  const C: GenTemplate = {
    key: 'C',
    title: 'Volume et épaules',
    lines: [
      main(pull !== null && pull !== undefined && pull >= 5 ? 'chinup-strict' : pullLine.variantId, { targetReps: pullLine.targetReps, loadKg: undefined, cue: undefined }),
      pushAcc,
      ...(pain.has('epaules') ? [] : [acc('kb-press-1arm', { loadKg: kbs[0] ?? 6, cue: 'Par bras' })]),
      acc('knee-raise-hanging', { targetReps: 12 }),
    ],
  };

  // Durée : on retire des accessoires jusqu'à tenir dans le temps disponible.
  const budget = a.minutes ?? 60;
  for (const t of [A, B, C]) {
    while (estimateLineMinutes(t.lines) > budget && t.lines.length > 2) t.lines.pop();
  }

  const days = Math.min(6, Math.max(2, a.days ?? recDays(a).value));
  const order: GenTemplate[] = [A, B, C, A, B, C].slice(0, days);
  const templates: GenTemplate[] = days === 2 ? [A, B] : [A, B, C];
  const slot = a.slot ?? 'soir';
  const sDays = DAYS[days]!;
  const week: GenItem[] = order.map((t, i) => ({ day: sDays[i]!, start: START[slot], durationMin: estimateLineMinutes(t.lines), kind: 'seance', title: t.title, templateKey: t.key }));

  // Course : jours libres d'abord (week-end le matin), sinon le même jour le matin.
  const runs = Math.max(0, Math.min(5, a.runsPerWeek ?? recRuns(a).value));
  const free = [6, 5, 2, 3, 1, 4, 0].filter((d) => !sDays.includes(d));
  const runDays = [...free, ...[0, 1, 2, 3, 4, 5, 6].filter((d) => !free.includes(d))].slice(0, runs).sort((x, y) => x - y);
  const quality = intensity !== 'controlee' && (a.runGoal === '5k' || a.runGoal === '10k');
  const weeksN = a.weeks ?? recWeeks().value;
  // Base : plus longue course déclarée (3 km si inconnue) ; +10 % par semaine, arrondi au 0,5 km.
  const baseKm = Math.max(2, a.longestRunKm ?? 3);
  const half = (n: number) => Math.round(n * 2) / 2;
  const runItems = (w: number, test: boolean): GenItem[] =>
    runDays.map((d, i) => {
      const long = d >= 5 && i === runDays.length - 1;
      const sameDay = sDays.includes(d);
      const start = d >= 5 ? '09:30' : sameDay ? '07:00' : START[slot];
      const easy = half(baseKm * 0.8 * Math.pow(1.1, w));
      if (test && i === 0) {
        const km = a.runGoal === '10k' ? 10 : a.runGoal === '5k' ? 5 : half(baseKm * Math.pow(1.1, w));
        return { day: d, start, durationMin: Math.round(km * 7) + 10, kind: 'course', title: `Course · test ${km.toLocaleString('fr-BE')} km chrono`, km, detail: 'Re-test : à fond, temps noté' };
      }
      if (long) {
        const km = half(baseKm * 1.2 * Math.pow(1.1, w));
        return { day: d, start, durationMin: Math.round(km * 7.5), kind: 'course', title: `Course · sortie longue ${km.toLocaleString('fr-BE')} km`, km, detail: 'Allure facile : tu peux parler' };
      }
      if (quality && i === 0) {
        const reps = (a.runGoal === '10k' ? 4 : 6) + w;
        const dist = a.runGoal === '10k' ? '1 km' : '400 m';
        return { day: d, start, durationMin: 40, kind: 'course', title: `Course · fractionné ${reps} × ${dist}`, detail: `Échauffement 10 min · ${reps} × ${dist} vite · récup ${a.runGoal === '10k' ? '2 min' : '90 s'} trot · retour au calme 5 min` };
      }
      return { day: d, start, durationMin: Math.round(easy * 7), kind: 'course', title: `Course · endurance ${easy.toLocaleString('fr-BE')} km`, km: easy, detail: 'Allure facile : tu peux parler' };
    });
  week.push(...runItems(0, false));
  week.sort((x, y) => x.day - y.day || x.start.localeCompare(y.start));

  // Re-test la dernière semaine : la 1re séance devient le test des maxima.
  const T: GenTemplate = {
    key: 'T',
    title: 'Re-test des maxima',
    lines: [
      { variantId: 'pullup-strict', kind: 'reps', role: 'test', sets: 1, restSeconds: 240, cue: 'Max strict, une seule série' },
      { variantId: pain.has('epaules') ? 'pushup-standard' : 'dips-bars', kind: 'reps', role: 'test', sets: 1, restSeconds: 240, cue: 'Max propre' },
      { variantId: 'pushup-standard', kind: 'reps', role: 'test', sets: 1, restSeconds: 180, cue: 'Max, poitrine au sol' },
    ],
  };
  const weekly: GenItem[][] = Array.from({ length: weeksN }, (_, w) => {
    const last = w === weeksN - 1 && weeksN > 1;
    const force = week.filter((x) => x.kind === 'seance').map((x, i) => (last && i === 0 ? { ...x, title: T.title, templateKey: 'T' as const, durationMin: 25 } : x));
    return [...force, ...runItems(w, last)].sort((x, y) => x.day - y.day || x.start.localeCompare(y.start));
  });
  templates.push(T);

  const strict = a.strictness ?? recStrictness(a).value;
  const rules =
    strict === 'souple'
      ? ['Séance déplaçable dans la semaine', 'Imprévu : version courte proposée']
      : strict === 'strict'
        ? ['Jours fixes', 'Imprévu : version courte le jour même, pas de report']
        : ['Jours fixes, rien ne se déplace', 'Imprévu : version 20 min le jour même', 'Exception : maladie ou douleur → adaptation'];
  rules.push(`Réserve : ${rir === 0 ? 'dernière série à l’échec' : `${rir} répétition${rir > 1 ? 's' : ''} en réserve`}`);
  rules.push('Trop facile → la charge monte (matériel réel)');

  const label: Record<Priority, string> = { force: 'Force', muscle: 'Muscle', seche: 'Sèche', course: 'Course', hybride: 'Hybride' };
  return { title: `Winter Arc · ${label[a.priority ?? 'hybride']}`, weeks: weeksN, templates, week, weekly, rules, notes };
}
