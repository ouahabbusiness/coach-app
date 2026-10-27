// Carte « Course » : distance du jour, lancer la course guidée ou saisir une course faite.
// Elle vit dans la page Entraînement, pas sur l'accueil.

import { useState } from 'react';
import { Footprints, Pencil, Play } from 'lucide-react';
import { localDay } from '../engine/derive';
import type { Repository } from '../storage/db';
import { useDayHabits } from './Habits';
import { RunModal, WhyModal, useTargets } from './Targets';
import { deviceTimeZone } from './support';
import { useWeightLog } from './Weight';
import type { Route } from './App';

export function RunCard({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const today = localDay(Date.now(), deviceTimeZone());
  const habits = useDayHabits(repo, today);
  const weight = useWeightLog(repo);
  const targets = useTargets(repo, weight.days, 0);
  const [why, setWhy] = useState(false);
  const [running, setRunning] = useState(false);
  const runKm = targets.run.value?.km;
  const kmToday = targets.runs.filter((r) => r.day === today).reduce((n, r) => n + r.km, 0);
  return (
    <>
      <section className={`ui-card list-row run-row ${targets.ranToday ? 'done' : ''}`} aria-label="Course">
        <button className="icon-chip accent" onClick={() => setWhy(true)} aria-label="Pourquoi cette distance">
          <Footprints size={16} aria-hidden="true" />
        </button>
        <div className="grow">
          <p className="eyebrow">{targets.ranToday ? 'Course faite' : targets.run.value?.move === 'départ' ? 'Course · départ' : 'Prochaine course'}</p>
          <p className="row-title num">{runKm !== undefined ? `${runKm.toLocaleString('fr-BE')} km` : '—'}</p>
        </div>
        {targets.ranToday ? (
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <span className="pill num">✓ {kmToday.toLocaleString('fr-BE')} km</span>
            <button className="icon-btn primary" aria-label="Lancer une autre course" onClick={() => go({ name: 'run' })}>
              <Play size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button className="btn sm ghost" onClick={() => setRunning(true)} aria-label="Saisir une course faite">
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button className="btn sm primary" onClick={() => go({ name: 'run' })}>
              <Play size={14} aria-hidden="true" /> Go
            </button>
          </div>
        )}
      </section>
      <WhyModal open={why} onClose={() => setWhy(false)} title="Course" c={targets.run} result={runKm !== undefined ? <>{runKm.toLocaleString('fr-BE')} <small>km</small></> : undefined} />
      <RunModal open={running} onClose={() => setRunning(false)} repo={repo} t={targets} onProved={() => habits.setCheck('run', true)} />
    </>
  );
}
