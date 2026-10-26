// Accueil : tableau de bord du jour. Peu de texte, des chiffres et des icônes.
// Chaque valeur vient de données enregistrées ; « — » signifie inconnu, jamais zéro.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, Droplet, Dumbbell, Flame, Footprints, Minus, Moon, Play, Plus, Scale, Target, Trophy } from 'lucide-react';
import { trend, type WeighIn } from '../engine/weight';
import { useWeightLog, WeightModal } from './Weight';
import { NOVEMBER_2026, habitStatus, weekStart } from '../engine/challenge';
import { addWater, challengeValues, dailyKey, daysUntil, type DailyMetrics } from '../engine/daily';
import { localDay } from '../engine/derive';
import { estimateMinutes } from '../engine/disruption';
import { itemStatus, toMin, type PlannedItem } from '../engine/planning';
import { GOAL_LABELS, type GoalVersion } from '../engine/profile';
import { project } from '../engine/session';
import type { Repository } from '../storage/db';
import { Modal } from './common';
import { useChallengeEntries } from './Challenge';
import { STEPS } from './Onboarding';
import { loadPlanning, startPlanned } from './Planning';
import { loadGoals, loadOnboarding } from './profileStore';
import { deviceTimeZone } from './support';
import { loadTemplates, type SessionTemplate } from './templates';
import type { Route } from './App';

const WATER_GOAL_KEY = 'settings.waterGoalMl';
const STEPS_GOAL = 10000; // objectif du défi de novembre (choisi par Hmidou)

type Field = 'sleepH' | 'steps' | 'activeKcal' | 'waterGoal';

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
  waterGoal: { title: 'Objectif eau', unit: 'L', hint: 'Ton objectif personnel.', step: '0.25' },
};

type Hero =
  | { kind: 'open'; id: string; title: string; done: number; total: number }
  | { kind: 'planned'; item: PlannedItem; tpl?: SessionTemplate }
  | { kind: 'none' };

export function Today({ repo, go, night }: { repo: Repository; go: (r: Route) => void; night: { phase: string; pastBed: boolean; bedtime?: string; now: Date } }) {
  const tz = deviceTimeZone();
  const today = localDay(Date.now(), tz);
  const [daily, setDaily] = useState<DailyMetrics | undefined>();
  const [waterGoal, setWaterGoal] = useState<number | undefined>();
  const [goal, setGoal] = useState<GoalVersion | undefined>();
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [hero, setHero] = useState<Hero | null>(null);
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState('');
  const { entries, update } = useChallengeEntries(repo);
  const weight = useWeightLog(repo);
  const lastWeight = weight.days[weight.days.length - 1];
  const weightTrend = trend(weight.days, today);
  const [weighing, setWeighing] = useState(false);

  useEffect(() => {
    (async () => {
      setDaily(await repo.getKv<DailyMetrics>(dailyKey(today)));
      setWaterGoal(await repo.getKv<number>(WATER_GOAL_KEY));
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
        .filter((i) => i.weekStart === weekStart(today) && i.day === day && i.kind === 'seance')
        .filter((i) => itemStatus(i, today, today, sessions) === 'prévu')
        .sort((a, b) => toMin(a.start) - toMin(b.start))[0];
      setHero(next ? { kind: 'planned', item: next, tpl: templates.find((t) => t.id === next.templateId) } : { kind: 'none' });
    })();
  }, [repo, today, tz]);

  const saveDaily = useCallback(
    async (next: DailyMetrics) => {
      await repo.setKv(dailyKey(today), next);
      setDaily(next);
    },
    [repo, today],
  );

  const openEditor = (field: Field) => {
    const current = field === 'waterGoal' ? (waterGoal === undefined ? undefined : waterGoal / 1000) : daily?.[field];
    setDraft(current === undefined ? '' : String(current));
    setEditing(field);
  };

  const saveEditor = async (clear = false) => {
    if (!editing) return;
    const value = clear || draft.trim() === '' ? undefined : Number(draft.replace(',', '.'));
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) return;
    if (editing === 'waterGoal') {
      const ml = value === undefined ? undefined : Math.round(value * 1000);
      await repo.setKv(WATER_GOAL_KEY, ml);
      setWaterGoal(ml);
    } else {
      await saveDaily({ ...(daily ?? {}), [editing]: value, updatedAt: Date.now() });
    }
    setEditing(null);
  };

  const challengeOn = today >= NOVEMBER_2026.start && today <= NOVEMBER_2026.end;
  const dayEntry = { values: challengeValues(entries[today]?.values, daily), excused: entries[today]?.excused, updatedAt: 0 };
  const habitsDone = NOVEMBER_2026.daily.filter((h) => habitStatus(h, dayEntry) === 'done').length;
  const sleepBars = Math.min(8, Math.round(daily?.sleepH ?? 0));

  return (
    <>
      <header className="home-head">
        <p className="eyebrow">
          {new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(Date.now())}
        </p>
        <h1 className="home-title">
          {night.phase === 'matin' ? 'Bonjour' : night.phase === 'soir' ? 'Bonsoir' : night.phase === 'nuit' ? 'Bonne nuit' : 'Salut'} Hmidou
        </h1>
      </header>

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
            {hero?.kind === 'open' ? 'En cours' : hero?.kind === 'planned' ? `Séance · ${hero.item.start}${hero.item.adapted ? ' · adaptée' : ''}` : 'Séance du jour'}
          </p>
          <p className="row-title">{hero?.kind === 'open' ? hero.title : hero?.kind === 'planned' ? hero.item.title : 'Rien de prévu'}</p>
          {hero?.kind === 'open' && <p className="row-meta num">{hero.done}/{hero.total} séries</p>}
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
          sub={waterGoal ? `/ ${(waterGoal / 1000).toLocaleString('fr-BE')} L` : undefined}
          onLabel={() => openEditor('waterGoal')}
        >
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button className="icon-btn" aria-label="Retirer 250 ml" onClick={() => saveDaily(addWater(daily, -250, Date.now()))}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <button className="icon-btn primary" aria-label="Ajouter 250 ml" onClick={() => saveDaily(addWater(daily, 250, Date.now()))}>
              <Plus size={16} aria-hidden="true" />
            </button>
            {!waterGoal && (
              <button className="pill" onClick={() => openEditor('waterGoal')}>
                objectif ?
              </button>
            )}
          </div>
        </Kpi>

        <Kpi
          icon={<Flame size={16} aria-hidden="true" />}
          label="Calories"
          onClick={() => openEditor('activeKcal')}
          value={daily?.activeKcal !== undefined ? fmtNum(daily.activeKcal) : '—'}
          sub="kcal actives"
        >
          <span className="pill">⌚ montre</span>
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

      <button className="ui-card list-row" onClick={() => go({ name: 'settings' })} aria-label="Objectif">
        <span className="icon-chip">
          <Target size={16} aria-hidden="true" />
        </span>
        <span className="grow row-title">{goal?.main ? GOAL_LABELS[goal.main] : 'Objectif à définir'}</span>
        {goal?.targetDate && <span className="pill num">J−{Math.max(0, daysUntil(today, goal.targetDate))}</span>}
      </button>

      <section className="ui-card" aria-label="Habitudes du jour">
        <div className="spread">
          <button className="tile-hit eyebrow-btn" onClick={() => go({ name: 'challenge' })}>
            <Trophy size={14} aria-hidden="true" /> Habitudes{!challengeOn ? ` · défi J−${Math.max(0, daysUntil(today, NOVEMBER_2026.start))}` : ''}
          </button>
          <span className="pill num">
            {habitsDone}/{NOVEMBER_2026.daily.length}
          </span>
        </div>
        <div className="segments" aria-hidden="true">
          {NOVEMBER_2026.daily.map((h, i) => (
            <span key={h.id} className={i < habitsDone ? 'on' : ''} />
          ))}
        </div>
        <ul className="habits">
          {NOVEMBER_2026.daily.map((h) => {
            const st = habitStatus(h, dayEntry);
            const value = dayEntry.values[h.id];
            const toggle = () =>
              h.kind === 'check'
                ? update(today, (e) => {
                    const values = { ...e.values };
                    if (values[h.id] === true) delete values[h.id];
                    else values[h.id] = true;
                    return { ...e, values };
                  })
                : openEditor(h.id === 'sleep' ? 'sleepH' : 'steps');
            return (
              <li key={h.id}>
                <button className="habit" onClick={toggle} aria-pressed={st === 'done'}>
                  <span className="habit-name">{h.label}</span>
                  {h.kind === 'number' && (
                    <span className="muted num" style={{ fontSize: '0.8rem' }}>
                      {typeof value !== 'number' ? '—' : h.id === 'sleep' ? fmtHours(value) : fmtNum(value)}
                    </span>
                  )}
                  <span className={`check ${st === 'done' ? 'on' : ''}`} aria-hidden="true">
                    {st === 'done' ? '✓' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

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
