// « Compléter mon profil » : activité de la journée et gêne articulaire. Questions courtes, préremplies, conditionnelles.
// Tu valides UNE synthèse (cible provisoire, semaine adaptée, adaptation à la gêne) : rien n'est appliqué avant.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { SIT_LABELS, type ActivityAnswers, type SitBand, type Training } from '../engine/activity';
import type { Decision } from '../engine/decide';
import { ALERT_LABELS, TREND_LABELS, TRIGGER_LABELS, ZONE_LABELS, adaptationPatterns, jointAdvice, type JointAlert, type JointAnswer, type JointTrend, type JointTrigger, type JointZone } from '../engine/joints';
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
  /** Variantes du programme (pour montrer ce que l'adaptation à la gêne touche). */
  variants: string[];
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
export function planRuns(items: PlannedItem[], fixed: FixedEvent[], today: string, ctx: { tired?: boolean } = {}): RunPlan {
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
      const sessionsDone = week.filter((x) => x.kind === 'seance' && x.sessionId).length;
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

export function ComplementModal({ open, onClose, repo }: { open: boolean; onClose: () => void; repo: Repository }) {
  const [c, setC] = useState<ComplementData>({});
  const [inp, setInp] = useState<Inputs | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  // Dernier état des réponses : deux touches rapprochées ne s'écrasent pas.
  const latest = useRef<ComplementData>({});
  latest.current = c;

  const load = async () => {
    const ob = await loadOnboarding(repo);
    const prog = await repo.getKv<{ answers?: { pains?: string[]; priority?: string }; program?: { templates?: { lines: { variantId: string }[] }[] } }>(PROGRAM_KEY);
    const comp = await loadComplement(repo);
    // Zones déjà déclarées : proposées cochées, à confirmer.
    if (!comp.joints) {
      const z = declaredZones(prog?.answers?.pains, ob.answers.safety.pains);
      if (z.length) comp.joints = z.map((zone) => ({ zone, triggers: [], alerts: [] }));
    }
    setC(comp);
    const weights = (await repo.getKv<{ day: string; kg: number }[]>('weight.log')) ?? [];
    const last = [...weights].sort((a, b) => (a.day < b.day ? -1 : 1)).pop();
    const today = localDay(Date.now(), deviceTimeZone());
    const rlog = (await repo.getKv<{ day: string; tired: boolean }[]>('readiness.log')) ?? [];
    const recent = new Set([0, 1, 2].map((k) => new Date(Date.parse(`${today}T12:00:00Z`) - k * 864e5).toISOString().slice(0, 10)));
    setInp({
      a: ob.answers,
      weightKg: last?.kg ?? ob.answers.body.weightKg.value,
      strategy: programStrategy(prog ? { answers: prog.answers ?? {} } : undefined),
      training: await loadTraining(repo),
      items: await loadPlanning(repo),
      fixed: await loadAllFixed(repo),
      today,
      tired: rlog.some((x) => x.tired && recent.has(x.day)),
      variants: [...new Set((prog?.program?.templates ?? []).flatMap((t) => t.lines.map((l) => l.variantId)))],
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
  const act = c.activity ?? {};
  const setAct = (patch: Partial<ActivityAnswers>) => update((x) => ({ ...x, activity: { ...x.activity, ...patch, at: Date.now() } }));
  const joints = c.joints ?? [];
  const setJoint = (zone: JointZone, patch: Partial<JointAnswer>) => update((x) => ({ ...x, joints: (x.joints ?? []).map((j) => (j.zone === zone ? { ...j, ...patch } : j)) }));
  const toggleZone = (zone: JointZone) =>
    update((x) => ({ ...x, joints: (x.joints ?? []).some((j) => j.zone === zone) ? (x.joints ?? []).filter((j) => j.zone !== zone) : [...(x.joints ?? []), { zone, triggers: [], alerts: [] }] }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const includes = act.stepsIncludes ?? [];

  const advice = useMemo(() => jointAdvice(joints), [joints]);
  const patterns = useMemo(() => adaptationPatterns(joints), [joints]);
  const touched = useMemo(() => (inp ? inp.variants.filter((v) => patterns.some((p) => new RegExp(p).test(v))) : []), [inp, patterns]);
  const kcal = useMemo(() => {
    if (!inp) return undefined;
    const base = { sex: inp.a.body.formulaSex, age: inp.a.body.age.value, heightCm: inp.a.body.heightCm.value, weightKg: inp.weightKg, strategy: inp.strategy, goal: inp.a.goal.main };
    return {
      before: calorieTarget({ ...base, sessionsPerWeek: inp.a.sleep.sessionsPerWeek }),
      after: calorieTarget({ ...base, sessionsPerWeek: inp.a.sleep.sessionsPerWeek, activity: c.activity, training: inp.training, treadmillDaysPerWeek: inp.a.schedule.treadmillDays?.length ?? 0, workDaysPerWeek: inp.a.schedule.workDays.length }),
    };
  }, [inp, c.activity]);
  const runs = useMemo(() => (inp ? planRuns(inp.items, inp.fixed, inp.today, { tired: inp.tired }) : null), [inp]);
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

  /** Une seule validation applique la synthèse : semaine, adaptation à la gêne, cible. */
  const validate = async () => {
    if (!inp || !runs) return;
    const done: string[] = [];
    const byId = new Map(runs.changes.map((x) => [x.id, x]));
    const replace = new Map(runs.advice.map((x) => [x.replace.id, x]));
    if (runs.changes.length || runs.advice.length) {
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
        return x;
      });
      await repo.setKv(PLAN_KEY, items);
      const prog = await repo.getKv<{ program: { week: { day: number; start: string; durationMin: number; kind: string }[]; weekly?: { day: number; start: string; durationMin: number; kind: string }[][] } }>(PROGRAM_KEY);
      if (prog?.program && runs.changes.length) {
        const fix = <T extends { day: number; start: string; durationMin: number; kind: string }>(w: T[]) => spaceRuns(w, { start: '12:30' }).items;
        await repo.setKv(PROGRAM_KEY, { ...prog, program: { ...prog.program, week: fix(prog.program.week), weekly: prog.program.weekly?.map(fix) } });
      }
      if (runs.changes.length) done.push(`${runs.changes.length} course${runs.changes.length > 1 ? 's' : ''} déplacée${runs.changes.length > 1 ? 's' : ''}`);
      if (runs.advice.length) done.push(`${runs.advice.length} course${runs.advice.length > 1 ? 's' : ''} remplacée${runs.advice.length > 1 ? 's' : ''} par une marche`);
    }
    // Adaptation à la gêne : elle modifie la prescription de chaque séance et laisse une trace dans le journal.
    if (patterns.length) {
      const adapt: JointAdapt = { patterns, at: Date.now() };
      await repo.setKv(JOINT_ADAPT, adapt);
      const decisions: Decision[] = touched.map((variantId) => ({
        variantId,
        before: { target: 0 },
        after: { target: 0 },
        action: 'maintenir',
        done: true,
        targetReached: false,
        progressionAllowed: false,
        observations: [`gêne déclarée : ${joints.map((j) => ZONE_LABELS[j.zone].toLowerCase()).join(', ')}`],
        rule: 'gêne : adaptation acceptée',
        missing: [],
        reason: 'Marge de 3 répétitions, une série de moins, amplitude confortable, charge gelée. À vérifier pendant la séance et le lendemain.',
        reevaluate: 'après 2 séances, selon ta réaction pendant et le lendemain',
      }));
      if (decisions.length) await appendJournal(repo, decisions, 'gêne · adaptation acceptée', `gene-${inp.today}`);
      done.push(`${touched.length} exercice${touched.length > 1 ? 's' : ''} adapté${touched.length > 1 ? 's' : ''}`);
    } else if (await repo.getKv(JOINT_ADAPT)) {
      await repo.setKv(JOINT_ADAPT, { patterns: [], at: Date.now() });
    }
    if (c.activity) done.push(`cible ${kcal?.after.value?.kcal ?? '—'} kcal`);
    const next = { ...c, validated: Date.now() };
    setC(next);
    await saveComplement(repo, next);
    setApplied(done.length ? `Validé : ${done.join(' · ')}.` : 'Validé.');
    setInp({ ...inp, items: await loadPlanning(repo) });
  };

  const treadmill = (inp?.a.schedule.treadmillDays?.length ?? 0) > 0;
  const bands: SitBand[] = ['<6', '6-9', '9-12', '>12'];
  const triggers: JointTrigger[] = ['tractions', 'dips', 'pompes', 'developpe', 'rowing', 'inconnu'];
  const alerts: JointAlert[] = ['faiblesse', 'engourdissement', 'blocage', 'nuit'];
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.floor(Number(v) || 0)));
  const stepsOn = act.steps !== undefined;
  const nothing = !runs?.changes.length && !runs?.advice.length && !patterns.length && !c.activity;

  return (
    <Modal open={open} onClose={onClose} title="Compléter mon profil">
      <div className="stack">
        <h3 style={{ margin: 0 }}>Activité</h3>
        <Help>Hors séances. Sert à estimer tes calories : ne coche que ce que tu sais.</Help>
        <p className="eyebrow" style={{ margin: 0 }}>Assis par jour</p>
        <div className="chips">
          {bands.map((b) => (
            <Chip key={b} on={act.sitHours === b} onClick={() => setAct({ sitHours: act.sitHours === b ? undefined : b })}>
              {SIT_LABELS[b]}
            </Chip>
          ))}
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Pas par jour (moyenne)</span>
          <input type="number" inputMode="numeric" min={0} placeholder="je ne sais pas" value={act.steps ?? ''} onChange={(e) => setAct({ steps: num(e.target.value) })} />
        </label>
        {stepsOn && (
          <>
            <p className="eyebrow" style={{ margin: 0 }}>Ce total est</p>
            <div className="chips">
              <Chip on={act.stepsMeasured !== false} onClick={() => setAct({ stepsMeasured: true })}>mesuré</Chip>
              <Chip on={act.stepsMeasured === false} onClick={() => setAct({ stepsMeasured: false })}>estimé</Chip>
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Sur quels jours</p>
            <div className="chips">
              <Chip on={act.stepsPeriod !== 'tous'} onClick={() => setAct({ stepsPeriod: 'hors-seances' })}>jours sans séance</Chip>
              <Chip on={act.stepsPeriod === 'tous'} onClick={() => setAct({ stepsPeriod: 'tous' })}>tous les jours</Chip>
            </div>
            <p className="eyebrow" style={{ margin: 0 }}>Il comprend déjà</p>
            <div className="chips">
              {(['tapis', 'trajets', 'courses'] as const).map((k) => (
                <Chip key={k} on={includes.includes(k) || (k === 'courses' && act.stepsPeriod === 'tous')} onClick={() => setAct({ stepsIncludes: toggle(includes, k) })}>
                  {k === 'tapis' ? 'tapis de marche' : k}
                </Chip>
              ))}
            </div>
            <Help>Ce que ton total comprend n’est pas compté une seconde fois ; ce qu’il ne comprend pas est ajouté. Sans précision : je suppose qu’il ne comprend ni tapis, ni trajets, ni courses.</Help>
          </>
        )}
        {treadmill && !includes.includes('tapis') && (
          <label className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Tapis de marche, minutes par jour de télétravail</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={act.treadmillMin ?? ''} onChange={(e) => setAct({ treadmillMin: num(e.target.value) })} />
          </label>
        )}
        {!includes.includes('trajets') && (
          <label className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Trajets à pied ou à vélo, minutes par jour</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={act.walkCommuteMin ?? ''} onChange={(e) => setAct({ walkCommuteMin: num(e.target.value) })} />
          </label>
        )}

        <h3 style={{ margin: '8px 0 0' }}>Gêne</h3>
        <Help>L’app ne pose pas de diagnostic. Tes réponses servent à adapter la séance et à savoir quand consulter. Le score de douleur seul ne décide de rien.</Help>
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
            <p className="eyebrow" style={{ margin: 0 }}>Quand elle apparaît</p>
            <div className="chips">
              {triggers.map((t) => (
                <Chip key={t} on={j.triggers.includes(t)} onClick={() => setJoint(j.zone, { triggers: toggle(j.triggers, t) })}>{TRIGGER_LABELS[t]}</Chip>
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
              Stratégie {kcal.after.value.strategy}. La cible n’est corrigée qu’après 2 semaines de pesées et 7 jours de repas notés.
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
            <strong>Gêne</strong>
            {touched.length > 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Exercices adaptés : {touched.map((v) => findVariant(v)?.variant.name ?? v).join(', ')}. Marge de 3 répétitions, une série de moins, jamais à l’échec, charge gelée.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Aucun mouvement déclencheur connu : les séances ne changent pas, la charge reste gelée.</p>
            )}
            {advice.items.map((it) => (
              <p key={it.zone + it.text} className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{ZONE_LABELS[it.zone]} · {it.text}</p>
            ))}
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
