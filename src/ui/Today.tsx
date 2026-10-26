// Accueil : tableau de bord du jour. Peu de texte, des chiffres et des icônes.
// Chaque valeur vient de données enregistrées ; « — » signifie inconnu, jamais zéro.

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, Snowflake, Camera, ChevronRight, Mountain, Watch, ClipboardList, Droplet, Dumbbell, Flame, Footprints, Minus, Moon, Play, Plus, Scale, Target, Trophy } from 'lucide-react';
import { trend, type WeighIn } from '../engine/weight';
import { useWinterMode, winterForced, winterInfo, type WinterInfo } from './winterArc';
import { useWeightLog, WeightModal } from './Weight';
import { NOVEMBER_2026, habitStatus, weekStart } from '../engine/challenge';
import { addWater, daysUntil } from '../engine/daily';
import { DAILY_PAGES, currentPage } from '../engine/reading';
import { HabitsSheet, useDayHabits } from './Habits';
import { RunModal, WhyModal, useTargets } from './Targets';
import { NextStepCard } from './Nutrition';
import { useReading } from './Reading';
import { localDay } from '../engine/derive';
import { estimateMinutes } from '../engine/disruption';
import { itemStatus, toMin, type PlannedItem } from '../engine/planning';
import { GOAL_LABELS, type GoalVersion } from '../engine/profile';
import { project } from '../engine/session';
import type { Repository } from '../storage/db';
import { Modal } from './common';
import { STEPS } from './Onboarding';
import { loadPlanning, startPlanned } from './Planning';
import { loadGoals, loadOnboarding } from './profileStore';
import { deviceTimeZone } from './support';
import { loadTemplates, type SessionTemplate } from './templates';
import type { Route } from './App';

const STEPS_GOAL = 10000; // objectif du défi de novembre (choisi par Hmidou)

type Field = 'sleepH' | 'steps' | 'activeKcal';

function Kpi({
  icon,
  label,
  value,
  sub,
  onClick,
  onLabel,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
  onLabel?: () => void;
  children?: ReactNode;
}) {
  const head = (
    <>
      <span className="kpi-head">
        <span className="icon-chip sm">{icon}</span>
        <span className="kpi-label">{label}</span>
      </span>
      <span className="kpi-value num">
        {value}
        {sub && <span className="kpi-sub"> {sub}</span>}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button className="ui-card kpi" onClick={onClick} aria-label={`${label} : ${value}${sub ? ` ${sub}` : ''}`}>
        {head}
        {children}
      </button>
    );
  }
  return (
    <div className="ui-card kpi">
      {onLabel ? (
        <button className="tile-hit kpi-hit" onClick={onLabel} aria-label={`${label} : objectif`}>
          {head}
        </button>
      ) : (
        head
      )}
      {children}
    </div>
  );
}

/** Flocons : [position %, délai s, durée s, taille px] — fixes pour un rendu stable. */
const SNOW: [number, number, number, number][] = [
  [6, 0, 9, 4], [18, 3, 11, 6], [29, 1.5, 8, 3], [41, 5, 12, 5], [52, 2, 10, 4], [63, 6, 9, 6],
  [74, 0.5, 13, 3], [85, 4, 10, 5], [93, 2.5, 8, 4], [12, 7, 12, 3], [47, 8, 9, 5], [70, 9, 11, 4],
];

/** En-tête héro : dégradé chaud, formes organiques animées, anneau « Journée » (habitudes réellement cochées). */
function HeroHeader({ date, greeting, score, done, total, chips, winter }: { date: string; greeting: string; score: number; done: number; total: number; chips: { icon: ReactNode; text: string }[]; winter?: WinterInfo }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const ringStyle = { strokeDashoffset: c * (1 - Math.min(1, score)), '--ring-c': `${c}` } as CSSProperties;
  return (
    <header className={`hero ${winter?.active ? 'winter' : ''}`}>
      {winter?.active && (
        <div className="snow" aria-hidden="true">
          {SNOW.map(([left, delay, dur, size], i) => (
            <span key={i} style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${dur}s`, width: size, height: size }} />
          ))}
        </div>
      )}
      <svg className="hero-blobs" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <filter id="hero-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>
        <g filter="url(#hero-blur)">
          <path className="blob b1" d="M300,20 C360,10 410,60 395,120 C380,180 320,190 280,160 C240,130 240,30 300,20 Z" />
          <path className="blob b2" d="M60,130 C100,90 170,110 175,160 C180,210 110,240 70,215 C30,190 20,170 60,130 Z" />
          <path className="blob b3" d="M190,-20 C240,-30 270,20 250,60 C230,100 170,90 160,50 C150,10 160,-15 190,-20 Z" />
        </g>
        <path className="shape s1" d="M330,-30 C400,-20 430,60 400,110 C370,160 300,150 270,110 C240,70 260,-40 330,-30 Z" />
        <path className="shape s2" d="M-20,170 C30,140 90,160 110,200 C125,230 60,260 10,245 C-30,232 -50,190 -20,170 Z" />
      </svg>
      <svg className="hero-wave" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
        <path className="back" d="M0,30 C70,8 150,52 230,30 C300,10 350,18 400,26 L400,60 L0,60 Z" />
        <path d="M0,42 C80,18 170,62 250,40 C310,24 360,30 400,36 L400,60 L0,60 Z" />
      </svg>
      <div className="hero-content">
        <div className="hero-text">
          {winter?.active && (
            <span className="winter-tag">
              <Snowflake size={12} aria-hidden="true" /> Winter Arc · {winter.day ? `Jour ${winter.day}/${winter.total}` : `J−${winter.daysLeft ?? 0}`}
            </span>
          )}
          <p className="hero-date">{date}</p>
          <h1 className="hero-greet">{greeting}</h1>
          <div className="hero-chips">
            {chips.map((ch, i) => (
              <span key={i} className="hero-chip num" style={{ animationDelay: `${120 + i * 80}ms` }}>
                {ch.icon}
                {ch.text}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-ring" role="img" aria-label={`Journée : ${done} habitudes sur ${total}`}>
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle cx="44" cy="44" r={r} fill="none" stroke="rgb(37 99 235 / 0.14)" strokeWidth="8" />
            <circle className="hero-ring-fill" cx="44" cy="44" r={r} fill="none" stroke="#2563eb" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} style={ringStyle} transform="rotate(-90 44 44)" />
          </svg>
          <span className="hero-ring-value num">
            {Math.round(score * 100)}
            <small>%</small>
          </span>
        </div>
      </div>
    </header>
  );
}

/** Jauge linéaire fine (0–1). */
function Meter({ value }: { value: number }) {
  return (
    <span className="meter" aria-hidden="true">
      <span style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </span>
  );
}

/** Mini-courbe des 14 dernières pesées. */
function Spark({ days }: { days: WeighIn[] }) {
  const pts = days.slice(-14);
  if (pts.length < 2) return null;
  const kgs = pts.map((p) => p.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const range = Math.max(0.5, max - min);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 76 + 2).toFixed(1)},${(2 + (1 - (p.kg - min) / range) * 30).toFixed(1)}`).join(' ');
  return (
    <svg width="80" height="34" viewBox="0 0 80 34" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const fmtNum = (n: number) => n.toLocaleString('fr-BE');
const fmtHours = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

const EDIT_META: Record<Field, { title: string; unit: string; hint: string; step: string }> = {
  sleepH: { title: 'Sommeil', unit: 'h', hint: 'Lu sur ta montre ou estimé par toi.', step: '0.25' },
  steps: { title: 'Pas', unit: 'pas', hint: 'Lu sur ta montre.', step: '100' },
  activeKcal: { title: 'Calories actives', unit: 'kcal', hint: 'Lues sur ta montre. Ce n’est pas un crédit alimentaire.', step: '10' },
};

type Hero =
  | { kind: 'open'; id: string; title: string; done: number; total: number }
  | { kind: 'planned'; item: PlannedItem; tpl?: SessionTemplate }
  | { kind: 'none' };

export function Today({ repo, go, night }: { repo: Repository; go: (r: Route) => void; night: { phase: string; pastBed: boolean; bedtime?: string; now: Date } }) {
  const tz = deviceTimeZone();
  const today = localDay(Date.now(), tz);
  const [goal, setGoal] = useState<GoalVersion | undefined>();
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [hero, setHero] = useState<Hero | null>(null);
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState('');
  const habits = useDayHabits(repo, today);
  const { daily, saveDaily } = habits;
  const [sheet, setSheet] = useState(false);
  const [why, setWhy] = useState<'water' | 'kcal' | 'run' | null>(null);
  const [running, setRunning] = useState(false);
  const reading = useReading(repo);
  const { mode: winterMode } = useWinterMode(repo);
  const winter = winterInfo(winterMode, today, winterForced());

  const weight = useWeightLog(repo);
  const lastWeight = weight.days[weight.days.length - 1];
  const weightTrend = trend(weight.days, today);
  const [weighing, setWeighing] = useState(false);

  useEffect(() => {
    (async () => {
      const goals = await loadGoals(repo);
      setGoal(goals[goals.length - 1]);
      const ob = await loadOnboarding(repo);
      setOnboardingStep(ob.completedAt ? null : ob.step);

      const open = await repo.openSession();
      if (open) {
        const st = project(await repo.sessionEvents(open.id));
        setHero({ kind: 'open', id: open.id, title: open.title, done: st?.sets.filter((s) => s.status !== 'pending').length ?? 0, total: st?.sets.length ?? 0 });
        return;
      }
      const day = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
      const sessions = (await repo.listSessions()).filter((r) => localDay(r.startedAt, tz) === today);
      const templates = await loadTemplates(repo);
      const next = (await loadPlanning(repo))
        .filter((i) => i.weekStart === weekStart(today) && i.day === day && (i.kind === 'seance' || i.kind === 'course') && !i.adjustment)
        .filter((i) => itemStatus(i, today, today, sessions) === 'prévu')
        .sort((a, b) => toMin(a.start) - toMin(b.start))[0];
      setHero(next ? { kind: 'planned', item: next, tpl: templates.find((t) => t.id === next.templateId) } : { kind: 'none' });
    })();
  }, [repo, today, tz]);

  const openEditor = (field: Field) => {
    const current = daily?.[field];
    setDraft(current === undefined ? '' : String(current));
    setEditing(field);
  };

  const saveEditor = async (clear = false) => {
    if (!editing) return;
    const value = clear || draft.trim() === '' ? undefined : Number(draft.replace(',', '.'));
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) return;

    await saveDaily({ ...(daily ?? {}), [editing]: value, updatedAt: Date.now() });
    setEditing(null);
  };

  const challengeOn = today >= NOVEMBER_2026.start && today <= NOVEMBER_2026.end;
  const habitsDone = habits.done;
  const trainingMin = hero?.kind === 'planned' && hero.tpl ? hero.item.adapted?.estimatedMin ?? estimateMinutes(hero.tpl.lines) : hero?.kind === 'open' ? 60 : 0;
  const targets = useTargets(repo, weight.days, trainingMin);
  const waterL = targets.water.value;
  const kcal = targets.calories.value;
  const runKm = targets.run.value?.km;
  const pageNow = reading.book ? currentPage(reading.log, reading.book.id) : undefined;
  const sleepBars = Math.min(8, Math.round(daily?.sleepH ?? 0));

  return (
    <>
      <HeroHeader
        date={new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(Date.now())}
        greeting={`${night.phase === 'matin' ? 'Bonjour' : night.phase === 'soir' ? 'Bonsoir' : night.phase === 'nuit' ? 'Bonne nuit' : 'Salut'} Hmidou`}
        score={habitsDone / NOVEMBER_2026.daily.length}
        done={habitsDone}
        total={NOVEMBER_2026.daily.length}
        chips={[
          { icon: <Dumbbell size={13} aria-hidden="true" />, text: hero?.kind === 'open' ? 'En cours' : hero?.kind === 'planned' ? hero.item.start : 'Repos' },
          { icon: <Droplet size={13} aria-hidden="true" />, text: `${((daily?.waterMl ?? 0) / 1000).toLocaleString('fr-BE', { maximumFractionDigits: 2 })} L` },
          { icon: <Footprints size={13} aria-hidden="true" />, text: daily?.steps !== undefined ? fmtNum(daily.steps) : '—' },
        ]}
        winter={winter}
      />

      {night.pastBed && night.bedtime && (
        <div className="bed-banner" role="status">
          <span className="icon-chip">
            <Moon size={16} aria-hidden="true" />
          </span>
          <div className="grow">
            <p className="row-title">Au lit</p>
            <p className="row-meta num">
              {night.now.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })} · coucher {night.bedtime}
            </p>
          </div>
        </div>
      )}

      {onboardingStep !== null && (
        <button className="ui-card list-row" onClick={() => go({ name: 'onboarding' })}>
          <span className="icon-chip">
            <ClipboardList size={16} aria-hidden="true" />
          </span>
          <span className="grow row-title">Terminer la configuration</span>
          <span className="pill num">
            {Math.min(onboardingStep + 1, STEPS.length + 1)}/{STEPS.length + 1}
          </span>
        </button>
      )}

      <section className="ui-card list-row" aria-label="Séance du jour">
        <span className="icon-chip accent">
          <Dumbbell size={16} aria-hidden="true" />
        </span>
        <div className="grow">
          <p className="eyebrow">
            {hero?.kind === 'open' ? 'En cours' : hero?.kind === 'planned' ? `${hero.item.kind === 'course' ? 'Course' : 'Séance'} · ${hero.item.start}${hero.item.adapted ? ' · adaptée' : ''}` : 'Séance du jour'}
          </p>
          <p className="row-title">{hero?.kind === 'open' ? hero.title : hero?.kind === 'planned' ? hero.item.title : 'Rien de prévu'}</p>
          {hero?.kind === 'open' && <p className="row-meta num">{hero.done}/{hero.total} séries</p>}
          {hero?.kind === 'planned' && hero.item.detail && <p className="row-meta">{hero.item.detail}</p>}
          {hero?.kind === 'planned' && hero.tpl && (
            <p className="row-meta num">
              {(hero.item.adapted?.lines ?? hero.tpl.lines).length} exos · {(hero.item.adapted?.lines ?? hero.tpl.lines).reduce((n, l) => n + l.sets, 0)} séries · ≈
              {hero.item.adapted?.estimatedMin ?? estimateMinutes(hero.tpl.lines)} min
            </p>
          )}
        </div>
        {hero?.kind === 'open' && (
          <button className="icon-btn primary" aria-label="Reprendre la séance" onClick={() => go({ name: 'session', id: hero.id })}>
            <Play size={18} aria-hidden="true" />
          </button>
        )}
        {hero?.kind === 'planned' && hero.item.kind === 'course' && !targets.ranToday && (
          <button className="btn sm" onClick={() => setRunning(true)}>
            <Camera size={14} aria-hidden="true" /> J’ai couru
          </button>
        )}
        {hero?.kind === 'planned' && hero.tpl && (
          <button className="icon-btn primary" aria-label="Commencer la séance" onClick={async () => go({ name: 'session', id: await startPlanned(repo, hero.item, hero.tpl!) })}>
            <Play size={18} aria-hidden="true" />
          </button>
        )}
        {hero?.kind === 'none' && (
          <button className="btn sm" onClick={() => go({ name: 'planning' })}>
            Planifier
          </button>
        )}
      </section>

      <NextStepCard repo={repo} go={go} />

      <section className={`ui-card list-row run-row ${targets.ranToday ? 'done' : ''}`} aria-label="Course">
        <button className="icon-chip accent" onClick={() => setWhy('run')} aria-label="Pourquoi cette distance">
          <Footprints size={16} aria-hidden="true" />
        </button>
        <div className="grow">
          <p className="eyebrow">{targets.ranToday ? 'Course faite' : targets.run.value?.move === 'départ' ? 'Course · départ' : 'Prochaine course'}</p>
          <p className="row-title num">{runKm !== undefined ? `${runKm.toLocaleString('fr-BE')} km` : '—'}</p>
        </div>
        {targets.ranToday ? (
          <span className="pill num">✓ {targets.runs.filter((r) => r.day === today).reduce((n, r) => n + r.km, 0).toLocaleString('fr-BE')} km</span>
        ) : (
          <button className="btn sm" onClick={() => setRunning(true)}>
            <Camera size={14} aria-hidden="true" /> J’ai couru
          </button>
        )}
      </section>

      <div className="kpi-grid">
        <Kpi icon={<Moon size={16} aria-hidden="true" />} label="Sommeil" onClick={() => openEditor('sleepH')} value={daily?.sleepH !== undefined ? fmtHours(daily.sleepH) : '—'}>
          <div className="bars" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className={i < sleepBars ? 'on' : ''} />
            ))}
          </div>
        </Kpi>

        <Kpi
          icon={<Footprints size={16} aria-hidden="true" />}
          label="Pas"
          onClick={() => openEditor('steps')}
          value={daily?.steps !== undefined ? fmtNum(daily.steps) : '—'}
          sub={`/ ${fmtNum(STEPS_GOAL)}`}
        >
          <Meter value={(daily?.steps ?? 0) / STEPS_GOAL} />
        </Kpi>

        <Kpi
          icon={<Droplet size={16} aria-hidden="true" />}
          label="Eau"
          value={`${((daily?.waterMl ?? 0) / 1000).toLocaleString('fr-BE', { maximumFractionDigits: 2 })} L`}
          sub={waterL ? `/ ${(waterL / 1000).toLocaleString('fr-BE')} L` : undefined}
          onLabel={() => setWhy('water')}
        >
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button className="icon-btn" aria-label="Retirer 250 ml" onClick={() => saveDaily(addWater(daily, -250, Date.now()))}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <button className="icon-btn primary" aria-label="Ajouter 250 ml" onClick={() => saveDaily(addWater(daily, 250, Date.now()))}>
              <Plus size={16} aria-hidden="true" />
            </button>
            <button className="pill" onClick={() => setWhy('water')} aria-label="Pourquoi cette cible d’eau">
              {waterL ? `${Math.min(100, Math.round(((daily?.waterMl ?? 0) / waterL) * 100))} %` : '?'}
            </button>
          </div>
        </Kpi>

        <Kpi
          icon={<Flame size={16} aria-hidden="true" />}
          label="Calories"
          onClick={() => setWhy('kcal')}
          value={kcal ? fmtNum(kcal.kcal) : '—'}
          sub={kcal ? 'kcal cible' : undefined}
        >
          <div className="row" style={{ gap: 6 }}>
            {kcal ? <span className="pill num">P {kcal.proteinG} g</span> : <span className="pill">calculer ?</span>}
            {daily?.activeKcal !== undefined && (
              <span className="pill num">
                <Watch size={12} aria-hidden="true" /> {fmtNum(daily.activeKcal)}
              </span>
            )}
          </div>
        </Kpi>
      </div>

      <button className="ui-card list-row" onClick={() => setWeighing(true)} aria-label="Poids à jeun : ajouter une pesée">
        <span className="icon-chip">
          <Scale size={16} aria-hidden="true" />
        </span>
        <div className="grow">
          <p className="eyebrow">Poids à jeun</p>
          <p className="kpi-value num" style={{ margin: 0 }}>
            {lastWeight ? lastWeight.kg.toLocaleString('fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
            <span className="kpi-sub"> kg</span>
          </p>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            {weightTrend.deltaKg !== undefined && (
              <span className="pill num">
                {weightTrend.deltaKg > 0 ? '↗ +' : weightTrend.deltaKg < 0 ? '↘ ' : '→ '}
                {weightTrend.deltaKg.toLocaleString('fr-BE')} kg/7 j
              </span>
            )}
            {lastWeight && lastWeight.day !== today && (
              <span className="pill">{new Date(`${lastWeight.day}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
            )}
            {!lastWeight && <span className="pill">+ pesée</span>}
          </div>
        </div>
        <Spark days={weight.days} />
      </button>

      <button className="ui-card list-row" onClick={() => go({ name: 'arc' })} aria-label="Statut Winter Arc">
        <span className="icon-chip">
          <Mountain size={16} aria-hidden="true" />
        </span>
        <div className="grow">
          <p className="eyebrow">Winter Arc</p>
          <p className="row-title num">{winter.day ? `Jour ${winter.day}/${winter.total}` : `Départ dans ${winter.daysLeft ?? 0} j`}</p>
        </div>
        <span className="pill">Voir</span>
      </button>

      <button className="ui-card list-row" onClick={() => go({ name: 'settings' })} aria-label="Objectif">
        <span className="icon-chip">
          <Target size={16} aria-hidden="true" />
        </span>
        <span className="grow row-title">{goal?.main ? GOAL_LABELS[goal.main] : 'Objectif à définir'}</span>
        {goal?.targetDate && <span className="pill num">J−{Math.max(0, daysUntil(today, goal.targetDate))}</span>}
      </button>

      <div className="kpi-grid">
        <Kpi icon={<Trophy size={16} aria-hidden="true" />} label={challengeOn ? 'Objectifs' : `Objectifs · J−${Math.max(0, daysUntil(today, NOVEMBER_2026.start))}`} onClick={() => setSheet(true)} value={`${habitsDone}/${NOVEMBER_2026.daily.length}`}>
          <div className="segments" aria-hidden="true">
            {NOVEMBER_2026.daily.map((h, i) => (
              <span key={h.id} className={i < habitsDone ? 'on' : ''} />
            ))}
          </div>
        </Kpi>
        <Kpi
          icon={<BookOpen size={16} aria-hidden="true" />}
          label={reading.book ? reading.book.title : 'Lecture'}
          onClick={() => go({ name: 'reading' })}
          value={pageNow !== undefined ? `p. ${pageNow}` : '—'}
          sub={daily?.readPages ? `+${daily.readPages} auj.` : undefined}
        >
          <Meter value={(daily?.readPages ?? 0) / DAILY_PAGES} />
        </Kpi>
      </div>

      <WhyModal
        open={why === 'water'}
        onClose={() => setWhy(null)}
        title="Eau"
        c={targets.water}
        profileFields={['poids']}
        onComplete={() => {
          setWhy(null);
          setWeighing(true);
        }}
        result={waterL ? <>{(waterL / 1000).toLocaleString('fr-BE')} <small>L</small></> : undefined}
      />
      <WhyModal open={why === 'run'} onClose={() => setWhy(null)} title="Course" c={targets.run} result={runKm !== undefined ? <>{runKm.toLocaleString('fr-BE')} <small>km</small></> : undefined} />
      <WhyModal
        open={why === 'kcal'}
        onClose={() => setWhy(null)}
        title="Calories"
        c={targets.calories}
        profileFields={['âge', 'taille', 'poids']}
        onComplete={() => go({ name: 'onboarding', step: 'body' })}
        result={kcal ? <>{fmtNum(kcal.kcal)} <small>kcal</small> <span className="pill num">P {kcal.proteinG} g</span></> : undefined}
      >
        <section className={`why-card ${targets.sex ? '' : 'need'}`}>
          <span className="why-label">Formule</span>
          <div className="seg2" role="group" aria-label="Formule de calcul">
            {(['homme', 'femme'] as const).map((x) => (
              <button key={x} aria-pressed={targets.sex === x} onClick={() => targets.setSex(x)}>
                {x === 'homme' ? 'Homme' : 'Femme'}
              </button>
            ))}
          </div>
        </section>
        <button
          className="why-row"
          onClick={() => {
            setWhy(null);
            openEditor('activeKcal');
          }}
        >
          <span className="icon-chip sm">
            <Watch size={14} aria-hidden="true" />
          </span>
          <span className="grow">Calories actives · montre</span>
          <span className="pill num">{daily?.activeKcal !== undefined ? fmtNum(daily.activeKcal) : '—'}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </WhyModal>
      <RunModal open={running} onClose={() => setRunning(false)} repo={repo} t={targets} onProved={() => habits.setCheck('run', true)} />

      <HabitsSheet open={sheet} onClose={() => setSheet(false)} h={habits} onReading={() => go({ name: 'reading' })} />

      <WeightModal
        open={weighing}
        onClose={() => setWeighing(false)}
        last={lastWeight?.kg}
        onSave={async (kg, status, day, fasting) => {
          await weight.add(kg, status, day, fasting);
          setWeighing(false);
        }}
      />

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? EDIT_META[editing].title : ''}>
        {editing && (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>{EDIT_META[editing].hint}</p>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                aria-label={EDIT_META[editing].title}
                type="text"
                inputMode="decimal"
                min={0}
                step={EDIT_META[editing].step}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <span className="muted">{EDIT_META[editing].unit}</span>
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => saveEditor()}>
                Enregistrer
              </button>
              <button className="btn ghost" onClick={() => saveEditor(true)}>
                Effacer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
