import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { findVariant } from '../catalog/exercises';
import { sessionOutcome, summarizeSession, timings } from '../engine/derive';
import { project } from '../engine/session';
import type { SessionState, SetResult } from '../engine/types';
import type { Repository } from '../storage/db';
import { Notice, OutcomeBadge } from './common';
import { fmtDateTime, fmtDuration } from './support';

function cell(r: SetResult | undefined, kind: 'reps' | 'hold'): string {
  if (!r) return '—';
  const v = kind === 'reps' ? (r.reps !== undefined ? `${r.reps}` : '—') : r.seconds !== undefined ? `${r.seconds} s` : '—';
  return [v, r.loadKg !== undefined ? `${r.loadKg} kg` : '', r.rir !== undefined ? `RIR ${r.rir}` : ''].filter(Boolean).join(' · ');
}

/** Bilan après séance : uniquement des valeurs calculées depuis le journal. */
export function Summary({ repo, sessionId, onBack }: { repo: Repository; sessionId: string; onBack: () => void }) {
  const [st, setSt] = useState<SessionState | null | undefined>(undefined);
  useEffect(() => {
    repo.sessionEvents(sessionId).then((ev) => setSt(project(ev)));
  }, [repo, sessionId]);

  if (st === undefined) return <p>Chargement…</p>;
  if (st === null) return <p>Séance introuvable.</p>;

  const t = timings(st, st.endedAt ?? Date.now());
  const groups = summarizeSession(st);
  const missing = groups.reduce((n, g) => n + g.missingResults, 0);
  const outcome = sessionOutcome(st);

  return (
    <>
      <button className="btn ghost" onClick={onBack}>
        <ChevronLeft size={20} aria-hidden="true" /> Retour
      </button>
      <h1 style={{ marginTop: 12 }}>Bilan · {st.plan.title}</h1>
      <div className="spread" style={{ marginBottom: 16 }}>
        <span className="muted">{fmtDateTime(st.startedAt, st.timeZone)}</span>
        <OutcomeBadge outcome={outcome} />
      </div>

      {outcome === 'stopped_for_safety' && (
        <Notice tone="danger">
          Séance arrêtée suite à une douleur signalée. L’application ne pose pas de diagnostic ; demande l’avis d’un professionnel de
          santé si la douleur persiste ou t’inquiète.
        </Notice>
      )}
      {missing > 0 && (
        <div style={{ margin: '12px 0' }}>
          <Notice tone="warn">
            {missing} série{missing > 1 ? 's' : ''} réalisée{missing > 1 ? 's' : ''} sans résultat saisi : valeur inconnue, non comptée comme zéro.
          </Notice>
        </div>
      )}

      <div className="card">
        <h3>Temps</h3>
        <div className="grid2 num" style={{ fontSize: '1.1rem' }}>
          <div>Total <strong>{fmtDuration(t.totalMs)}</strong></div>
          <div>Actif <strong>{fmtDuration(t.activeMs)}</strong></div>
          <div>Repos <strong>{fmtDuration(t.restMs)}</strong></div>
          <div>Interruptions <strong>{fmtDuration(t.interruptedMs)}</strong></div>
        </div>
      </div>

      {groups.map((g) => {
        const name = findVariant(g.variantId)?.variant.name ?? g.variantId;
        return (
          <div key={g.variantId} className="card">
            <h3>{name}</h3>
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">Série</th>
                  <th scope="col">Prévu</th>
                  <th scope="col">Réalisé</th>
                </tr>
              </thead>
              <tbody>
                {g.sets.map((s, i) => (
                  <tr key={s.plannedSetId}>
                    <td>{i + 1}</td>
                    <td>{s.planned.kind === 'reps' ? s.planned.targetReps : `${s.planned.targetSeconds} s`}</td>
                    <td>{s.status === 'skipped' ? 'Passée' : s.status === 'pending' ? 'Non faite' : cell(s.actual, s.planned.kind)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {st.pain.length > 0 && (
        <div className="card">
          <h3>Douleurs ou gênes signalées</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {st.pain.map((p) => (
              <li key={p.eventId}>
                {p.location} · {p.intensity}/10 · {p.stop ? 'arrêt' : 'poursuite'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted">Aucune analyse de progression n’est encore calculée : il faut plusieurs séances comparables.</p>
    </>
  );
}
