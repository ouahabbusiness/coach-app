// Entretien avec le coach : une question par écran, option recommandée argumentée, puis programme à valider.
// Ton ferme « Winter Arc » ; le coach n'est pas une vraie personne et ne se présente pas comme telle.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Dumbbell, Footprints, MapPin, ShieldAlert } from 'lucide-react';
import { findVariant } from '../catalog/exercises';
import { localDay } from '../engine/derive';
import { DAY_NAMES, shiftWeek, type PlannedItem } from '../engine/planning';
import { availableLoads } from '../engine/progression';
import {
  buildProgram,
  recDays,
  recIntensity,
  recPriority,
  ZONE_LABELS,
  type Zone,
  recRuns,
  recStrictness,
  recWeeks,
  type Pain,
  type Program,
  type ProgramAnswers,
  type Rec,
} from '../engine/programBuilder';
import { weekStart } from '../engine/challenge';
import type { Repository } from '../storage/db';
import { loadKettlebells, loadOwned, loadPieces } from './equipment';
import { adaptToEquipment } from '../engine/trip';
import { fitPlanning } from './agenda';
import { loadFree } from './FreeWork';
import { lightLoadsReport, OVERRIDES } from './actions';
import { loadJournal, type JournalEntry } from './journal';
import type { LightLoad } from '../engine/progression';
import { loadPlanning } from './Planning';
import { loadOnboarding } from './profileStore';
import { deviceTimeZone, newId } from './support';
import { loadTemplates, saveTemplates, type SessionTemplate } from './templates';
import type { Route } from './App';

const ANSWERS = 'program.answers';
const CURRENT = 'program.current';
const PLANNING = 'planning.items';

export interface SavedProgram {
  id: string;
  program: Program;
  answers: ProgramAnswers;
  startWeek: string;
  at: number;
}

export async function loadProgram(repo: Repository) {
  return repo.getKv<SavedProgram>(CURRENT);
}

type Choice<T> = { v: T; l: string; sub?: string };

interface Step {
  id: string;
  /** Ce que dit le coach (ton dur). */
  say: string;
  /** Même question, ton neutre. */
  calm?: string;
  render: (a: ProgramAnswers, set: (p: Partial<ProgramAnswers>) => void) => ReactNode;
  done: (a: ProgramAnswers) => boolean;
}

function Choices<T extends string | number>({ value, onPick, options, rec }: { value: T | undefined; onPick: (v: T) => void; options: Choice<T>[]; rec?: Rec<T> }) {
  return (
    <div className="cq-choices">
      {rec && (
        <p className="cq-rec">
          <span className="cq-rec-tag">Recommandé</span> {rec.why}
        </p>
      )}
      {options.map((o) => (
        <button key={String(o.v)} className={`cq-opt ${rec?.value === o.v ? 'rec' : ''}`} aria-pressed={value === o.v} onClick={() => onPick(o.v)}>
          <span className="cq-opt-l">{o.l}</span>
          {o.sub && <span className="cq-opt-sub">{o.sub}</span>}
          {rec?.value === o.v && <span className="cq-badge">conseil</span>}
        </button>
      ))}
    </div>
  );
}

function NumberQ({ value, onChange, unit, unknown = true }: { value: number | null | undefined; onChange: (v: number | null | undefined) => void; unit: string; unknown?: boolean }) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value).replace('.', ','));
  return (
    <div className="cq-num">
      <div className="cq-num-row">
        <input
          aria-label={unit}
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder="0"
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value.replace(',', '.'));
            onChange(e.target.value.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n);
          }}
        />
        <span>{unit}</span>
      </div>
      {unknown && (
        <button
          className="cq-opt"
          aria-pressed={value === null}
          onClick={() => {
            setDraft('');
            onChange(null);
          }}
        >
          <span className="cq-opt-l">Je ne sais pas</span>
          <span className="cq-opt-sub">On teste en semaine 1</span>
        </button>
      )}
    </div>
  );
}

const PAINS: Choice<Pain>[] = [
  { v: 'epaules', l: 'Épaules' },
  { v: 'coudes', l: 'Coudes' },
  { v: 'poignets', l: 'Poignets' },
  { v: 'dos', l: 'Bas du dos' },
  { v: 'genoux', l: 'Genoux' },
];

function ZonePick({ value, onChange }: { value: Zone[]; onChange: (v: Zone[]) => void }) {
  return (
    <div className="cq-grid">
      {(Object.keys(ZONE_LABELS) as Zone[]).map((z) => (
        <button key={z} className="cq-opt" aria-pressed={value.includes(z)} onClick={() => onChange(value.includes(z) ? value.filter((x) => x !== z) : [...value, z])}>
          <span className="cq-opt-l">{ZONE_LABELS[z]}</span>
        </button>
      ))}
      <button className="cq-opt" aria-pressed={value.length === 0} onClick={() => onChange([])}>
        <span className="cq-opt-l">Aucune</span>
      </button>
    </div>
  );
}

const STEPS: Step[] = [
  {
    id: 'fat',
    calm: 'Où le gras te gêne-t-il ?',
    say: 'Ton corps, sans filtre. Où le gras te gêne ? Je te dirai la vérité sur ce qu’on peut faire.',
    done: () => true,
    render: (a, set) => <ZonePick value={a.fatZones ?? []} onChange={(v) => set({ fatZones: v })} />,
  },
  {
    id: 'muscle',
    calm: 'Quelles zones veux-tu muscler en priorité ?',
    say: 'Et là où tu veux du muscle en plus ?',
    done: () => true,
    render: (a, set) => <ZonePick value={a.muscleZones ?? []} onChange={(v) => set({ muscleZones: v })} />,
  },
  {
    id: 'priority',
    calm: 'Choisis une priorité pour ce bloc : c’est elle qui guide le programme.',
    say: 'Une seule priorité pour ces 4 semaines. Celui qui court après tout ne rattrape rien.',
    done: (a) => !!a.priority,
    render: (a, set) => (
      <Choices
        value={a.priority}
        onPick={(v) => set({ priority: v })}
        rec={recPriority(a)}
        options={[
          { v: 'force', l: 'Force', sub: 'Tractions et dips lestés plus lourds' },
          { v: 'muscle', l: 'Muscle', sub: 'Prendre du volume' },
          { v: 'seche', l: 'Sèche', sub: 'Perdre du gras, garder la force' },
          { v: 'course', l: 'Course', sub: 'Courir plus loin, plus vite' },
          { v: 'hybride', l: 'Hybride', sub: 'Force + course, sans sacrifier l’un' },
        ]}
      />
    ),
  },
  {
    id: 'pull',
    calm: 'Combien de tractions strictes peux-tu faire d’affilée ?',
    say: 'Tractions strictes. Bras tendus en bas, menton au-dessus de la barre. Pas d’élan. Ton vrai max, pas celui de tes rêves.',
    done: (a) => a.maxPullups !== undefined,
    render: (a, set) => <NumberQ value={a.maxPullups} onChange={(v) => set({ maxPullups: v })} unit="tractions" />,
  },
  {
    id: 'dips',
    calm: 'Combien de dips propres d’affilée sur ta barre ?',
    say: 'Dips sur ta barre. Épaule qui descend au niveau du coude. Combien d’affilée, propres ?',
    done: (a) => a.maxDips !== undefined,
    render: (a, set) => <NumberQ value={a.maxDips} onChange={(v) => set({ maxDips: v })} unit="dips" />,
  },
  {
    id: 'push',
    calm: 'Combien de pompes au sol d’affilée ?',
    say: 'Pompes au sol, corps gainé, poitrine au sol. Ton max.',
    done: (a) => a.maxPushups !== undefined,
    render: (a, set) => <NumberQ value={a.maxPushups} onChange={(v) => set({ maxPushups: v })} unit="pompes" />,
  },
  {
    id: 'run',
    calm: 'Ta plus longue course ces 4 dernières semaines ?',
    say: 'Ta plus longue course ces 4 dernières semaines. Sans marcher.',
    done: (a) => a.longestRunKm !== undefined,
    render: (a, set) => <NumberQ value={a.longestRunKm} onChange={(v) => set({ longestRunKm: v })} unit="km" />,
  },
  {
    id: 'pains',
    calm: 'As-tu une douleur ou une gêne articulaire ? Je construis autour.',
    say: 'Douleurs. Ici, on ne joue pas les durs. Une articulation qui gêne, tu la cites, et je construis autour.',
    done: () => true,
    render: (a, set) => (
      <div className="cq-choices">
        {PAINS.map((p) => (
          <button key={p.v} className="cq-opt" aria-pressed={a.pains.includes(p.v)} onClick={() => set({ pains: a.pains.includes(p.v) ? a.pains.filter((x) => x !== p.v) : [...a.pains, p.v] })}>
            <span className="cq-opt-l">{p.l}</span>
          </button>
        ))}
        <button className="cq-opt" aria-pressed={a.pains.length === 0} onClick={() => set({ pains: [] })}>
          <span className="cq-opt-l">Aucune</span>
        </button>
        <p className="cq-warn">
          <ShieldAlert size={14} aria-hidden="true" /> Douleur forte ou qui dure : avis médical avant de charger.
        </p>
      </div>
    ),
  },
  {
    id: 'sleep',
    calm: 'Combien d’heures dors-tu en moyenne ?',
    say: 'Combien d’heures tu dors vraiment, en moyenne ? La récupération décide de l’intensité, pas l’ego.',
    done: (a) => a.sleepH !== undefined,
    render: (a, set) => <NumberQ value={a.sleepH} onChange={(v) => set({ sleepH: v ?? undefined })} unit="h / nuit" unknown={false} />,
  },
  {
    id: 'stress',
    say: 'Ton stress en ce moment ?',
    done: (a) => !!a.stress,
    render: (a, set) => (
      <Choices
        value={a.stress}
        onPick={(v) => set({ stress: v })}
        options={[
          { v: 'bas', l: 'Bas' },
          { v: 'moyen', l: 'Moyen' },
          { v: 'eleve', l: 'Élevé' },
        ]}
      />
    ),
  },
  {
    id: 'job',
    calm: 'Ton travail est-il physique ?',
    say: 'Ton travail est physique ? Debout, port de charges, beaucoup de marche ?',
    done: (a) => a.physicalJob !== undefined,
    render: (a, set) => (
      <Choices
        value={a.physicalJob === undefined ? undefined : a.physicalJob ? 'oui' : 'non'}
        onPick={(v) => set({ physicalJob: v === 'oui' })}
        options={[
          { v: 'oui', l: 'Oui' },
          { v: 'non', l: 'Non' },
        ]}
      />
    ),
  },
  {
    id: 'quit',
    calm: 'Qu’est-ce qui t’a fait arrêter un programme la dernière fois ?',
    say: 'Dernière fois que tu as lâché un programme. Pourquoi ? Sois honnête, c’est là que je verrouille.',
    done: (a) => !!a.quitReason,
    render: (a, set) => (
      <Choices
        value={a.quitReason}
        onPick={(v) => set({ quitReason: v })}
        options={[
          { v: 'motivation', l: 'Plus envie', sub: 'La motivation est tombée' },
          { v: 'temps', l: 'Pas le temps', sub: 'Journées trop chargées' },
          { v: 'fatigue', l: 'Fatigue', sub: 'Trop crevé pour suivre' },
          { v: 'douleur', l: 'Douleur', sub: 'Blessure ou gêne' },
          { v: 'ennui', l: 'Ennui', sub: 'Toujours la même chose' },
        ]}
      />
    ),
  },
  {
    id: 'minutes',
    calm: 'Combien de minutes as-tu par séance ?',
    say: 'Combien de minutes par séance, réellement, sans te raconter d’histoire ?',
    done: (a) => !!a.minutes,
    render: (a, set) => (
      <Choices
        value={a.minutes}
        onPick={(v) => set({ minutes: v })}
        options={[
          { v: 30, l: '30 min' },
          { v: 45, l: '45 min' },
          { v: 60, l: '60 min' },
          { v: 75, l: '75 min' },
        ]}
      />
    ),
  },
  {
    id: 'slot',
    say: 'Quand tu t’entraînes ?',
    done: (a) => !!a.slot,
    render: (a, set) => (
      <Choices
        value={a.slot}
        onPick={(v) => set({ slot: v })}
        options={[
          { v: 'matin', l: 'Matin', sub: '07:00' },
          { v: 'midi', l: 'Midi', sub: '12:15' },
          { v: 'soir', l: 'Soir', sub: '18:30' },
        ]}
      />
    ),
  },
  {
    id: 'days',
    say: 'Séances de force par semaine.',
    done: (a) => !!a.days,
    render: (a, set) => <Choices value={a.days} onPick={(v) => set({ days: v })} rec={recDays(a)} options={[2, 3, 4, 5, 6].map((n) => ({ v: n, l: `${n} séances` }))} />,
  },
  {
    id: 'runs',
    calm: 'Combien de sorties de course par semaine ?',
    say: 'Sorties de course par semaine. Au parc d’Alost, il n’y a pas d’excuse.',
    done: (a) => a.runsPerWeek !== undefined,
    render: (a, set) => <Choices value={a.runsPerWeek} onPick={(v) => set({ runsPerWeek: v })} rec={recRuns(a)} options={[0, 1, 2, 3, 4].map((n) => ({ v: n, l: n === 0 ? 'Aucune' : `${n} sortie${n > 1 ? 's' : ''}` }))} />,
  },
  {
    id: 'runGoal',
    say: 'Ce que tu veux de la course.',
    done: (a) => !!a.runGoal || a.runsPerWeek === 0,
    render: (a, set) => (
      <Choices
        value={a.runGoal}
        onPick={(v) => set({ runGoal: v })}
        rec={{ value: (a.longestRunKm ?? 0) >= 8 ? '10k' : (a.longestRunKm ?? 0) >= 4 ? '5k' : 'base', why: (a.longestRunKm ?? 0) >= 4 ? `Tu tiens déjà ${a.longestRunKm} km : on vise plus loin.` : 'D’abord une base solide, la vitesse viendra.' }}
        options={[
          { v: 'base', l: 'Endurance de base', sub: 'Courir longtemps sans exploser' },
          { v: '5k', l: '5 km plus vite' },
          { v: '10k', l: 'Tenir 10 km' },
        ]}
      />
    ),
  },
  {
    id: 'intensity',
    calm: 'Quelle intensité ? Voici ce que je te conseille, et pourquoi.',
    say: 'Intensité. Je te dis ce que je recommande, et pourquoi. Tu choisis, mais tu assumes.',
    done: (a) => !!a.intensity,
    render: (a, set) => (
      <Choices
        value={a.intensity}
        onPick={(v) => set({ intensity: v })}
        rec={recIntensity(a)}
        options={[
          { v: 'controlee', l: 'Contrôlée', sub: '2 répétitions en réserve' },
          { v: 'dure', l: 'Dure', sub: '1 répétition en réserve' },
          { v: 'tres_exigeant', l: 'Très exigeant', sub: '≈ 1 répétition en réserve' },
        ]}
      />
    ),
  },
  {
    id: 'failure',
    calm: 'Autorises-tu l’échec technique sur certaines séries ?',
    say: 'L’échec, c’est une option, pas une obligation. Je le limite à l’assistance au poids du corps. Jamais avec du lest.',
    done: (a) => a.failureOk !== undefined,
    render: (a, set) => (
      <Choices
        value={a.failureOk === undefined ? undefined : a.failureOk ? 'oui' : 'non'}
        onPick={(v) => set({ failureOk: v === 'oui' })}
        rec={{ value: 'non', why: 'Pas indispensable aux résultats, et ça ajoute de la fatigue. Tu peux l’activer plus tard.' }}
        options={[
          { v: 'non', l: 'Non', sub: 'Toujours au moins 1 répétition en réserve' },
          { v: 'oui', l: 'Oui, sur l’assistance', sub: 'Dernière série, poids du corps, technique propre' },
        ]}
      />
    ),
  },
  {
    id: 'strict',
    calm: 'Que fait-on quand un imprévu arrive ?',
    say: 'Rigueur. Qu’est-ce qui se passe quand la vie se met en travers ?',
    done: (a) => !!a.strictness,
    render: (a, set) => (
      <Choices
        value={a.strictness}
        onPick={(v) => set({ strictness: v })}
        rec={recStrictness(a)}
        options={[
          { v: 'souple', l: 'Souple', sub: 'Séance déplaçable dans la semaine' },
          { v: 'strict', l: 'Strict', sub: 'Jours fixes, version courte si imprévu' },
          { v: 'militaire', l: 'Militaire', sub: 'Rien ne bouge, 20 min minimum' },
        ]}
      />
    ),
  },
  {
    id: 'weeks',
    say: 'Durée du bloc.',
    done: (a) => !!a.weeks,
    render: (a, set) => <Choices value={a.weeks} onPick={(v) => set({ weeks: v })} rec={recWeeks()} options={[4, 6, 8].map((n) => ({ v: n, l: `${n} semaines` }))} />,
  },
];

export function CoachProgram({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [a, setA] = useState<ProgramAnswers | null>(null);
  const [step, setStep] = useState(-1);
  const [loads, setLoads] = useState<number[]>([]);
  const [kbs, setKbs] = useState<number[]>([6, 12]);
  const [startNext, setStartNext] = useState(true);
  const [saved, setSaved] = useState(false);
  const [placed, setPlaced] = useState<string[]>([]);
  const [tone, setTone] = useState<'dur' | 'neutre'>('dur');
  const today = localDay(Date.now(), deviceTimeZone());

  useEffect(() => {
    (async () => {
      setLoads(availableLoads(await loadPieces(repo)));
      setKbs(await loadKettlebells(repo));
      const ob = (await loadOnboarding(repo)).answers;
      setTone(ob.coaching.tone && ob.coaching.tone !== 'ferme' ? 'neutre' : 'dur');
      const prev = await repo.getKv<ProgramAnswers>(ANSWERS);
      if (prev) return setA(prev);
      // Pré-remplissage avec ce qui est déjà connu (onboarding).
      setA({
        pains: [],
        maxPullups: ob.history.pullupsMax.value,
        maxPushups: ob.history.pushupsMax.value,
        sleepH: undefined,
        minutes: ob.sleep.sessionMinutes,
      });
    })();
  }, [repo]);

  const set = (p: Partial<ProgramAnswers>) =>
    setA((cur) => {
      const next = { ...(cur ?? { pains: [] }), ...p };
      repo.setKv(ANSWERS, next);
      return next;
    });

  const program = useMemo(() => (a && step >= STEPS.length ? buildProgram(a, loads, kbs) : undefined), [a, step, loads, kbs]);
  if (!a) return null;

  const total = STEPS.length;
  const cur = STEPS[step];
  const back = () => (step <= -1 ? go({ name: 'coach' }) : setStep(step - 1));

  const validate = async () => {
    if (!program) return;
    const id = newId();
    const start = startNext ? shiftWeek(weekStart(today), 1) : weekStart(today);
    // Modèles du programme (les modèles personnels sont conservés).
    const owned = await loadOwned(repo);
    const templates = await loadTemplates(repo);
    const tplId = (k: string) => `prog-${k}`;
    const progTemplates: SessionTemplate[] = program.templates.map((t) => ({
      id: tplId(t.key),
      title: t.title,
      updatedAt: Date.now(),
      lines: adaptToEquipment(t.lines, owned).lines.map((l) => ({ ...l, id: newId() })),
    }));
    await saveTemplates(repo, [...templates.filter((t) => !t.id.startsWith('prog-')), ...progTemplates]);
    // Planning : on remplace les éléments futurs non démarrés de l'ancien programme.
    const items = await loadPlanning(repo);
    const kept = items.filter((i) => !(i.programId && !i.sessionId && i.weekStart >= start));
    const added: PlannedItem[] = [];
    for (let w = 0; w < program.weeks; w++) {
      const ws = shiftWeek(start, w);
      for (const it of program.weekly[w] ?? program.week) {
        added.push({ id: newId(), weekStart: ws, day: it.day, start: it.start, durationMin: it.durationMin, kind: it.kind, title: it.title, detail: it.detail, km: it.km, templateId: it.templateKey ? tplId(it.templateKey) : undefined, moves: [], programId: id });
      }
    }
    const fit = await fitPlanning(repo, [...kept, ...added], today);
    await repo.setKv(PLANNING, fit.items);
    setPlaced(fit.notes);
    await repo.setKv(CURRENT, { id, program, answers: a, startWeek: start, at: Date.now() } satisfies SavedProgram);
    setSaved(true);
  };

  return (
    <div className="app ob cq">
      <main className="content" style={{ paddingBottom: 140 }}>
        <div className="ob-head">
          <span className="ob-step num">
            <i aria-hidden="true" /> Coach · {step < 0 ? 'briefing' : step >= total ? 'programme' : `${String(step + 1).padStart(2, '0')}/${total}`}
          </span>
          <button className="btn ghost ob-later" onClick={() => go({ name: 'coach' })}>
            Quitter
          </button>
        </div>
        <div className="ob-progress" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.id} className={i < step ? 'done' : i === step ? 'now' : ''} />
          ))}
        </div>

        {step < 0 && (
          <section className="cq-say" key="intro">
            <p className="cq-who">Coach</p>
            <h1 className="ob-title">On construit ton programme.</h1>
            <p className="cq-line">{tone === 'dur' ? `${total} questions. Tu réponds vrai. Si tu mens ici, c’est toi que tu voles.` : `${total} questions pour adapter le programme à toi.`}</p>
            <p className="cq-line">À la fin, je te recommande le meilleur plan pour toi, avec mes raisons. Tu valides, et on ne discute plus.</p>
            <div className="card ob-card">
              <p className="cq-who">Ton du coach</p>
              <div className="seg2">
                <button aria-pressed={tone === 'dur'} onClick={() => setTone('dur')}>
                  Dur
                </button>
                <button aria-pressed={tone === 'neutre'} onClick={() => setTone('neutre')}>
                  Neutre
                </button>
              </div>
            </div>
          </section>
        )}

        {cur && (
          <section key={cur.id} className="cq-say">
            <p className="cq-who">Coach</p>
            <p className="cq-q">{tone === 'neutre' ? cur.calm ?? cur.say : cur.say}</p>
            <div className="card ob-card">{cur.render(a, set)}</div>
          </section>
        )}

        {program && !saved && (
          <section className="cq-say" key="program">
            <p className="cq-who">Coach · recommandation</p>
            <h1 className="ob-title">{program.title}</h1>
            <p className="cq-line num">
              {program.weeks} semaines · {program.week.filter((w) => w.kind === 'seance').length} force · {program.week.filter((w) => w.kind === 'course').length} course
            </p>

            <div className="card ob-card cq-week">
              {program.week.map((w, i) => (
                <div key={i} className="cq-day">
                  <span className="cq-day-name">{DAY_NAMES[w.day]!.slice(0, 3)}</span>
                  <span className="cq-day-ico">{w.kind === 'course' ? <Footprints size={14} aria-hidden="true" /> : <Dumbbell size={14} aria-hidden="true" />}</span>
                  <span className="grow">
                    {w.title}
                    {w.detail && <small className="cq-day-detail">{w.detail}</small>}
                  </span>
                  <span className="num cq-day-meta">
                    {w.start} · {w.durationMin} min
                  </span>
                </div>
              ))}
            </div>

            {program.templates.map((t) => (
              <details key={t.key} className="card ob-card cq-tpl">
                <summary>
                  <span className="cq-key">{t.key}</span> {t.title}
                </summary>
                <ul>
                  {t.lines.map((l, i) => (
                    <li key={i}>
                      <span className="grow">{findVariant(l.variantId)?.variant.name ?? l.variantId}</span>
                      <span className="num">
                        {l.sets} × {l.kind === 'hold' ? `${l.targetSeconds} s` : l.targetReps}
                        {l.loadKg ? ` · ${l.loadKg} kg` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}

            <div className="card ob-card">
              <p className="cq-who">Règles</p>
              <ul className="cq-rules">
                {program.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {program.notes.map((r) => (
                  <li key={r} className="note">
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card ob-card">
              <p className="cq-who">Début</p>
              <div className="seg2">
                <button aria-pressed={!startNext} onClick={() => setStartNext(false)}>
                  Cette semaine
                </button>
                <button aria-pressed={startNext} onClick={() => setStartNext(true)}>
                  Lundi prochain
                </button>
              </div>
            </div>
            <p className="ob-foot">
              <i aria-hidden="true" /> Règles générales d’entraînement · non relues par un professionnel
            </p>
          </section>
        )}

        {saved && (
          <section className="cq-say" key="saved">
            <p className="cq-who">Coach</p>
            <h1 className="ob-title">{tone === 'dur' ? 'C’est signé.' : 'Programme enregistré.'}</h1>
            <p className="cq-line">Ton planning est rempli. Les charges montent toutes seules quand c’est trop facile.{tone === 'dur' ? ' Maintenant, tu exécutes.' : ''}</p>
            {placed.length > 0 && (
              <ul className="cq-rules">
                {placed.slice(0, 8).map((r) => (
                  <li key={r} className="note">
                    {r}
                  </li>
                ))}
              </ul>
            )}
            <button className="btn primary block" onClick={() => go({ name: 'planning' })}>
              <CalendarCheck size={18} aria-hidden="true" /> Voir ma semaine
            </button>
          </section>
        )}
      </main>

      {!saved && (
        <div className="controls">
          <button className="btn side" aria-label="Retour" onClick={back}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          {program ? (
            <button className="btn dark main" onClick={validate}>
              Valider le programme
            </button>
          ) : (
            <button className="btn dark main" disabled={!!cur && !cur.done(a)} onClick={() => setStep(step + 1)}>
              {step < 0 ? 'Commencer' : 'Suivant'} <ChevronRight size={20} aria-hidden="true" />
            </button>
          )}
          <span style={{ width: 56 }} />
        </div>
      )}
    </div>
  );
}

/** Onglet Coach : programme en cours ou lancement de l'entretien. */
export function CoachHome({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [p, setP] = useState<SavedProgram | null | undefined>(undefined);
  useEffect(() => {
    loadProgram(repo).then((v) => setP(v ?? null));
  }, [repo]);
  const [light, setLight] = useState<LightLoad[]>([]);
  const [todayItems, setTodayItems] = useState<PlannedItem[]>([]);
  const [pullYesterday, setPullYesterday] = useState(0);
  const [pullToday, setPullToday] = useState<string[]>([]);
  const [proposals, setProposals] = useState<JournalEntry[]>([]);
  const loadProposals = async () => {
    const resolved = new Set((await repo.getKv<string[]>('proposals.resolved')) ?? []);
    const j = await loadJournal(repo);
    // Une seule proposition ouverte par exercice : la plus récente.
    const latest = new Map<string, JournalEntry>();
    for (const e of j) if (e.proposal && !resolved.has(e.id)) latest.set(e.variantId, e);
    setProposals([...latest.values()]);
  };
  const resolve = async (e: JournalEntry, accept: boolean) => {
    const resolved = (await repo.getKv<string[]>('proposals.resolved')) ?? [];
    await repo.setKv('proposals.resolved', [...new Set([...resolved, e.id])]);
    if (accept && e.after.loadKg !== undefined) {
      const ov = (await repo.getKv<Record<string, { loadKg: number }>>(OVERRIDES)) ?? {};
      await repo.setKv(OVERRIDES, { ...ov, [e.variantId]: { loadKg: e.after.loadKg } });
    }
    await loadProposals();
  };
  useEffect(() => {
    lightLoadsReport(repo).then(setLight);
    loadProposals();
    (async () => {
      const t = localDay(Date.now(), deviceTimeZone());
      const day = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7;
      const yest = new Date(Date.parse(`${t}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
      const free = (await loadFree(repo)).filter((b) => (b.day === yest || b.day === t) && /pull|chinup|row/.test(b.variantId));
      setPullYesterday(free.reduce((n, b) => n + (b.rounds.some((r) => r !== null) ? b.rounds.reduce<number>((a, r) => a + (r ?? 0), 0) : b.declaredTotal ?? 0), 0));
      // Séance prévue aujourd'hui : quels exercices de tirage contient-elle ?
      const wd = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7;
      const tpls = await loadTemplates(repo);
      const its = (await loadPlanning(repo)).filter((i) => i.weekStart === weekStart(t) && i.day === wd && i.kind === 'seance');
      setPullToday([...new Set(its.flatMap((i) => (i.adapted?.lines ?? tpls.find((x) => x.id === i.templateId)?.lines ?? []).filter((l) => /pull|chinup|row/.test(l.variantId)).map((l) => findVariant(l.variantId)?.variant.name ?? l.variantId)))]);
      setTodayItems((await loadPlanning(repo)).filter((i) => i.weekStart === weekStart(t) && i.day === day && !(i.adjustment && i.adjustment.decision !== 'adaptée')).sort((a, b) => a.start.localeCompare(b.start)));
    })();
  }, [repo]);
  if (p === undefined) return null;
  return (
    <>
      <h1>Coach</h1>
      <section className="coach-today" aria-label="Message du coach">
        <p className="cq-who">Aujourd’hui</p>
        {todayItems.length ? (
          <p className="coach-msg">
            {todayItems.map((i) => `${i.title} à ${i.start}`).join(', puis ')}. {todayItems.some((i) => i.sessionId) ? 'Déjà commencé : termine proprement.' : 'Pas de négociation : tu y vas.'}
          </p>
        ) : (
          <p className="coach-msg">Pas de séance prévue. Repos actif : 30 min de marche, tes 10 000 pas, et tu dors tôt.</p>
        )}
        {pullYesterday >= 40 && (
          <p className="coach-note">
            Bloc de tirage récent ({pullYesterday} rép.).{' '}
            {pullToday.length
              ? `Ta séance du jour contient : ${pullToday.join(', ')}. On la garde, mais réserve 3 sur ces exercices, pas d’échec ; si ta 1re série est sous la plage, saute la dernière (non comptée comme échec).`
              : 'Pas de tirage prévu aujourd’hui : rien à ajouter, pas de finisher.'}
          </p>
        )}
      </section>
      {p ? (
        <section className="ui-card stack" aria-label="Programme en cours">
          <p className="eyebrow">Programme en cours</p>
          <p className="row-title">{p.program.title}</p>
          <div className="row" style={{ gap: 6 }}>
            <span className="pill num">{p.program.weeks} sem.</span>
            <span className="pill num">{p.program.week.filter((w) => w.kind === 'seance').length} force</span>
            <span className="pill num">{p.program.week.filter((w) => w.kind === 'course').length} course</span>
          </div>
          <ul className="cq-rules">
            {p.program.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="row">
            <button className="btn primary" onClick={() => go({ name: 'planning' })}>
              Ma semaine
            </button>
            <button className="btn ghost" onClick={() => go({ name: 'coachProgram' })}>
              Refaire l’entretien
            </button>
          </div>
        </section>
      ) : (
        <button className="ui-card list-row" onClick={() => go({ name: 'coachProgram' })}>
          <span className="icon-chip accent">
            <Dumbbell size={16} aria-hidden="true" />
          </span>
          <div className="grow">
            <p className="eyebrow">Entretien · {STEPS.length} questions</p>
            <p className="row-title">Construire mon programme</p>
          </div>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      {proposals.map((e) => (
        <section key={e.id} className="ui-card stack light-card" aria-label="Proposition à valider" style={{ marginTop: 10 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Coach · à valider</p>
          <p className="row-title" style={{ margin: 0 }}>{findVariant(e.variantId)?.variant.name ?? e.variantId}</p>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>{e.reason}</p>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm primary" onClick={() => resolve(e, true)}>
              Valider la baisse
            </button>
            <button className="btn sm ghost" onClick={() => resolve(e, false)}>
              Garder la charge
            </button>
          </div>
        </section>
      ))}
      {light.length > 0 && (
        <section className="ui-card stack light-card" aria-label="Charges trop légères" style={{ marginTop: 10 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Coach · charges trop légères</p>
          {light.map((l) => (
            <div key={l.variantId}>
              <p className="row-title" style={{ margin: 0 }}>
                {findVariant(l.variantId)?.variant.name ?? l.variantId}
                {l.loadKg ? ` · ${l.loadKg} kg` : ''}
              </p>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>{l.why}</p>
            </div>
          ))}
          {light.some((l) => l.next === undefined) && (
            <button className="btn primary sm" onClick={() => go({ name: 'gear' })} style={{ alignSelf: 'flex-start' }}>
              Matériel conseillé
            </button>
          )}
        </section>
      )}
      <button className="ui-card list-row" onClick={() => go({ name: 'free' })} style={{ marginTop: 10 }}>
        <span className="icon-chip accent">
          <Dumbbell size={16} aria-hidden="true" />
        </span>
        <div className="grow">
          <p className="eyebrow">Hors programme</p>
          <p className="row-title">Séance libre / EMOM</p>
        </div>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button className="ui-card list-row" onClick={() => go({ name: 'agenda' })} style={{ marginTop: 10 }}>
        <span className="icon-chip accent">
          <CalendarCheck size={16} aria-hidden="true" />
        </span>
        <div className="grow">
          <p className="eyebrow">Emploi du temps · séjours</p>
          <p className="row-title">Ma semaine et mes trous</p>
        </div>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button className="ui-card list-row" onClick={() => go({ name: 'spots' })} style={{ marginTop: 10 }}>
        <span className="icon-chip accent">
          <MapPin size={16} aria-hidden="true" />
        </span>
        <div className="grow">
          <p className="eyebrow">Autour de moi · vacances</p>
          <p className="row-title">Spots : street workout, pistes, parcs</p>
        </div>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button className="ui-card list-row" onClick={() => go({ name: 'gear' })} style={{ marginTop: 10 }}>
        <span className="icon-chip accent">
          <Dumbbell size={16} aria-hidden="true" />
        </span>
        <div className="grow">
          <p className="eyebrow">Matériel</p>
          <p className="row-title">Mon matériel et conseils d’achat</p>
        </div>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </>
  );
}
