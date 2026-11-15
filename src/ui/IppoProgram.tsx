// Entretien de programme guidé par Ippo : questions courtes, réponses en puces, puis le moteur
// existant construit le programme. Aucune décision médicale, aucune donnée inventée.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Repository } from '../storage/db';
import { localDay } from '../engine/derive';
import { shiftWeek } from '../engine/planning';
import { weekStart } from '../engine/challenge';
import { availableLoads } from '../engine/progression';
import {
  buildProgram,
  type Pain,
  type Program,
  type ProgramAnswers,
  type QuitReason,
  type RunGoal,
  type Slot,
} from '../engine/programBuilder';
import { loadKettlebells, loadPieces } from './equipment';
import { extraRules, saveProgram, type SaveProgramResult } from './saveProgram';
import { deviceTimeZone } from './support';
import type { IppoMessage } from '../ippo/types';
import './ippo.css';

type Option = { value: string; label: string; sub?: string };

type Step =
  | { id: 'priority'; kind: 'single'; prompt: string; options: Option[] }
  | { id: 'style' | 'boxingPerWeek' | 'boxingPlace' | 'rope' | 'morning' | 'flatGlutes' | 'visibleAbs' | 'weeks'; kind: 'single'; prompt: string; options: Option[] }
  | { id: 'boxingDays' | 'fatZones'; kind: 'multi'; prompt: string; options: Option[] }
  | { id: 'pains'; kind: 'multi'; prompt: string; options: Option[] }
  | { id: 'days' | 'minutes' | 'slot' | 'sleep' | 'quit' | 'runs' | 'runGoal'; kind: 'single'; prompt: string; options: Option[] }
  | { id: 'tests'; kind: 'tests'; prompt: string };

const STYLES: Option[] = [
  { value: 'musculation', label: 'Musculation', sub: 'Salle ou matériel à la maison' },
  { value: 'calisthenics', label: 'Calisthenics / street workout', sub: 'Barre, anneaux, poids du corps' },
  { value: 'boxe', label: 'Boxe & conditionnement', sub: 'Club, corde, sac' },
  { value: 'hybride', label: 'Hybride', sub: 'Force + boxe / cardio' },
];

const BOXING: Option[] = [
  { value: '1', label: '1 séance' },
  { value: '2', label: '2 séances' },
  { value: '3', label: '3 séances' },
];

const FAT_ZONES: Option[] = [
  { value: 'fessiers', label: 'Fessiers' },
  { value: 'ventre', label: 'Ventre' },
  { value: 'hanches', label: 'Hanches / poignées' },
  { value: 'cuisses', label: 'Cuisses' },
  { value: 'aucune', label: 'Aucune en particulier' },
];

const BOXING_PLACES: Option[] = [
  { value: 'maison', label: 'À la maison', sub: 'Corde, ombres, sac' },
  { value: 'club', label: 'En club', sub: 'Cours collectifs' },
];

const BLOCKS: Option[] = [
  { value: '8', label: '8 semaines', sub: 'Camp, deload semaine 4' },
  { value: '4', label: '4 semaines', sub: 'Bloc classique' },
];

const WEEKDAYS: Option[] = [
  { value: '0', label: 'Lundi' },
  { value: '1', label: 'Mardi' },
  { value: '2', label: 'Mercredi' },
  { value: '3', label: 'Jeudi' },
  { value: '4', label: 'Vendredi' },
  { value: '5', label: 'Samedi' },
  { value: '6', label: 'Dimanche' },
];

const YES_NO: Option[] = [
  { value: 'oui', label: 'Oui' },
  { value: 'non', label: 'Non' },
];

const PRIORITIES: Option[] = [
  { value: 'muscle', label: 'Prendre du muscle', sub: 'Volume, progression de charge' },
  { value: 'force', label: 'Gagner en force', sub: 'Charges lourdes, séries courtes' },
  { value: 'hybride', label: 'Muscle + cardio', sub: 'Force et course, sans arbitrer' },
  { value: 'seche', label: 'Perdre du gras', sub: 'Force conservée, déficit léger' },
  { value: 'course', label: 'Progresser en course', sub: 'Endurance et allure' },
];

const PAINS: Option[] = [
  { value: 'aucune', label: 'Aucune douleur' },
  { value: 'epaules', label: 'Épaules' },
  { value: 'coudes', label: 'Coudes' },
  { value: 'poignets', label: 'Poignets' },
  { value: 'dos', label: 'Dos' },
  { value: 'genoux', label: 'Genoux' },
];

const DAYS: Option[] = [
  { value: '2', label: '2 séances' },
  { value: '3', label: '3 séances' },
  { value: '4', label: '4 séances' },
  { value: '5', label: '5 séances' },
];

const MINUTES: Option[] = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '75', label: '75 min' },
];

const SLOTS: Option[] = [
  { value: 'matin', label: 'Le matin' },
  { value: 'midi', label: 'À midi' },
  { value: 'soir', label: 'Le soir' },
];

const SLEEP: Option[] = [
  { value: '5.5', label: 'Moins de 6 h' },
  { value: '6.5', label: '6 à 7 h' },
  { value: '7.5', label: '7 à 8 h' },
  { value: '8.5', label: 'Plus de 8 h' },
];

const QUIT: Option[] = [
  { value: 'motivation', label: 'La motivation tombe' },
  { value: 'temps', label: 'Le temps manque' },
  { value: 'ennui', label: 'Je m’ennuie' },
  { value: 'fatigue', label: 'La fatigue' },
  { value: 'douleur', label: 'La douleur' },
];

const RUNS: Option[] = [
  { value: '0', label: 'Aucune' },
  { value: '2', label: '2 sorties' },
  { value: '3', label: '3 sorties' },
  { value: '4', label: '4 sorties' },
];

const RUN_GOALS: Option[] = [
  { value: 'base', label: 'Reprendre une base' },
  { value: '5k', label: 'Préparer un 5 km' },
  { value: '10k', label: 'Préparer un 10 km' },
];

export function buildSteps(a: ProgramAnswers): Step[] {
  const steps: Step[] = [
    { id: 'style', kind: 'single', prompt: 'Quel style d’entraînement tu veux pour ce bloc ?', options: STYLES },
  ];
  if (a.style === 'boxe' || a.style === 'hybride') {
    steps.push({ id: 'boxingPerWeek', kind: 'single', prompt: 'Combien de séances de boxe par semaine ?', options: BOXING });
    if ((a.boxingPerWeek ?? 0) > 0) {
      steps.push({ id: 'boxingDays', kind: 'multi', prompt: 'Quels jours tu fais la boxe ? Je placerai la force autour.', options: WEEKDAYS });
      steps.push({ id: 'boxingPlace', kind: 'single', prompt: 'Tu la fais où, pour l’instant ?', options: BOXING_PLACES });
    }
  }
  steps.push(
    { id: 'rope', kind: 'single', prompt: 'Tu as une corde à sauter et tu veux l’utiliser ?', options: YES_NO },
    { id: 'morning', kind: 'single', prompt: 'Tu veux caler tes séances le matin, après Fajr ?', options: YES_NO },
    { id: 'priority', kind: 'single', prompt: 'Quel est ton objectif principal pour ce bloc ?', options: PRIORITIES },
    { id: 'pains', kind: 'multi', prompt: 'As-tu une douleur ou une gêne à signaler ? Je retirerai les mouvements concernés.', options: PAINS },
    { id: 'flatGlutes', kind: 'single', prompt: 'Tu veux éviter de prendre des fesses ? Je remplace la séance jambes par du sissy squat et du curl nordique.', options: YES_NO },
    { id: 'fatZones', kind: 'multi', prompt: 'Où est-ce que tu prends du gras en premier ? (Information : la perte reste globale.)', options: FAT_ZONES },
    { id: 'visibleAbs', kind: 'single', prompt: 'Tu veux voir tes abdos ? La visibilité dépend du gras global ; je mets le déficit et le gainage en conséquence.', options: YES_NO },
    {
      id: 'days',
      kind: 'single',
      prompt: (a.boxingPerWeek ?? 0) >= 2
        ? 'Combien de séances de force par semaine ? Avec 2 boxes, 3 suffisent souvent.'
        : 'Combien de séances de musculation par semaine, réalistement ?',
      options: DAYS,
    },
    { id: 'minutes', kind: 'single', prompt: 'Combien de temps par séance ?', options: MINUTES },
  );
  if (!a.morningAnchor) {
    steps.push({ id: 'slot', kind: 'single', prompt: 'Tu t’entraînes plutôt quand ?', options: SLOTS });
  }
  steps.push(
    { id: 'sleep', kind: 'single', prompt: 'Combien d’heures de sommeil, en moyenne ?', options: SLEEP },
    { id: 'quit', kind: 'single', prompt: 'Quand tu arrêtes un programme, c’est plutôt à cause de quoi ?', options: QUIT },
    { id: 'weeks', kind: 'single', prompt: 'Quelle durée de bloc ?', options: BLOCKS },
  );
  const p = a.priority;
  if (p === 'course' || p === 'hybride' || p === 'seche') {
    steps.push({ id: 'runs', kind: 'single', prompt: 'Combien de sorties de course par semaine ?', options: RUNS });
    if ((a.runsPerWeek ?? 0) > 0) {
      steps.push({ id: 'runGoal', kind: 'single', prompt: 'Quel est ton objectif de course ?', options: RUN_GOALS });
    }
  }
  return steps;
}

function labelFor(step: Step, value: string | string[] | null): string {
  if (step.kind === 'tests') return 'Tests renseignés (ou passés)';
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((v) => (v === null ? 'Je ne sais pas' : step.options.find((o) => o.value === v)?.label ?? v))
    .join(' · ');
}

export function applyAnswer(a: ProgramAnswers, id: Step['id'], value: string | string[] | { pullups: number | null; dips: number | null; pushups: number | null }): ProgramAnswers {
  switch (id) {
    case 'style': {
      const style = value as ProgramAnswers['style'];
      return {
        ...a,
        style,
        ...(style === 'boxe' || style === 'hybride' ? {} : { boxingPerWeek: 0, boxingDays: [] }),
      };
    }
    case 'boxingPerWeek':
      return { ...a, boxingPerWeek: Number(value) };
    case 'boxingDays':
      return { ...a, boxingDays: (value as string[]).map(Number) };
    case 'fatZones': {
      const zones = (value as string[]).filter((z) => z !== 'aucune');
      return { ...a, fatZones: zones as ProgramAnswers['fatZones'] };
    }
    case 'visibleAbs':
      return { ...a, visibleAbs: value === 'oui' };
    case 'boxingPlace':
      return { ...a, boxingPlace: value as ProgramAnswers['boxingPlace'] };
    case 'flatGlutes':
      return { ...a, flatGlutes: value === 'oui' };
    case 'weeks':
      return { ...a, weeks: Number(value) };
    case 'rope':
      return { ...a, rope: value === 'oui' };
    case 'morning': {
      const yes = value === 'oui';
      return { ...a, morningAnchor: yes, slot: yes ? 'matin' : a.slot };
    }
    case 'priority':
      return { ...a, priority: value as ProgramAnswers['priority'] };
    case 'pains':
      return { ...a, pains: (value as string[]).filter((v) => v !== 'aucune') as Pain[] };
    case 'days':
      return { ...a, days: Number(value) };
    case 'minutes':
      return { ...a, minutes: Number(value) };
    case 'slot':
      return { ...a, slot: value as Slot };
    case 'sleep':
      return { ...a, sleepH: Number(value) };
    case 'quit':
      return { ...a, quitReason: value as QuitReason };
    case 'runs':
      return { ...a, runsPerWeek: Number(value) };
    case 'runGoal':
      return { ...a, runGoal: value as RunGoal };
    case 'tests': {
      const t = value as { pullups: number | null; dips: number | null; pushups: number | null };
      return { ...a, maxPullups: t.pullups, maxDips: t.dips, maxPushups: t.pushups };
    }
    default:
      return a;
  }
}

function fmtDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function IppoProgram({ repo, onBack, onDone }: { repo: Repository; onBack: () => void; onDone: () => void }) {
  const [answers, setAnswers] = useState<ProgramAnswers>({ pains: [] });
  const [steps, setSteps] = useState<Step[]>(() => buildSteps({ pains: [] }));
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<IppoMessage[]>(() => {
    const first = buildSteps({ pains: [] })[0];
    const intro: IppoMessage = {
      id: 'intro',
      role: 'assistant',
      content:
        'On construit ton programme. Je te pose quelques questions, une par une : réponds au plus juste, pas au plus flatteur. Rien n’est enregistré avant la fin.',
      at: Date.now(),
      origin: 'local',
    };
    return first ? [intro, { id: 'q0', role: 'assistant', content: first.prompt, at: Date.now(), origin: 'local' }] : [intro];
  });
  const [multi, setMulti] = useState<string[]>([]);
  const [tests, setTests] = useState({ pullups: '', dips: '', pushups: '' });
  const [program, setProgram] = useState<Program | null>(null);
  const [saved, setSaved] = useState<SaveProgramResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const today = localDay(Date.now(), deviceTimeZone());
  const startDay = useMemo(() => shiftWeek(weekStart(today), 1), [today]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, step, program, saved]);

  const current = steps[step];
  const progress = Math.min(100, Math.round((step / steps.length) * 100));

  const push = useCallback((role: IppoMessage['role'], content: string) => {
    setMessages((m) => [...m, { id: `${Date.now()}-${m.length}`, role, content, at: Date.now(), origin: 'local' }]);
  }, []);

  const preview = useCallback(
    async (a: ProgramAnswers) => {
      setBusy(true);
      setError(null);
      try {
        const loads = availableLoads(await loadPieces(repo));
        const kbs = await loadKettlebells(repo);
        const p = buildProgram(a, loads, kbs, []);
        setProgram({ ...p, rules: extraRules(p.rules, a) });
        push('assistant', `Voilà ce que je te propose : ${p.title}, ${p.weeks} semaines. Tu peux encore relire et créer.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Je n’ai pas pu construire le programme.');
      } finally {
        setBusy(false);
      }
    },
    [push, repo],
  );

  const advance = useCallback(
    (value: string | string[] | { pullups: number | null; dips: number | null; pushups: number | null }, label: string) => {
      if (!current) return;
      const nextAnswers = applyAnswer(answers, current.id, value);
      const nextSteps = buildSteps(nextAnswers);
      setAnswers(nextAnswers);
      setSteps(nextSteps);
      push('user', label);
      if (step + 1 < nextSteps.length) {
        const next = nextSteps[step + 1];
        setStep(step + 1);
        if (next) push('assistant', next.prompt);
      } else {
        setStep(step + 1);
        void preview(nextAnswers);
      }
    },
    [answers, current, preview, push, step],
  );

  const create = useCallback(async () => {
    if (!program || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveProgram(repo, program, answers);
      setSaved(result);
      push('assistant', `C’est prêt. Ton bloc démarre le ${fmtDate(result.startWeek)}. Tu le retrouves dans Entraînement et Semaine.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }, [answers, busy, program, push, repo]);

  return (
    <div className="ippo-screen" role="region" aria-label="Programme guidé par Ippo">
      <header className="ippo-head">
        <button className="ippo-icon" aria-label="Retour" onClick={onBack}>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="ippo-brand">
          <span className="ippo-logo">IPPO</span>
          <span className="ippo-status on">
            <span className="ippo-dot" aria-hidden="true" />
            Programme
          </span>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <div className="ippo-scroll">
        <div className="ippo-progress" aria-hidden="true">
          <i style={{ width: `${saved ? 100 : progress}%` }} />
        </div>

        <div className="ippo-thread" aria-live="polite">
          {messages.map((m) => (
            <article key={m.id} className={`ippo-msg ${m.role}`}>
              {m.role === 'assistant' && <span className="ippo-avatar" aria-hidden="true">I</span>}
              <div className="ippo-bubble">
                <div className="ippo-text">{m.content}</div>
              </div>
            </article>
          ))}
          {busy && (
            <article className="ippo-msg assistant">
              <span className="ippo-avatar" aria-hidden="true">I</span>
              <div className="ippo-bubble ippo-typing" aria-label="Ippo réfléchit">
                <span />
                <span />
                <span />
              </div>
            </article>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="ippo-composer ippo-flow">
        {saved ? (
          <div className="stack">
            <p className="ippo-note" style={{ margin: 0 }}>
              Programme créé. Première séance à partir du {fmtDate(saved.startWeek)}.
            </p>
            <div className="ippo-sheet-actions">
              <button className="ippo-btn ghost" onClick={onBack}>Retour au coach</button>
              <button className="ippo-btn" onClick={onDone}>Voir mes séances</button>
            </div>
          </div>
        ) : program ? (
          <div className="stack">
            <div className="ippo-summary">
              <p className="ippo-kicker">Ta proposition</p>
              <p className="ippo-summary-title">{program.title}</p>
              <p className="ippo-note" style={{ margin: '4px 0 8px' }}>
                {program.weeks} semaines · {program.week.filter((w) => w.kind === 'seance').length} séances de force ·{' '}
                {program.week.filter((w) => w.kind === 'course').length} course(s) · démarrage le {fmtDate(startDay)}
                {answers.boxingPerWeek ? ` · boxe ${answers.boxingPerWeek}×/semaine` : ''}
                {answers.boxingPlace ? ` (${answers.boxingPlace})` : ''}
                {answers.rope ? ' · corde' : ''}
                {answers.flatGlutes ? ' · fessiers évités' : ''}
                {answers.visibleAbs ? ' · objectif abdos' : ''}
                {answers.priority === 'seche' ? ' · déficit' : ''}
              </p>
              <ul className="ippo-rules">
                {program.rules.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div className="ippo-sheet-actions">
              <button className="ippo-btn ghost" onClick={onBack}>Quitter</button>
              <button className="ippo-btn" onClick={() => void create()} disabled={busy}>
                {busy ? 'Création…' : 'Créer mon programme'}
              </button>
            </div>
          </div>
        ) : current ? (
          <StepActions
            step={current}
            multi={multi}
            setMulti={setMulti}
            tests={tests}
            setTests={setTests}
            busy={busy}
            onSingle={(value) => advance(value, labelFor(current, value))}
            onMulti={() => {
              if (multi.length === 0) return;
              advance(multi, labelFor(current, multi));
              setMulti([]);
            }}
            onTests={(unknown) => {
              if (unknown) {
                advance({ pullups: null, dips: null, pushups: null }, 'Je ne sais pas');
                return;
              }
              const parse = (v: string) => {
                const n = Number(v.replace(',', '.'));
                return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
              };
              const value = { pullups: parse(tests.pullups), dips: parse(tests.dips), pushups: parse(tests.pushups) };
              advance(value, 'Tests renseignés (ou passés)');
            }}
          />
        ) : (
          <p className="ippo-note" style={{ margin: 0 }}>Chargement…</p>
        )}
        {error && <p className="ippo-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function StepActions({
  step,
  multi,
  setMulti,
  tests,
  setTests,
  busy,
  onSingle,
  onMulti,
  onTests,
}: {
  step: Step;
  multi: string[];
  setMulti: (v: string[]) => void;
  tests: { pullups: string; dips: string; pushups: string };
  setTests: (v: { pullups: string; dips: string; pushups: string }) => void;
  busy: boolean;
  onSingle: (value: string) => void;
  onMulti: () => void;
  onTests: (unknown?: boolean) => void;
}) {
  if (step.kind === 'tests') {
    const field = (key: 'pullups' | 'dips' | 'pushups', label: string) => (
      <label className="ippo-test-field" key={key}>
        <span>{label}</span>
        <input
          inputMode="numeric"
          value={tests[key]}
          onChange={(e) => setTests({ ...tests, [key]: e.target.value })}
          placeholder="—"
          aria-label={label}
        />
      </label>
    );
    return (
      <div className="stack">
        <div className="ippo-tests">
          {field('pullups', 'Tractions max')}
          {field('dips', 'Dips max')}
          {field('pushups', 'Pompes max')}
        </div>
        <div className="ippo-sheet-actions">
          <button className="ippo-btn ghost" onClick={() => onTests(true)} disabled={busy}>Je ne sais pas</button>
          <button className="ippo-btn" onClick={() => onTests(false)} disabled={busy}>Valider</button>
        </div>
      </div>
    );
  }

  if (step.kind === 'multi') {
    const toggle = (value: string) => {
      if (value === 'aucune') return setMulti(['aucune']);
      const without = multi.filter((v) => v !== 'aucune');
      setMulti(without.includes(value) ? without.filter((v) => v !== value) : [...without, value]);
    };
    return (
      <div className="stack">
        <div className="ippo-options">
          {step.options.map((o) => (
            <button
              key={o.value}
              className={`ippo-option ${multi.includes(o.value) ? 'sel' : ''}`}
              aria-pressed={multi.includes(o.value)}
              onClick={() => toggle(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button className="ippo-btn" onClick={onMulti} disabled={busy || multi.length === 0}>
          Valider
        </button>
      </div>
    );
  }

  return (
    <div className="ippo-options">
      {step.options.map((o) => (
        <button key={o.value} className="ippo-option" onClick={() => onSingle(o.value)} disabled={busy}>
          <span>{o.label}</span>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}
