import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChartLine, House, MessageSquare, Settings as SettingsIcon, Utensils } from 'lucide-react';
import { CoachDb, Repository, type SessionSummaryRow } from '../storage/db';
import { NotBuilt, OutcomeBadge } from './common';
import { Program } from './Program';
import { SessionScreen } from './SessionScreen';
import { Settings } from './Settings';
import { Challenge } from './Challenge';
import { WeightCard } from './Weight';
import { Onboarding } from './Onboarding';
import { Planning } from './Planning';
import { loadOnboarding } from './profileStore';
import { useDayPhase } from './useDayPhase';
import { AppBackground } from './AppBackground';
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
  | { name: 'onboarding' }
  | { name: 'planning' }
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
  const go = useCallback((r: Route) => {
    setRoute(r);
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
  if (route.name === 'onboarding') return <Onboarding repo={repo} onExit={() => go({ name: 'today' })} />;

  if (route.name === 'session') {
    const id = route.id;
    return (
      <SessionScreen
        repo={repo}
        sessionId={id}
        onExit={() => go({ name: 'today' })}
        onSummary={() => go({ name: 'summary', id })}
      />
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
        {route.name === 'nutrition' && (
          <>
            <h1>Nutrition</h1>
            <NotBuilt title="Journal alimentaire" phase="phase 2">
            </NotBuilt>
          </>
        )}
        {route.name === 'progress' && <Progress repo={repo} go={go} />}
        {route.name === 'coach' && (
          <>
            <h1>Coach</h1>
            <NotBuilt title="Coach et ajustements expliqués" phase="phase 4">
              Les séances et les chronos fonctionnent sans lui.
            </NotBuilt>
          </>
        )}
        {route.name === 'settings' && <Settings repo={repo} onBack={() => go({ name: 'today' })} onEditProfile={() => go({ name: 'onboarding' })} />}
        {route.name === 'challenge' && <Challenge repo={repo} onBack={() => go({ name: 'today' })} />}
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
