// « Compléter mon profil » : activité de la journée et gêne articulaire. Questions courtes, préremplies, conditionnelles.
// Tu valides UNE synthèse (cible provisoire, semaine, adaptation à la gêne, évaluations) : rien n'est appliqué avant.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { SIT_LABELS, usableActivity, type ActivityAnswers, type SitBand, type Training, type TreadmillUse } from '../engine/activity';
import type { Decision } from '../engine/decide';
import {
  ALERT_LABELS,
  CURRENT_LABELS,
  JOINT_ALERT_CHOICES,
  ONSET_LABELS,
  SIDE_LABELS,
  SYMPTOM_LABELS,
  TREND_LABELS,
  TRIGGER_LABELS,
  ZONE_LABELS,
  adaptationPatterns,
  jointAdvice,
  testPatterns,
  toggleSymptom,
  type JointAlert,
  type JointAnswer,
  type JointCurrent,
  type JointOnset,
  type JointSide,
  type JointSymptom,
  type JointTrend,
  type JointTrigger,
  type JointZone,
} from '../engine/joints';
import { DAY_NAMES, conflicts, dateOf, type FixedEvent, type PlannedItem } from '../engine/planning';
import { adviseRuns, spaceRuns } from '../engine/runSchedule';
import { calorieTarget, type Strategy } from '../engine/targets';
import type { OnboardingAnswers } from '../engine/profile';
import { findVariant } from '../catalog/exercises';
import type { Repository } from '../storage/db';
import { loadAllFixed } from './agenda';
import { Help, Modal } from './common';
import { JOINT_ADAPT, declaredZones, loadComplement, loadTraining, saveComplement, type Complement as ComplementData, type JointAdapt } from './profileComplement';
import { appendJournal } from './journal';
import { loadPlanning } from './Planning';
import { loadOnboarding } from './profileStore';
import { programStrategy } from './Targets';
import { deviceTimeZone } from './support';
import { localDay } from '../engine/derive';
import { project } from '../engine/session';

const PLAN_KEY = 'planning.items';
const PROGRAM_KEY = 'program.current';

interface Inputs {
  a: OnboardingAnswers;
  weightKg?: number;
  strategy?: Strategy;
  training?: Training;
  items: PlannedItem[];
  fixed: FixedEvent[];
  today: string;
  tired: boolean;
  /** Jours des séances de force réellement faites (au moins une série terminée). */
  sessionDays: string[];
  /** Variantes du programme (pour montrer ce que l'adaptation à la gêne touche). */
  variants: string[];
  /** Variantes des tests maximaux du programme. */
  testVariants: string[];
  /** Les réponses d'avant la version 2 sur les pas sont à refaire. */
  legacySteps: boolean;
}

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="chip" aria-pressed={on} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {on && <Check size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}

export interface RunPlan {
  /** Courses à déplacer sur un jour libre, avec un jour de repos entre deux sorties. */
  changes: { id: string; title: string; weekStart: string; fromDay: number; toDay: number; start: string }[];
  /** Aucun jour libre : une course est gardée, l'autre devient une marche facile (sans rattrapage). */
  advice: { weekStart: string; keep: { id: string; title: string; date: string }; replace: { id: string; title: string; date: string }; reason: string }[];
}

/** Courses à espacer : calcul sur le planning réel (passé, séances démarrées et conflits d'agenda exclus). */
export function planRuns(items: PlannedItem[], fixed: FixedEvent[], today: string, ctx: { tired?: boolean; sessionDays?: string[] } = {}): RunPlan {
  const byWeek = new Map<string, PlannedItem[]>();
  for (const it of items) byWeek.set(it.weekStart, [...(byWeek.get(it.weekStart) ?? []), it]);
  const changes: RunPlan['changes'] = [];
  const advice: RunPlan['advice'] = [];
  for (const [weekStart, week] of [...byWeek].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (dateOf(weekStart, 6) < today) continue;
    const r = spaceRuns(week, {
      movable: (x) => dateOf(x.weekStart, x.day) >= today && !x.sessionId && x.adjustment?.decision !== 'annulée',
      canUse: (d, x) => dateOf(weekStart, d) >= today && conflicts(d, '12:30', x.durationMin, fixed).length === 0,
    });
    for (const m of r.moved) changes.push({ id: m.item.id, title: m.item.title, weekStart, fromDay: m.fromDay, toDay: m.toDay, start: '12:30' });
    for (const u of r.unresolved) {
      const later = week.find((x) => x.kind === 'course' && x.day === u.day + 1);
      if (!later || later.sessionId || u.sessionId || dateOf(weekStart, later.day) < today) continue;
      // Séances réellement faites cette semaine : celles lancées depuis le planning ET celles lancées à la main.
      const linked = week.filter((x) => x.kind === 'seance' && x.sessionId).length;
      const real = (ctx.sessionDays ?? []).filter((d) => d >= weekStart && d <= dateOf(weekStart, 6)).length;
      const sessionsDone = Math.max(linked, real);
      const a = adviseRuns(u, later, { tired: !!ctx.tired, sessionsDone });
      advice.push({
        weekStart,
        keep: { id: a.keep.id, title: a.keep.title, date: dateOf(weekStart, a.keep.day) },
        replace: { id: a.replace.id, title: a.replace.title, date: dateOf(weekStart, a.replace.day) },
        reason: a.reason,
      });
    }
  }
  return { changes, advice };
}

/** Évaluation de course facile et reproductible, plutôt qu'un maximum : durée courue confortablement, difficulté ressentie, récupération. */
const EASY_EVAL = { title: 'Course · évaluation facile', km: undefined as number | undefined, detail: 'Allure facile : note la durée courue confortablement, la difficulté ressentie et ta récupération. Pas de maximum.' };

const WRONG_REASON = 'aucune séance de force encore faite cette semaine';

/**
 * Une justification enregistrée peut avoir été fausse (séance lancée hors planning, donc non comptée) : l'entrée d'origine reste,
 * une correction datée s'ajoute. Rien n'est réécrit en silence.
 */
export function correctReasons(items: PlannedItem[], sessionDays: string[], now: number, today: string): { items: PlannedItem[]; corrected: number } {
  let corrected = 0;
  const out = items.map((x) => {
    const adj = x.adjustment;
    if (!adj?.note?.includes(WRONG_REASON) || adj.corrections?.length) return x;
    const done = sessionDays.filter((d) => d >= x.weekStart && d <= dateOf(x.weekStart, 6)).sort();
    if (!done.length) return x;
    corrected++;
    const text = `Correction du ${dm(today)} : ${done.length === 1 ? `la séance de force du ${dm(done[0]!)} était bien comptée` : `${done.length} séances de force (${done.map(dm).join(', ')}) étaient bien comptées`}. La décision (marche à la place, sans rattrapage) reste inchangée.`;
    return { ...x, adjustment: { ...adj, corrections: [...(adj.corrections ?? []), { at: now, text }] } };
  });
  return { items: out, corrected };
}

async function doneSessionDays(repo: Repository): Promise<string[]> {
  const days: string[] = [];
  for (const evs of (await repo.allSessionEvents()).values()) {
    const st = project(evs);
    if (st && st.sets.some((x) => x.status === 'done')) days.push(localDay(st.startedAt, st.timeZone));
  }
  return days;
}

export function ComplementModal({ open, onClose, repo }: { open: boolean; onClose: () => void; repo: Repository }) {
  const [c, setC] = useState<ComplementData>({});
  const [inp, setInp] = useState<Inputs | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  // Dernier état des réponses : deux touches rapprochées ne s'écrasent pas.
  const latest = useRef<ComplementData>({});
  latest.current = c;

  const load = async () => {
    const ob = await loadOnboarding(repo);
    const prog = await repo.getKv<{ answers?: { pains?: string[]; priority?: string }; program?: { templates?: { lines: { variantId: string; role?: string }[] }[] } }>(PROGRAM_KEY);
    const comp = await loadComplement(repo);
    // Zones déjà déclarées : proposées cochées, à confirmer.
    if (!comp.joints) {
      const z = declaredZones(prog?.answers?.pains, ob.answers.safety.pains);
      if (z.length) comp.joints = z.map((zone) => ({ zone, triggers: [], alerts: [] }));
    }
    // Réponses d'avant la version 2 : le total de pas était ambigu, il est à refaire. Les heures assises sont conservées.
    const legacySteps = !!comp.activity && comp.activity.v !== 2 && (comp.activity as { steps?: number }).steps !== undefined;
    if (comp.activity && comp.activity.v !== 2) comp.activity = { v: 2, sitHours: comp.activity.sitHours, at: comp.activity.at };
    setC(comp);
    const weights = (await repo.getKv<{ day: string; kg: number }[]>('weight.log')) ?? [];
    const last = [...weights].sort((a, b) => (a.day < b.day ? -1 : 1)).pop();
    const today = localDay(Date.now(), deviceTimeZone());
    const rlog = (await repo.getKv<{ day: string; tired: boolean }[]>('readiness.log')) ?? [];
    const recent = new Set([0, 1, 2].map((k) => new Date(Date.parse(`${today}T12:00:00Z`) - k * 864e5).toISOString().slice(0, 10)));
    const sessionDays = await doneSessionDays(repo);
    // Correction datée d'une justification fausse (l'entrée d'origine est conservée).
    const fixed = correctReasons(await loadPlanning(repo), sessionDays, Date.now(), today);
    if (fixed.corrected) await repo.setKv(PLAN_KEY, fixed.items);
    const lines = (prog?.program?.templates ?? []).flatMap((t) => t.lines);
    setInp({
      a: ob.answers,
      weightKg: last?.kg ?? ob.answers.body.weightKg.value,
      strategy: programStrategy(prog ? { answers: prog.answers ?? {} } : undefined),
      training: await loadTraining(repo),
      items: fixed.items,
      fixed: await loadAllFixed(repo),
      today,
      tired: rlog.some((x) => x.tired && recent.has(x.day)),
      sessionDays,
      variants: [...new Set(lines.filter((l) => l.role !== 'test').map((l) => l.variantId))],
      testVariants: [...new Set(lines.filter((l) => l.role === 'test').map((l) => l.variantId))],
      legacySteps,
    });
  };
  useEffect(() => {
    if (open) {
      setApplied(null);
      void load();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Toute modification des réponses annule la validation précédente. */
  const update = (fn: (x: ComplementData) => ComplementData) => {
    if (!inp) return; // réponses pas encore chargées : on n'écrase rien
    const next = { ...fn(latest.current), validated: undefined };
    latest.current = next;
    setC(next);
    setApplied(null);
    void saveComplement(repo, next);
  };
  const act: ActivityAnswers = c.activity ?? { v: 2 };
  const setAct = (patch: Partial<ActivityAnswers>) => update((x) => ({ ...x, activity: { ...(x.activity ?? {}), v: 2, ...patch, at: Date.now() } }));
  const tread: TreadmillUse = act.treadmill ?? {};
  const setTread = (patch: Partial<TreadmillUse>) => setAct({ treadmill: { ...tread, ...patch } });
  const joints = c.joints ?? [];
  // Dès que tu précises ce que tu ressens, l'ancienne réponse combinée disparaît : seule ta nouvelle réponse est conservée.
  const setJoint = (zone: JointZone, patch: Partial<JointAnswer>) =>
    update((x) => ({ ...x, joints: (x.joints ?? []).map((j) => (j.zone === zone ? { ...j, ...patch, ...(patch.symptoms?.length ? { alerts: j.alerts.filter((a) => a !== 'faiblesse') } : {}), ...(patch.onset || patch.current ? { alerts: (patch.symptoms?.length ? j.alerts.filter((a) => a !== 'faiblesse') : j.alerts).filter((a) => !(a === 'soudain' && (patch.onset ?? j.onset) && (patch.current ?? j.current))) } : {}) } : j)) }));
  const toggleZone = (zone: JointZone) =>
    update((x) => ({ ...x, joints: (x.joints ?? []).some((j) => j.zone === zone) ? (x.joints ?? []).filter((j) => j.zone !== zone) : [...(x.joints ?? []), { zone, triggers: [], alerts: [] }] }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const advice = useMemo(() => jointAdvice(joints), [joints]);
  const patterns = useMemo(() => adaptationPatterns(joints), [joints]);
  const tests = useMemo(() => testPatterns(joints), [joints]);
  const match = (list: string[], v: string) => list.some((p) => new RegExp(p).test(v));
  const touched = useMemo(() => (inp ? inp.variants.filter((v) => match(patterns, v)) : []), [inp, patterns]);
  const testsTouched = useMemo(() => (inp ? inp.testVariants.filter((v) => match(tests, v)) : []), [inp, tests]);
  const chronos = useMemo(() => (inp ? inp.items.filter((x) => x.kind === 'course' && /chrono/i.test(x.title) && dateOf(x.weekStart, x.day) >= inp.today && !x.sessionId) : []), [inp]);
  const retests = useMemo(() => (inp && tests.length ? inp.items.filter((x) => x.templateId === 'prog-T' && dateOf(x.weekStart, x.day) >= inp.today && !x.sessionId) : []), [inp, tests]);
  const kcal = useMemo(() => {
    if (!inp) return undefined;
    const base = { sex: inp.a.body.formulaSex, age: inp.a.body.age.value, heightCm: inp.a.body.heightCm.value, weightKg: inp.weightKg, strategy: inp.strategy, goal: inp.a.goal.main };
    return {
      before: calorieTarget({ ...base, sessionsPerWeek: inp.a.sleep.sessionsPerWeek }),
      after: calorieTarget({ ...base, sessionsPerWeek: inp.a.sleep.sessionsPerWeek, activity: usableActivity(c.activity), training: inp.training }),
    };
  }, [inp, c.activity]);
  const runs = useMemo(() => (inp ? planRuns(inp.items, inp.fixed, inp.today, { tired: inp.tired, sessionDays: inp.sessionDays }) : null), [inp]);
  const weekPreview = useMemo(() => {
    if (!inp || !runs || (!runs.changes.length && !runs.advice.length)) return null;
    const ws = (runs.advice[0] ?? runs.changes[0]!).weekStart;
    const mine = new Map(runs.changes.filter((x) => x.weekStart === ws).map((x) => [x.id, x]));
    const gone = new Set(runs.advice.filter((x) => x.weekStart === ws).map((x) => x.replace.id));
    return {
      weekStart: ws,
      rows: inp.items
        .filter((x) => x.weekStart === ws)
        .map((x) => ({ ...x, day: mine.get(x.id)?.toDay ?? x.day, start: mine.get(x.id)?.start ?? x.start, moved: mine.has(x.id), from: x.day, title: gone.has(x.id) ? 'Marche facile (remplace la course)' : x.title }))
        .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
    };
  }, [inp, runs]);

  /** Une seule validation applique la synthèse : semaine, adaptation, évaluations, cible. */
  const validate = async () => {
    if (!inp || !runs) return;
    const done: string[] = [];
    const byId = new Map(runs.changes.map((x) => [x.id, x]));
    const replace = new Map(runs.advice.map((x) => [x.replace.id, x]));
    const retestIds = new Set(retests.map((x) => x.id));
    const chronoIds = new Set(chronos.map((x) => x.id));
    if (runs.changes.length || runs.advice.length || retestIds.size || chronoIds.size) {
      const items = (await loadPlanning(repo)).map((x) => {
        const m = byId.get(x.id);
        if (m) return { ...x, day: m.toDay, start: m.start, moves: [...x.moves, { at: Date.now(), fromDay: x.day, fromStart: x.start }] };
        const r = replace.get(x.id);
        if (r) {
          return {
            ...x,
            kind: 'marche' as const,
            title: 'Marche facile',
            km: undefined,
            detail: 'Remplace la course, sans rattrapage',
            durationMin: 30,
            templateId: undefined,
            adapted: undefined,
            adjustment: { reason: 'deplacement' as const, decision: 'remplacée' as const, at: Date.now(), note: `remplace « ${x.title} » : courses consécutives. ${r.reason}` },
          };
        }
        if (chronoIds.has(x.id)) {
          return { ...x, ...EASY_EVAL, adjustment: { reason: 'deplacement' as const, decision: 'adaptée' as const, at: Date.now(), note: 'Chrono maximal remplacé par une évaluation facile : reprise après une longue pause, objectif courir 10 km sans marcher.' } };
        }
        if (retestIds.has(x.id) && !x.adjustment) {
          return { ...x, adjustment: { reason: 'douleur' as const, decision: 'adaptée' as const, at: Date.now(), note: 'Test maximal remplacé par une série sous-maximale sur les mouvements concernés (gêne déclarée). À réévaluer avant la date : report ou annulation possibles selon l’évolution.' } };
        }
        return x;
      });
      await repo.setKv(PLAN_KEY, items);
      const prog = await repo.getKv<{ program: { week: { day: number; start: string; durationMin: number; kind: string }[]; weekly?: { day: number; start: string; durationMin: number; kind: string }[][] } }>(PROGRAM_KEY);
      if (prog?.program && (runs.changes.length || chronoIds.size)) {
        type W = { day: number; start: string; durationMin: number; kind: string; title?: string };
        const fix = (w: W[]) => spaceRuns(w, { start: '12:30' }).items.map((x) => (chronoIds.size && x.kind === 'course' && /chrono/i.test(x.title ?? '') ? { ...x, ...EASY_EVAL } : x));
        await repo.setKv(PROGRAM_KEY, { ...prog, program: { ...prog.program, week: fix(prog.program.week as W[]), weekly: prog.program.weekly?.map((w) => fix(w as W[])) } });
      }
      if (chronoIds.size) done.push('chrono maximal remplacé par une évaluation facile');
      if (runs.changes.length) done.push(`${runs.changes.length} course${runs.changes.length > 1 ? 's' : ''} déplacée${runs.changes.length > 1 ? 's' : ''}`);
      if (runs.advice.length) done.push(`${runs.advice.length} course${runs.advice.length > 1 ? 's' : ''} remplacée${runs.advice.length > 1 ? 's' : ''} par une marche`);
      if (retestIds.size) done.push('test maximal remplacé par une série sous-maximale');
    }
    // Adaptation à la gêne : elle modifie la prescription de chaque séance et laisse une trace dans le journal.
    if (patterns.length || tests.length) {
      const adapt: JointAdapt = { patterns, tests, at: Date.now() };
      await repo.setKv(JOINT_ADAPT, adapt);
      const reason = (kind: string) => `${kind} Proposition à vérifier pendant la séance et le lendemain, pas une garantie.`;
      const mk = (variantId: string, rule: string, text: string): Decision => ({
        variantId,
        before: { target: 0 },
        after: { target: 0 },
        action: 'maintenir',
        done: true,
        targetReached: false,
        progressionAllowed: false,
        observations: [`gêne déclarée : ${joints.map((j) => `${ZONE_LABELS[j.zone].toLowerCase()}${j.side ? ` ${SIDE_LABELS[j.side]}` : ''}`).join(', ')}`],
        rule,
        missing: [],
        reason: reason(text),
        reevaluate: 'après 2 séances, selon ta réaction pendant et le lendemain',
      });
      const decisions: Decision[] = [
        ...touched.map((v) => mk(v, 'gêne : adaptation acceptée', 'Marge de 3 répétitions, une série de moins, amplitude confortable, charge gelée.')),
        ...testsTouched.map((v) => mk(`${v}:test`, 'gêne : test maximal remplacé', 'Test maximal remplacé par une série sous-maximale (3 répétitions en réserve).')),
      ];
      if (decisions.length) await appendJournal(repo, decisions, 'gêne · adaptation acceptée', `gene-${inp.today}`);
      if (touched.length) done.push(`${touched.length} exercice${touched.length > 1 ? 's' : ''} adapté${touched.length > 1 ? 's' : ''}`);
    } else if (await repo.getKv(JOINT_ADAPT)) {
      await repo.setKv(JOINT_ADAPT, { patterns: [], tests: [], at: Date.now() });
    }
    if (hasActivityNow) done.push(`cible ${kcal?.after.value?.kcal ?? '—'} kcal`);
    const next = { ...c, validated: Date.now() };
    setC(next);
    await saveComplement(repo, next);
    setApplied(done.length ? `Validé : ${done.join(' · ')}.` : 'Validé.');
    setInp({ ...inp, items: await loadPlanning(repo) });
  };

  const bands: SitBand[] = ['<6', '6-9', '9-12', '>12'];
  const triggers: JointTrigger[] = ['tractions', 'dips', 'pompes', 'developpe', 'rowing', 'inconnu'];
  const symptoms: JointSymptom[] = ['perte_force', 'derobement', 'douleur_limitante', 'fatigue_fin', 'inconnu'];
  const alerts: JointAlert[] = JOINT_ALERT_CHOICES;
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v.replace(',', '.')) || 0));
  const hasActivityNow = act.steps !== undefined || act.sitHours !== undefined;
  const nothing = !runs?.changes.length && !runs?.advice.length && !patterns.length && !tests.length && !chronos.length && !hasActivityNow;

  return (
    <Modal open={open} onClose={onClose} title="Compléter mon profil">
      <div className="stack">
        <h3 style={{ margin: 0 }}>Activité</h3>
        <Help>Trois choses séparées : ta vie quotidienne, ta marche volontaire sur tapis, et tes séances. Chacune est comptée une seule fois.</Help>
        {inp?.legacySteps && <p className="notice warn" style={{ margin: 0 }}>Tes réponses précédentes sur les pas sont à refaire : le total mélangeait vie quotidienne et tapis.</p>}
        <p className="eyebrow" style={{ margin: 0 }}>Assis par jour</p>
        <div className="chips">
          {bands.map((b) => (
            <Chip key={b} on={act.sitHours === b} onClick={() => setAct({ sitHours: act.sitHours === b ? undefined : b })}>
              {SIT_LABELS[b]}
            </Chip>
          ))}
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Pas par jour, hors tapis et hors course</span>
          <input type="number" inputMode="numeric" min={0} placeholder="je ne sais pas" value={act.steps ?? ''} onChange={(e) => setAct({ steps: e.target.value === '' ? undefined : Math.floor(num(e.target.value) ?? 0) })} />
        </label>
        {act.steps !== undefined && (
          <div className="chips">
            <Chip on={act.stepsMeasured !== false} onClick={() => setAct({ stepsMeasured: true })}>mesuré</Chip>
            <Chip on={act.stepsMeasured === false} onClick={() => setAct({ stepsMeasured: false })}>estimé</Chip>
          </div>
        )}
        <Help>Tes déplacements du quotidien : maison, courses, trajets. Pas le tapis ni la course.</Help>
        <p className="eyebrow" style={{ margin: 0 }}>Tapis de marche : ce que tu fais réellement</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 90 }}>
            <span className="eyebrow">Jours par semaine</span>
            <input type="number" inputMode="numeric" min={0} max={7} placeholder="0" value={tread.daysPerWeek ?? ''} onChange={(e) => setTread({ daysPerWeek: num(e.target.value) })} />
          </label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 90 }}>
            <span className="eyebrow">Minutes par séance</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={tread.minutes ?? ''} onChange={(e) => setTread({ minutes: num(e.target.value) })} />
          </label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 90 }}>
            <span className="eyebrow">Vitesse km/h</span>
            <input type="text" inputMode="decimal" placeholder="4,5" value={tread.speedKmh ?? ''} onChange={(e) => setTread({ speedKmh: num(e.target.value) })} />
          </label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 90 }}>
            <span className="eyebrow">Inclinaison %</span>
            <input type="text" inputMode="decimal" placeholder="0" value={tread.inclinePct ?? ''} onChange={(e) => setTread({ inclinePct: num(e.target.value) })} />
          </label>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 120 }}>
            <span className="eyebrow">Dont jours plus courts</span>
            <input type="number" inputMode="numeric" min={0} max={7} placeholder="0" value={tread.shortDays ?? ''} onChange={(e) => setTread({ shortDays: num(e.target.value) })} />
          </label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 120 }}>
            <span className="eyebrow">Minutes ces jours-là</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={tread.shortMinutes ?? ''} onChange={(e) => setTread({ shortMinutes: num(e.target.value) })} />
          </label>
        </div>
        {tread.speedKmh !== undefined && (
          <div className="chips">
            <Chip on={tread.speedShown !== false} onClick={() => setTread({ speedShown: true })}>vitesse affichée par le tapis</Chip>
            <Chip on={tread.speedShown === false} onClick={() => setTread({ speedShown: false })}>vitesse estimée</Chip>
          </div>
        )}
        <Help>Ce que tu fais vraiment, pas ton objectif de pas. Si tu fais parfois 60 minutes et parfois 130, indique les jours plus courts plutôt que de lisser. Vitesse et inclinaison sont facultatives : sans vitesse, 4,5 km/h sont supposés et l’app le dit. Ne modifie pas une vitesse affichée pour retrouver 10 000 pas : la conversion pas–distance n’est qu’une estimation. Ta musculation et ta course sont déjà dans ton programme.</Help>

        <h3 style={{ margin: '8px 0 0' }}>Gêne</h3>
        <Help>L’app ne pose pas de diagnostic. Décris ce que tu ressens, pas ce que tu arrives à faire : tes séries en séance n’excluent pas une faiblesse d’un côté, un dérobement ou une gêne sur un geste précis.</Help>
        <div className="chips">
          {(['epaule', 'coudes'] as JointZone[]).map((z) => (
            <Chip key={z} on={joints.some((j) => j.zone === z)} onClick={() => toggleZone(z)}>
              {ZONE_LABELS[z]}
            </Chip>
          ))}
        </div>
        {joints.map((j) => (
          <section key={j.zone} className="card stack" aria-label={ZONE_LABELS[j.zone]}>
            <strong>{ZONE_LABELS[j.zone]}</strong>
            <p className="eyebrow" style={{ margin: 0 }}>Côté</p>
            <div className="chips">
              {(['gauche', 'droite', 'les-deux'] as JointSide[]).map((v) => (
                <Chip key={v} on={j.side === v} onClick={() => setJoint(j.zone, { side: j.side === v ? undefined : v })}>{SIDE_LABELS[v]}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Ce que tu ressens</p>
            <div className="chips">
              {symptoms.map((sy) => (
                <Chip key={sy} on={(j.symptoms ?? []).includes(sy)} onClick={() => setJoint(j.zone, { symptoms: toggleSymptom(j.symptoms ?? [], sy) })}>{SYMPTOM_LABELS[sy]}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Comment ça a commencé</p>
            <div className="chips">
              {(['evenement', 'progressif', 'inconnu'] as JointOnset[]).map((v) => (
                <Chip key={v} on={j.onset === v} onClick={() => setJoint(j.zone, { onset: j.onset === v ? undefined : v })}>{ONSET_LABELS[v]}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Aujourd’hui, les symptômes sont</p>
            <div className="chips">
              {(['present', 'ancien'] as JointCurrent[]).map((v) => (
                <Chip key={v} on={j.current === v} onClick={() => setJoint(j.zone, { current: j.current === v ? undefined : v })}>{CURRENT_LABELS[v]}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Sur quel geste</p>
            <div className="chips">
              {triggers.map((t) => (
                <Chip key={t} on={j.triggers.includes(t)} onClick={() => setJoint(j.zone, { triggers: toggle(j.triggers, t) })}>{TRIGGER_LABELS[t]}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Depuis</p>
            <div className="chips">
              {([['<1m', 'moins d’un mois'], ['1-6m', '1 à 6 mois'], ['>6m', 'plus de 6 mois']] as const).map(([v, l]) => (
                <Chip key={v} on={j.since === v} onClick={() => setJoint(j.zone, { since: j.since === v ? undefined : v })}>{l}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Fréquence</p>
            <div className="chips">
              {([['rare', 'rare'], ['parfois', 'parfois'], ['souvent', 'souvent']] as const).map(([v, l]) => (
                <Chip key={v} on={j.freq === v} onClick={() => setJoint(j.zone, { freq: j.freq === v ? undefined : v })}>{l}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Douleur maximale /10</p>
            <div className="chips">
              {Array.from({ length: 11 }, (_, n) => (
                <Chip key={n} on={j.maxPain === n} onClick={() => setJoint(j.zone, { maxPain: j.maxPain === n ? undefined : n })}>{n}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Le lendemain</p>
            <div className="chips">
              {([['rien', 'rien'], ['legere', 'légère'], ['dure', 'elle dure']] as const).map(([v, l]) => (
                <Chip key={v} on={j.next === v} onClick={() => setJoint(j.zone, { next: j.next === v ? undefined : v })}>{l}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Évolution</p>
            <div className="chips">
              {(['mieux', 'pareil', 'pire'] as JointTrend[]).map((v) => (
                <Chip key={v} on={j.trend === v} onClick={() => setJoint(j.zone, { trend: j.trend === v ? undefined : v })}>{TREND_LABELS[v]}</Chip>
              ))}
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Signaux</p>
            <div className="chips">
              {alerts.map((al) => (
                <Chip key={al} on={j.alerts.includes(al)} onClick={() => setJoint(j.zone, { alerts: toggle(j.alerts, al) })}>{ALERT_LABELS[al]}</Chip>
              ))}
            </div>
          </section>
        ))}
        {advice.clarify.length > 0 && (
          <p role="status" className="notice" style={{ margin: 0 }}>
            Ton ancienne réponse « perte de force ou instabilité » ({advice.clarify.map((z) => ZONE_LABELS[z].toLowerCase()).join(', ')}) est à clarifier : coche ce que tu ressens vraiment, ou « Je ne sais pas distinguer ». Elle n’est pas reprise comme « moins de force ».
          </p>
        )}
        {advice.clarifyOnset.length > 0 && (
          <p role="status" className="notice" style={{ margin: 0 }}>
            « Apparu d’un coup » ({advice.clarifyOnset.map((z) => ZONE_LABELS[z].toLowerCase()).join(', ')}) est à préciser : comment ça a commencé, et si les symptômes sont encore présents. Ni urgence affirmée, ni « tout va bien ».
          </p>
        )}
        {advice.hold && <p className="notice" style={{ margin: 0 }}>{advice.hold}</p>}
        {advice.referral && (
          <p role="alert" className="notice warn" style={{ margin: 0, fontWeight: advice.referral.level === 'urgent' ? 700 : 400 }}>
            {advice.referral.text}
          </p>
        )}

        <h3 style={{ margin: '8px 0 0' }}>Ma synthèse</h3>
        <Help>Rien n’est appliqué avant ta validation. Si tu changes une réponse, la validation est à refaire.</Help>
        {kcal?.after.value && (
          <section className="card stack" aria-label="Cible provisoire">
            <strong>Cible provisoire</strong>
            <p className="num" style={{ margin: 0 }}>
              {kcal.before.value ? `${kcal.before.value.kcal} → ` : ''}
              <strong>{kcal.after.value.kcal} kcal</strong> · P {kcal.after.value.proteinG} g
              {kcal.after.value.basis === 'séances' && ' · activité non renseignée : cible inchangée'}
            </p>
            <Help>
              <ol style={{ margin: 0, paddingLeft: 18 }}>{kcal.after.why.map((w) => <li key={w}>{w}</li>)}</ol>
              Stratégie {kcal.after.value.strategy}. Une estimation, pas une mesure : elle ne baisse pas parce que tu marches sur tapis plutôt que dehors. Elle est corrigée seulement après 2 semaines de pesées et 7 jours de repas notés.
            </Help>
          </section>
        )}
        {runs && (
          <section className="card stack" aria-label="Semaine adaptée">
            <strong>Semaine adaptée</strong>
            {!runs.changes.length && !runs.advice.length && <p className="muted" style={{ margin: 0 }}>Aucune course consécutive.</p>}
            {runs.advice.map((a) => (
              <p key={a.replace.id} className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {dm(a.keep.date)} : je garde « {a.keep.title} ». {dm(a.replace.date)} : marche facile à la place, sans rattrapage. {a.reason}
              </p>
            ))}
            {weekPreview && (
              <>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Semaine du {dm(weekPreview.weekStart)}, avec la proposition</p>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }} className="stack">
                  {weekPreview.rows.map((r) => (
                    <li key={r.id} className="stack" style={{ gap: 0 }}>
                      <strong className="num">{DAY_NAMES[r.day]!.slice(0, 3)} {dm(dateOf(r.weekStart, r.day))} · {r.start}</strong>
                      <span className="muted">{r.title}{r.moved ? ` (avant : ${DAY_NAMES[r.from]!.slice(0, 3)})` : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {runs.changes.length > 0 && (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {runs.changes.length} course{runs.changes.length > 1 ? 's' : ''} à déplacer sur les semaines à venir : un jour de repos entre deux sorties, à midi.
              </p>
            )}
          </section>
        )}
        {joints.length > 0 && (
          <section className="card stack" aria-label="Adaptation à la gêne">
            <strong>Programme adapté et évaluations</strong>
            {touched.length > 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Exercices adaptés : {touched.map((v) => findVariant(v)?.variant.name ?? v).join(', ')}. Marge de 3 répétitions, une série de moins, jamais à l’échec, charge gelée. Une proposition à vérifier, pas une garantie.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Aucun geste déclencheur connu : les séances de travail ne changent pas, la charge reste gelée.</p>
            )}
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              {testsTouched.length > 0
                ? `Test maximal remplacé par une série sous-maximale sur : ${testsTouched.map((v) => findVariant(v)?.variant.name ?? v).join(', ')}${retests.length ? ` (séance du ${retests.map((x) => dm(dateOf(x.weekStart, x.day))).join(', ')})` : ''}. Report ou annulation possibles selon l’évolution.`
                : 'Aucun test maximal sur un mouvement symptomatique.'}
            </p>
            {advice.clarify.length > 0 && (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                À clarifier ({advice.clarify.map((z) => ZONE_LABELS[z].toLowerCase()).join(', ')}) : ni perte de force affirmée, ni « tout va bien ».
              </p>
            )}
            {advice.items.map((it) => (
              <p key={it.zone + it.text} className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{ZONE_LABELS[it.zone]} · {it.text}</p>
            ))}
          </section>
        )}
        {chronos.length > 0 && (
          <section className="card stack" aria-label="Évaluation de course">
            <strong>Évaluation de course</strong>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Le chrono maximal du {chronos.map((x) => dm(dateOf(x.weekStart, x.day))).join(', ')} est remplacé par une évaluation facile : durée courue confortablement, difficulté ressentie, récupération. Ton objectif est de courir 10 km sans marcher après une longue pause : un maximum n’est pas nécessaire pour ça.
            </p>
          </section>
        )}
        {c.validated ? (
          <p role="status" style={{ margin: 0 }}>
            <Check size={14} aria-hidden="true" /> {applied ?? 'Synthèse validée.'}
          </p>
        ) : (
          <button className="btn primary block" disabled={nothing} onClick={validate}>Valider cette synthèse</button>
        )}
        <button className="btn ghost block" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
