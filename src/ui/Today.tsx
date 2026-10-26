// Accueil : tableau de bord du jour. Peu de texte, des chiffres et des icônes.
// Chaque valeur vient de données enregistrées ; « — » signifie inconnu, jamais zéro.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, Droplet, Flame, Footprints, Minus, Moon, Play, Plus, Target, Trophy } from 'lucide-react';
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

function Tile({ icon, label, onClick, children }: { icon: ReactNode; label: string; onClick?: () => void; children: ReactNode }) {
  const content = (
    <>
      <span className="tile-label">
        {icon}
        {label}
      </span>
      {children}
    </>
  );
  return onClick ? (
    <button className="tile" onClick={onClick} aria-label={label}>
      {content}
    </button>
  ) : (
    <div className="tile">{content}</div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * Math.min(1, value)} ${c}`} transform="rotate(-90 34 34)" />
    </svg>
  );
}

const fmtNum = (n: number) => n.toLocaleString('fr-BE');

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
  const { entries } = useChallengeEntries(repo);

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
      <p className="muted" style={{ margin: 0, textTransform: 'capitalize' }}>
        {new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(Date.now())}
      </p>
      <h1 style={{ marginBottom: 16 }}>{night.phase === 'matin' ? 'Bonjour ☀️' : night.phase === 'soir' ? 'Bonsoir 🌇' : night.phase === 'nuit' ? 'Bonne nuit 🌙' : 'Aujourd’hui'}</h1>

      {night.pastBed && night.bedtime && (
        <div className="bed-banner" role="status">
          <span className="bed-moon" aria-hidden="true">🌙</span>
          <div>
            <div style={{ fontWeight: 700 }}>Au lit, Hmidou.</div>
            <div className="num" style={{ fontSize: '0.85rem', opacity: 0.85 }}>
              {night.now.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })} · coucher prévu {night.bedtime}
            </div>
          </div>
        </div>
      )}

      {onboardingStep !== null && (
        <button className="item" onClick={() => go({ name: 'onboarding' })}>
          <ClipboardList size={22} aria-hidden="true" />
          <div className="grow">
            <div className="name">Terminer la configuration</div>
            <div className="meta">
              {Math.min(onboardingStep + 1, STEPS.length + 1)} / {STEPS.length + 1}
            </div>
          </div>
        </button>
      )}

      <section className="hero-card" aria-label="Séance du jour">
        {hero?.kind === 'open' && (
          <>
            <span className="tile-label">En cours</span>
            <div className="hero-title">{hero.title}</div>
            <div className="hero-meta num">
              {hero.done}/{hero.total} séries
            </div>
            <button className="btn primary big" onClick={() => go({ name: 'session', id: hero.id })}>
              <Play size={20} aria-hidden="true" /> Reprendre
            </button>
          </>
        )}
        {hero?.kind === 'planned' && (
          <>
            <span className="tile-label num">
              {hero.item.start}
              {hero.item.adapted ? ' · adaptée' : ''}
            </span>
            <div className="hero-title">{hero.item.title}</div>
            {hero.tpl ? (
              <>
                <div className="hero-meta num">
                  {(hero.item.adapted?.lines ?? hero.tpl.lines).length} exercices · {(hero.item.adapted?.lines ?? hero.tpl.lines).reduce((n, l) => n + l.sets, 0)} séries · ≈{' '}
                  {hero.item.adapted?.estimatedMin ?? estimateMinutes(hero.tpl.lines)} min
                </div>
                <button className="btn primary big" onClick={async () => go({ name: 'session', id: await startPlanned(repo, hero.item, hero.tpl!) })}>
                  <Play size={20} aria-hidden="true" /> Commencer
                </button>
              </>
            ) : (
              <p className="muted">Modèle de séance introuvable.</p>
            )}
          </>
        )}
        {hero?.kind === 'none' && (
          <>
            <span className="tile-label">Séance du jour</span>
            <div className="hero-title">Rien de prévu</div>
            <button className="btn big" onClick={() => go({ name: 'planning' })}>
              Planifier
            </button>
          </>
        )}
      </section>

      <div className="tiles">
        <Tile icon={<Moon size={16} aria-hidden="true" />} label="Sommeil" onClick={() => openEditor('sleepH')}>
          <div className="tile-value num">
            {daily?.sleepH !== undefined ? `${Math.floor(daily.sleepH)}h${String(Math.round((daily.sleepH % 1) * 60)).padStart(2, '0')}` : '—'}
          </div>
          <div className="bars" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className={i < sleepBars ? 'on' : ''} />
            ))}
          </div>
        </Tile>

        <Tile icon={<Footprints size={16} aria-hidden="true" />} label="Pas" onClick={() => openEditor('steps')}>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <Ring value={(daily?.steps ?? 0) / STEPS_GOAL} />
            <div>
              <div className="tile-value num" style={{ fontSize: '1.25rem' }}>
                {daily?.steps !== undefined ? fmtNum(daily.steps) : '—'}
              </div>
              <div className="muted num" style={{ fontSize: '0.75rem' }}>/ {fmtNum(STEPS_GOAL)}</div>
            </div>
          </div>
        </Tile>

        <Tile icon={<Droplet size={16} aria-hidden="true" />} label="Eau">
          <button className="tile-hit" onClick={() => openEditor('waterGoal')} aria-label="Modifier l’objectif d’eau">
            <span className="tile-value num">{((daily?.waterMl ?? 0) / 1000).toLocaleString('fr-BE', { maximumFractionDigits: 2 })} L</span>
            <span className="muted num" style={{ fontSize: '0.75rem' }}>
              {' '}
              / {waterGoal ? `${(waterGoal / 1000).toLocaleString('fr-BE')} L` : 'objectif ?'}
            </span>
          </button>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button className="btn icon" aria-label="Retirer 250 ml" onClick={() => saveDaily(addWater(daily, -250, Date.now()))}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <button className="btn primary icon" aria-label="Ajouter 250 ml" onClick={() => saveDaily(addWater(daily, 250, Date.now()))}>
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
        </Tile>

        <Tile icon={<Flame size={16} aria-hidden="true" />} label="Calories actives" onClick={() => openEditor('activeKcal')}>
          <div className="tile-value num">{daily?.activeKcal !== undefined ? fmtNum(daily.activeKcal) : '—'}</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>kcal · montre</div>
        </Tile>

        <Tile icon={<Target size={16} aria-hidden="true" />} label="Objectif" onClick={() => go({ name: 'settings' })}>
          <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{goal?.main ? GOAL_LABELS[goal.main] : '—'}</div>
          {goal?.targetDate && <div className="muted num" style={{ fontSize: '0.8rem' }}>J−{Math.max(0, daysUntil(today, goal.targetDate))}</div>}
        </Tile>

        <Tile icon={<Trophy size={16} aria-hidden="true" />} label="Défi" onClick={() => go({ name: 'challenge' })}>
          <div className="tile-value num">
            {challengeOn ? `${habitsDone}/${NOVEMBER_2026.daily.length}` : `J−${Math.max(0, daysUntil(today, NOVEMBER_2026.start))}`}
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>{challengeOn ? 'habitudes' : 'novembre'}</div>
        </Tile>
      </div>

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
