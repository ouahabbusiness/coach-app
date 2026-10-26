import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChartLine, House, MessageSquare, Settings as SettingsIcon, Utensils } from 'lucide-react';
import { CoachDb, Repository, type SessionSummaryRow } from '../storage/db';
import { NotBuilt, OutcomeBadge } from './common';
import { Program } from './Program';
import { SessionScreen } from './SessionScreen';
import { Settings } from './Settings';
import { Challenge } from './Challenge';
import { WeightCard } from './Weight';
import { MeasuresCard } from './Measures';
import { Onboarding } from './Onboarding';
import { Planning } from './Planning';
import { loadOnboarding } from './profileStore';
import { useDayPhase } from './useDayPhase';
import { useWinterMode, winterForced, winterInfo } from './winterArc';
import { localDay } from '../engine/derive';
import { AppBackground } from './AppBackground';
import { BootOverlay } from './BootOverlay';
import { ArcPage } from './ArcPage';
import { Reading } from './Reading';
import { CoachHome, CoachProgram } from './CoachProgram';
import { NutritionPage, NutritionSetup } from './Nutrition';
import { AgendaPage } from './WeekSetup';
import { KitchenPage } from './Kitchen';
import { GearPage } from './Gear';
import { LiveRun } from './LiveRun';
import { BackgroundProvider } from './backgrounds';
import { Summary } from './Summary';
import { Today } from './Today';
import { deviceTimeZone, fmtDateTime } from './support';

export type Route =
  | { name: 'today' }
  | { name: 'program' }
  | { name: 'nutrition' }
  | { name: 'progress' }
  | { name: 'coach' }
  | { name: 'settings' }
  | { name: 'challenge' }
  | { name: 'onboarding'; step?: string }
  | { name: 'planning' }
  | { name: 'arc' }
  | { name: 'reading' }
  | { name: 'coachProgram' }
  | { name: 'nutritionSetup' }
  | { name: 'agenda' }
  | { name: 'kitchen' }
  | { name: 'gear' }
  | { name: 'run' }
  | { name: 'session'; id: string }
  | { name: 'summary'; id: string };

const TABS = [
  { name: 'today', label: 'Aujourd’hui', Icon: House },
  { name: 'program', label: 'Programme', Icon: CalendarDays },
  { name: 'nutrition', label: 'Nutrition', Icon: Utensils },
  { name: 'progress', label: 'Progrès', Icon: ChartLine },
  { name: 'coach', label: 'Coach', Icon: MessageSquare },
] as const;

export function App() {
  const repo = useMemo(() => new Repository(new CoachDb()), []);
  const [route, setRoute] = useState<Route>({ name: 'today' });
  const day = useDayPhase(repo);
  // Thème du mois (Winter Arc) appliqué à toute l'app, pas seulement à l'accueil.
  const { mode: winterMode } = useWinterMode(repo);
  const winterOn = winterInfo(winterMode, localDay(Date.now(), deviceTimeZone()), winterForced()).active;
  // Zone sombre uniquement pendant l'entraînement (et sur la page Winter Arc) ; ailleurs, thème clair (bleu en novembre).
  const zone = route.name === 'session' || route.name === 'arc' || route.name === 'onboarding' || route.name === 'coachProgram' || route.name === 'nutritionSetup' || route.name === 'agenda' || route.name === 'run';
  useEffect(() => {
    if (zone) document.documentElement.dataset.theme = 'zone';
    else if (winterOn) document.documentElement.dataset.theme = 'winter';
    else delete document.documentElement.dataset.theme;
  }, [winterOn, zone]);
  const [boot, setBoot] = useState<string | null>(null);
  const go = useCallback((r: Route) => {
    // Lancement d'une séance depuis l'app : transition « Discipline Protocol ».
    setRoute((prev) => {
      if (r.name === 'session' && prev.name !== 'session') setBoot('Mission');
      return r;
    });
    window.scrollTo(0, 0);
  }, []);

  // Au lancement : une séance restée ouverte est reprise ; sinon, l'onboarding non terminé s'ouvre.
  useEffect(() => {
    (async () => {
      const open = await repo.openSession();
      if (open) return setRoute({ name: 'session', id: open.id });
      const ob = await loadOnboarding(repo);
      if (!ob.completedAt && ob.updatedAt === 0) setRoute({ name: 'onboarding' });
    })();
  }, [repo]);

  return (
    <BackgroundProvider repo={repo}>
      <AppBackground phase={day.phase} />
      {render()}
    </BackgroundProvider>
  );

  function render() {
  if (route.name === 'onboarding') return <Onboarding repo={repo} startAt={route.step} onExit={() => go({ name: 'today' })} />;

  if (route.name === 'arc') return <ArcPage repo={repo} go={go} />;
  if (route.name === 'reading') return <Reading repo={repo} go={go} />;
  if (route.name === 'coachProgram') return <CoachProgram repo={repo} go={go} />;
  if (route.name === 'nutritionSetup') return <NutritionSetup repo={repo} go={go} />;
  if (route.name === 'agenda') return <AgendaPage repo={repo} go={go} />;
  if (route.name === 'run') return <LiveRun repo={repo} go={go} />;

  if (route.name === 'session') {
    const id = route.id;
    return (
      <>
      {boot && <BootOverlay title={boot} onDone={() => setBoot(null)} />}
      <SessionScreen
        repo={repo}
        sessionId={id}
        booted={!!boot}
        onExit={() => go({ name: 'today' })}
        onSummary={() => go({ name: 'summary', id })}
      />
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span />
        <button className="round" aria-label="Réglages et données" onClick={() => go({ name: 'settings' })}>
          <SettingsIcon size={20} aria-hidden="true" />
        </button>
      </header>
      <main className="content" key={route.name}>
        {route.name === 'today' && <Today repo={repo} go={go} night={day} />}
        {route.name === 'program' && <Program repo={repo} go={go} />}
        {route.name === 'nutrition' && <NutritionPage repo={repo} go={go} />}
        {route.name === 'kitchen' && <KitchenPage repo={repo} go={go} />}
        {route.name === 'gear' && <GearPage repo={repo} go={go} />}
        {route.name === 'progress' && <Progress repo={repo} go={go} />}
        {route.name === 'coach' && <CoachHome repo={repo} go={go} />}
        {route.name === 'settings' && <Settings repo={repo} onBack={() => go({ name: 'today' })} onEditProfile={() => go({ name: 'onboarding' })} />}
        {route.name === 'challenge' && <Challenge repo={repo} onBack={() => go({ name: 'today' })} onStatus={() => go({ name: 'arc' })} onReading={() => go({ name: 'reading' })} />}
        {route.name === 'planning' && <Planning repo={repo} go={go} />}
        {route.name === 'summary' && <Summary repo={repo} sessionId={route.id} onBack={() => go({ name: 'progress' })} onHome={() => go({ name: 'today' })} />}
      </main>
      <nav className="navwrap" aria-label="Navigation principale">
        <div className="tabbar">
          {TABS.map(({ name, label, Icon }) => (
            <button
              key={name}
              aria-label={label}
              aria-current={route.name === name || (name === 'program' && route.name === 'planning') ? 'page' : undefined}
              onClick={() => go(name === 'program' ? { name: 'planning' } : { name })}
            >
              <Icon size={19} aria-hidden="true" />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
  }
}

function Progress({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [rows, setRows] = useState<SessionSummaryRow[] | null>(null);
  useEffect(() => {
    repo.listSessions().then(setRows);
  }, [repo]);
  const tz = deviceTimeZone();
  return (
    <>
      <h1>Progression</h1>
      <WeightCard repo={repo} />
      <MeasuresCard repo={repo} />
      <div className="card">
        <h2>Historique des séances</h2>
        {rows === null && <p>Chargement…</p>}
        {rows?.length === 0 && <p className="muted">Aucune séance enregistrée pour l’instant.</p>}
        <div className="stack">
          {rows?.map((r) => (
            <button
              key={r.id}
              className="btn block"
              style={{ justifyContent: 'space-between', minHeight: 64, textAlign: 'left' }}
              onClick={() => go(r.outcome === 'in_progress' ? { name: 'session', id: r.id } : { name: 'summary', id: r.id })}
            >
              <span>
                <span style={{ display: 'block' }}>{r.title}</span>
                <span className="muted" style={{ fontWeight: 400, fontSize: '0.9rem' }}>{fmtDateTime(r.startedAt, tz)}</span>
              </span>
              <OutcomeBadge outcome={r.outcome} />
            </button>
          ))}
        </div>
      </div>
      <NotBuilt title="Tendances et rapports hebdomadaires" phase="phase 1 (suite)">
      </NotBuilt>
    </>
  );
}
