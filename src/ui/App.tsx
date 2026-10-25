import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChartLine, House, MessageSquare, Settings as SettingsIcon, Utensils } from 'lucide-react';
import { CoachDb, Repository, type SessionSummaryRow } from '../storage/db';
import { NotBuilt, OutcomeBadge } from './common';
import { Program } from './Program';
import { SessionScreen } from './SessionScreen';
import { Settings } from './Settings';
import { Challenge } from './Challenge';
import { Summary } from './Summary';
import { Today } from './Today';
import { CharacterProvider } from './character';
import { deviceTimeZone, fmtDateTime } from './support';

export type Route =
  | { name: 'today' }
  | { name: 'program' }
  | { name: 'nutrition' }
  | { name: 'progress' }
  | { name: 'coach' }
  | { name: 'settings' }
  | { name: 'challenge' }
  | { name: 'session'; id: string }
  | { name: 'summary'; id: string };

const TABS = [
  { name: 'today', label: 'Aujourd’hui', Icon: House },
  { name: 'program', label: 'Programme', Icon: CalendarDays },
  { name: 'nutrition', label: 'Nutrition', Icon: Utensils },
  { name: 'progress', label: 'Progrès', Icon: ChartLine },
] as const;

export function App() {
  const repo = useMemo(() => new Repository(new CoachDb()), []);
  const [route, setRoute] = useState<Route>({ name: 'today' });
  const go = useCallback((r: Route) => {
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  // Au lancement, une séance restée ouverte (fermeture, plantage) est reprise directement.
  useEffect(() => {
    repo.openSession().then((open) => open && setRoute({ name: 'session', id: open.id }));
  }, [repo]);

  return <CharacterProvider repo={repo}>{render()}</CharacterProvider>;

  function render() {
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
      <main className="content">
        {route.name === 'today' && <Today repo={repo} go={go} />}
        {route.name === 'program' && <Program repo={repo} go={go} />}
        {route.name === 'nutrition' && (
          <>
            <h1>Nutrition</h1>
            <NotBuilt title="Journal alimentaire" phase="phase 2">
              Une journée non renseignée ne sera jamais comptée comme zéro calorie.
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
        {route.name === 'settings' && <Settings repo={repo} onBack={() => go({ name: 'today' })} />}
        {route.name === 'challenge' && <Challenge repo={repo} onBack={() => go({ name: 'today' })} />}
        {route.name === 'summary' && <Summary repo={repo} sessionId={route.id} onBack={() => go({ name: 'progress' })} />}
      </main>
      <nav className="navwrap" aria-label="Navigation principale">
        <div className="tabbar">
          {TABS.map(({ name, label, Icon }) => (
            <button key={name} aria-current={route.name === name ? 'page' : undefined} onClick={() => go({ name })}>
              <Icon size={20} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <button className="fab" aria-label="Coach" aria-current={route.name === 'coach' ? 'page' : undefined} onClick={() => go({ name: 'coach' })}>
          <MessageSquare size={24} aria-hidden="true" />
        </button>
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
        Ils seront calculés seulement quand il y aura assez de séances comparables.
      </NotBuilt>
    </>
  );
}
