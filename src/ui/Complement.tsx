// « Compléter mon profil » : activité de la journée et gêne articulaire. Questions courtes, préremplies, conditionnelles.
// Rien n'est modifié dans ton programme sans ton accord : la semaine proposée s'affiche en entier avant l'application.

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { SIT_LABELS, type ActivityAnswers, type SitBand, type Training } from '../engine/activity';
import { ALERT_LABELS, TRIGGER_LABELS, ZONE_LABELS, jointAdvice, type JointAlert, type JointAnswer, type JointTrigger, type JointZone } from '../engine/joints';
import { DAY_NAMES, conflicts, dateOf, type FixedEvent, type PlannedItem } from '../engine/planning';
import { spaceRuns } from '../engine/runSchedule';
import { calorieTarget, type Strategy } from '../engine/targets';
import type { OnboardingAnswers } from '../engine/profile';
import type { Repository } from '../storage/db';
import { loadAllFixed } from './agenda';
import { Help, Modal } from './common';
import { declaredZones, loadComplement, loadTraining, saveComplement, type Complement as ComplementData } from './profileComplement';
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

/** Courses à espacer : calcul sur le planning réel (passé, séances démarrées et conflits d'agenda exclus). */
export function planRuns(items: PlannedItem[], fixed: FixedEvent[], today: string) {
  const byWeek = new Map<string, PlannedItem[]>();
  for (const it of items) byWeek.set(it.weekStart, [...(byWeek.get(it.weekStart) ?? []), it]);
  const changes: { id: string; title: string; weekStart: string; fromDay: number; toDay: number; start: string }[] = [];
  const unresolved: { title: string; date: string }[] = [];
  for (const [weekStart, week] of [...byWeek].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (dateOf(weekStart, 6) < today) continue;
    const r = spaceRuns(week, {
      movable: (x) => dateOf(x.weekStart, x.day) >= today && !x.sessionId && x.adjustment?.decision !== 'annulée',
      canUse: (d, x) => dateOf(weekStart, d) >= today && conflicts(d, '12:30', x.durationMin, fixed).length === 0,
    });
    for (const m of r.moved) changes.push({ id: m.item.id, title: m.item.title, weekStart, fromDay: m.fromDay, toDay: m.toDay, start: '12:30' });
    for (const u of r.unresolved) unresolved.push({ title: u.title, date: dateOf(weekStart, u.day) });
  }
  return { changes, unresolved };
}

export function ComplementModal({ open, onClose, repo }: { open: boolean; onClose: () => void; repo: Repository }) {
  const [c, setC] = useState<ComplementData>({});
  const [inp, setInp] = useState<Inputs | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const load = async () => {
    const ob = await loadOnboarding(repo);
    const prog = await repo.getKv<{ answers?: { pains?: string[]; priority?: string } }>(PROGRAM_KEY);
    const comp = await loadComplement(repo);
    // Zones déjà déclarées : proposées cochées, à confirmer.
    if (!comp.joints) {
      const z = declaredZones(prog?.answers?.pains, ob.answers.safety.pains);
      if (z.length) comp.joints = z.map((zone) => ({ zone, triggers: [], alerts: [] }));
    }
    setC(comp);
    const weights = (await repo.getKv<{ day: string; kg: number }[]>('weight.log')) ?? [];
    const last = [...weights].sort((a, b) => (a.day < b.day ? -1 : 1)).pop();
    setInp({
      a: ob.answers,
      weightKg: last?.kg ?? ob.answers.body.weightKg.value,
      strategy: programStrategy(prog ? { answers: prog.answers ?? {} } : undefined),
      training: await loadTraining(repo),
      items: await loadPlanning(repo),
      fixed: await loadAllFixed(repo),
      today: localDay(Date.now(), deviceTimeZone()),
    });
  };
  useEffect(() => {
    if (open) {
      setApplied(null);
      void load();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (fn: (x: ComplementData) => ComplementData) => {
    const next = fn(c);
    setC(next);
    void saveComplement(repo, next);
  };
  const act = c.activity ?? {};
  const setAct = (patch: Partial<ActivityAnswers>) => update((x) => ({ ...x, activity: { ...x.activity, ...patch, at: Date.now() } }));
  const joints = c.joints ?? [];
  const setJoint = (zone: JointZone, patch: Partial<JointAnswer>) => update((x) => ({ ...x, joints: (x.joints ?? []).map((j) => (j.zone === zone ? { ...j, ...patch } : j)) }));
  const toggleZone = (zone: JointZone) =>
    update((x) => ({ ...x, joints: (x.joints ?? []).some((j) => j.zone === zone) ? (x.joints ?? []).filter((j) => j.zone !== zone) : [...(x.joints ?? []), { zone, triggers: [], alerts: [] }] }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const advice = useMemo(() => jointAdvice(joints), [joints]);
  const kcal = useMemo(() => {
    if (!inp) return undefined;
    const base = { sex: inp.a.body.formulaSex, age: inp.a.body.age.value, heightCm: inp.a.body.heightCm.value, weightKg: inp.weightKg, strategy: inp.strategy, goal: inp.a.goal.main };
    return {
      before: calorieTarget({ ...base, sessionsPerWeek: inp.a.sleep.sessionsPerWeek }),
      after: calorieTarget({ ...base, sessionsPerWeek: inp.a.sleep.sessionsPerWeek, activity: c.activity, training: inp.training, treadmillDaysPerWeek: inp.a.schedule.treadmillDays?.length ?? 0, workDaysPerWeek: inp.a.schedule.workDays.length }),
    };
  }, [inp, c.activity]);
  const runs = useMemo(() => (inp ? planRuns(inp.items, inp.fixed, inp.today) : null), [inp]);
  const weekPreview = useMemo(() => {
    if (!inp || !runs?.changes.length) return null;
    const ws = runs.changes[0]!.weekStart;
    const mine = new Map(runs.changes.filter((x) => x.weekStart === ws).map((x) => [x.id, x]));
    return {
      weekStart: ws,
      rows: inp.items
        .filter((x) => x.weekStart === ws)
        .map((x) => ({ ...x, day: mine.get(x.id)?.toDay ?? x.day, start: mine.get(x.id)?.start ?? x.start, moved: mine.has(x.id), from: x.day }))
        .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
    };
  }, [inp, runs]);

  const apply = async () => {
    if (!runs?.changes.length) return;
    const byId = new Map(runs.changes.map((x) => [x.id, x]));
    const items = (await loadPlanning(repo)).map((x) => {
      const m = byId.get(x.id);
      return m ? { ...x, day: m.toDay, start: m.start, moves: [...x.moves, { at: Date.now(), fromDay: x.day, fromStart: x.start }] } : x;
    });
    await repo.setKv(PLAN_KEY, items);
    // Semaines types du programme : même règle, pour que les semaines à venir restent cohérentes.
    const prog = await repo.getKv<{ program: { week: { day: number; start: string; durationMin: number; kind: string }[]; weekly?: { day: number; start: string; durationMin: number; kind: string }[][] } }>(PROGRAM_KEY);
    if (prog?.program) {
      const fix = <T extends { day: number; start: string; durationMin: number; kind: string }>(w: T[]) => spaceRuns(w, { start: '12:30' }).items;
      await repo.setKv(PROGRAM_KEY, { ...prog, program: { ...prog.program, week: fix(prog.program.week), weekly: prog.program.weekly?.map(fix) } });
    }
    setApplied(`${runs.changes.length} course${runs.changes.length > 1 ? 's' : ''} déplacée${runs.changes.length > 1 ? 's' : ''}.`);
    setInp({ ...inp!, items });
  };

  const treadmill = (inp?.a.schedule.treadmillDays?.length ?? 0) > 0;
  const bands: SitBand[] = ['<6', '6-9', '9-12', '>12'];
  const triggers: JointTrigger[] = ['tractions', 'dips', 'pompes', 'developpe', 'rowing', 'inconnu'];
  const alerts: JointAlert[] = ['faiblesse', 'engourdissement', 'nuit'];

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
          <span className="eyebrow">Pas par jour, jours sans séance</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="je ne sais pas"
            value={act.steps ?? ''}
            onChange={(e) => setAct({ steps: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
        </label>
        <Help>Les pas comprennent déjà le tapis et la marche. Si tu les renseignes, le reste n’est pas compté une seconde fois.</Help>
        {act.steps === undefined && (
          <>
            {treadmill && (
              <label className="stack" style={{ gap: 4 }}>
                <span className="eyebrow">Tapis de marche, minutes par jour de télétravail</span>
                <input type="number" inputMode="numeric" min={0} placeholder="0" value={act.treadmillMin ?? ''} onChange={(e) => setAct({ treadmillMin: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
              </label>
            )}
            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Trajets à pied ou à vélo, minutes par jour</span>
              <input type="number" inputMode="numeric" min={0} placeholder="0" value={act.walkCommuteMin ?? ''} onChange={(e) => setAct({ walkCommuteMin: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          </>
        )}

        <h3 style={{ margin: '8px 0 0' }}>Gêne</h3>
        <Help>L’app ne pose pas de diagnostic. Tes réponses servent à choisir une adaptation et à savoir quand consulter.</Help>
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
            <p className="eyebrow" style={{ margin: 0 }}>Signaux</p>
            <div className="chips">
              {alerts.map((al) => (
                <Chip key={al} on={j.alerts.includes(al)} onClick={() => setJoint(j.zone, { alerts: toggle(j.alerts, al) })}>{ALERT_LABELS[al]}</Chip>
              ))}
            </div>
          </section>
        ))}
        {advice.referral && <p role="alert" className="notice warn" style={{ margin: 0 }}>{advice.referral}</p>}
        {advice.items.map((it) => (
          <p key={it.zone + it.text} className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>{ZONE_LABELS[it.zone]} · {it.text}</p>
        ))}

        <h3 style={{ margin: '8px 0 0' }}>Ce que ça change</h3>
        {kcal && (
          <section className="card stack" aria-label="Calories">
            <strong>Calories</strong>
            {kcal.after.value && (
              <p className="num" style={{ margin: 0 }}>
                {kcal.before.value ? `${kcal.before.value.kcal} → ` : ''}
                <strong>{kcal.after.value.kcal} kcal</strong> · P {kcal.after.value.proteinG} g
                {kcal.after.value.basis === 'séances' && ' · activité non renseignée'}
              </p>
            )}
            <Help>
              <ol style={{ margin: 0, paddingLeft: 18 }}>{kcal.after.why.map((w) => <li key={w}>{w}</li>)}</ol>
              Stratégie {kcal.after.value?.strategy}. La cible n’est corrigée qu’après 2 semaines de pesées et 7 jours de repas notés.
            </Help>
          </section>
        )}
        {runs && (
          <section className="card stack" aria-label="Courses">
            <strong>Courses</strong>
            {runs.changes.length === 0 && runs.unresolved.length === 0 && <p className="muted" style={{ margin: 0 }}>Aucune course consécutive.</p>}
            {runs.unresolved.length > 0 && (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Pas de jour libre pour : {runs.unresolved.map((u) => `${u.title} (${dm(u.date)})`).join(', ')}.
              </p>
            )}
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
              <>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {runs.changes.length} course{runs.changes.length > 1 ? 's' : ''} à déplacer sur les semaines à venir : un jour de repos entre deux sorties, à midi.
                </p>
                <button className="btn primary block" onClick={apply}>Appliquer cette semaine type</button>
              </>
            )}
            {applied && <p role="status" style={{ margin: 0 }}><Check size={14} aria-hidden="true" /> {applied}</p>}
          </section>
        )}
        <button className="btn ghost block" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

