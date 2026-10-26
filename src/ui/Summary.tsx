// Fin de séance : l'essentiel en 4 tuiles, le détail repliable.
// Durée et séries viennent du journal ; calories et fréquence cardiaque sont déclarées (lues sur la montre).

import { useEffect, useState } from 'react';
import { PostFeedback } from './PostFeedback';
import { ChevronLeft, Dumbbell, Flame, Heart, Timer, TriangleAlert, Trophy } from 'lucide-react';
import { findVariant } from '../catalog/exercises';
import { NOVEMBER_2026, habitStatus } from '../engine/challenge';
import { challengeValues, dailyKey, type DailyMetrics } from '../engine/daily';
import { currentResult, localDay, sessionOutcome, summarizeSession, timings } from '../engine/derive';
import { project } from '../engine/session';
import type { SessionState, SetResult } from '../engine/types';
import type { Repository } from '../storage/db';
import { Modal, Notice, OutcomeBadge } from './common';
import { useChallengeEntries } from './Challenge';
import { fmtDateTime, fmtDuration } from './support';

interface SessionExtra {
  activeKcal?: number;
  avgBpm?: number;
}
const extraKey = (id: string) => `session.extra.${id}`;

function cell(r: SetResult | undefined, kind: 'reps' | 'hold'): string {
  if (!r) return '—';
  const v = kind === 'reps' ? (r.reps !== undefined ? `${r.reps}` : '—') : r.seconds !== undefined ? `${r.seconds} s` : '—';
  return [v, r.loadKg !== undefined ? `${r.loadKg} kg` : '', r.rir !== undefined ? `RIR ${r.rir}` : ''].filter(Boolean).join(' · ');
}

export function Summary({ repo, sessionId, onBack, onHome }: { repo: Repository; sessionId: string; onBack: () => void; onHome: () => void }) {
  const [st, setSt] = useState<SessionState | null | undefined>(undefined);
  const [extra, setExtra] = useState<SessionExtra>({});
  const [daily, setDaily] = useState<DailyMetrics | undefined>();
  const [editing, setEditing] = useState<keyof SessionExtra | null>(null);
  const [draft, setDraft] = useState('');
  const { entries } = useChallengeEntries(repo);

  useEffect(() => {
    repo.sessionEvents(sessionId).then((ev) => {
      const s = project(ev);
      setSt(s);
      if (s) repo.getKv<DailyMetrics>(dailyKey(localDay(s.startedAt, s.timeZone))).then(setDaily);
    });
    repo.getKv<SessionExtra>(extraKey(sessionId)).then((e) => e && setExtra(e));
  }, [repo, sessionId]);

  if (st === undefined) return <p>Chargement…</p>;
  if (st === null) return <p>Séance introuvable.</p>;

  const t = timings(st, st.endedAt ?? Date.now());
  const groups = summarizeSession(st);
  const missing = groups.reduce((n, g) => n + g.missingResults, 0);
  const outcome = sessionOutcome(st);
  const done = st.sets.filter((s) => s.status === 'done').length;
  const reps = st.sets.reduce((n, s) => n + (s.status === 'done' ? currentResult(s)?.reps ?? 0 : 0), 0);
  const day = localDay(st.startedAt, st.timeZone);
  const challengeDay = day >= NOVEMBER_2026.start && day <= NOVEMBER_2026.end;
  const habitsDone = NOVEMBER_2026.daily.filter(
    (h) => habitStatus(h, { values: challengeValues(entries[day]?.values, daily), excused: entries[day]?.excused, updatedAt: 0 }) === 'done',
  ).length;

  const safety = outcome === 'stopped_for_safety';
  const title = safety ? 'Séance arrêtée' : outcome === 'completed' ? 'Séance terminée !' : outcome === 'partial' ? 'Séance partielle' : 'Séance en cours';

  const saveExtra = async (clear = false) => {
    if (!editing) return;
    const v = clear || draft.trim() === '' ? undefined : Number(draft.replace(',', '.'));
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) return;
    const next = { ...extra, [editing]: v };
    await repo.setKv(extraKey(sessionId), next);
    setExtra(next);
    setEditing(null);
  };

  return (
    <div>
      <button className="round" aria-label="Retour" onClick={onBack}>
        <ChevronLeft size={20} aria-hidden="true" />
      </button>

      <div style={{ textAlign: 'center', margin: '8px 0 20px' }}>
        <div className={`done-icon ${safety ? 'danger' : ''}`} aria-hidden="true">
          {safety ? <TriangleAlert size={34} /> : <Trophy size={34} />}
        </div>
        <h1 style={{ margin: '12px 0 4px' }}>{title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {st.plan.title} · {fmtDateTime(st.startedAt, st.timeZone)}
        </p>
      </div>

      {safety && (
        <Notice tone="danger">Arrêt suite à une douleur signalée. Pas de diagnostic : demande un avis médical si elle persiste.</Notice>
      )}

      <PostFeedback repo={repo} st={st} />

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">
            <Timer size={16} aria-hidden="true" /> durée
          </span>
          <div className="tile-value num">{fmtDuration(t.totalMs)}</div>
        </div>
        <button
          className="tile"
          aria-label="Calories actives (montre)"
          onClick={() => {
            setDraft(extra.activeKcal?.toString() ?? '');
            setEditing('activeKcal');
          }}
        >
          <span className="tile-label">
            <Flame size={16} aria-hidden="true" /> kcal · montre
          </span>
          <div className="tile-value num">{extra.activeKcal ?? '—'}</div>
        </button>
        <button
          className="tile"
          aria-label="Fréquence cardiaque moyenne (montre)"
          onClick={() => {
            setDraft(extra.avgBpm?.toString() ?? '');
            setEditing('avgBpm');
          }}
        >
          <span className="tile-label">
            <Heart size={16} aria-hidden="true" /> bpm moyen
          </span>
          <div className="tile-value num">{extra.avgBpm ?? '—'}</div>
        </button>
        <div className="tile">
          <span className="tile-label">
            <Dumbbell size={16} aria-hidden="true" /> séries
          </span>
          <div className="tile-value num">
            {done}/{st.sets.length}
          </div>
          {reps > 0 && <div className="muted num" style={{ fontSize: '0.75rem' }}>{reps} rép. saisies</div>}
        </div>
      </div>

      {challengeDay && (
        <div className="hero-card" style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Routine du jour</div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              {habitsDone}/{NOVEMBER_2026.daily.length} habitudes
            </div>
          </div>
          <span className="num" style={{ fontWeight: 700, color: 'var(--accent)' }}>{Math.round((habitsDone / NOVEMBER_2026.daily.length) * 100)} %</span>
        </div>
      )}

      {missing > 0 && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="warn">
            {missing} série{missing > 1 ? 's' : ''} sans résultat : inconnu, pas zéro.
          </Notice>
        </div>
      )}

      <details className="card" style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
          Détail <OutcomeBadge outcome={outcome} />
        </summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="muted num" style={{ fontSize: '0.9rem' }}>
            Actif {fmtDuration(t.activeMs)} · repos {fmtDuration(t.restMs)} · interruptions {fmtDuration(t.interruptedMs)}
          </div>
          {groups.map((g) => (
            <div key={g.variantId}>
              <strong>{findVariant(g.variantId)?.variant.name ?? g.variantId}</strong>
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
          ))}
          {st.pain.length > 0 && (
            <div>
              <strong>Douleurs signalées</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {st.pain.map((p) => (
                  <li key={p.eventId}>
                    {p.location} · {p.intensity}/10 · {p.stop ? 'arrêt' : 'poursuite'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      <button className="btn primary big" style={{ marginTop: 16 }} onClick={onHome}>
        Retour à l’accueil
      </button>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'avgBpm' ? 'Fréquence cardiaque moyenne' : 'Calories actives'}>
        {editing && (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Valeur lue sur ta montre pour cette séance.</p>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input aria-label="Valeur" type="text" inputMode="decimal" min={0} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <span className="muted">{editing === 'avgBpm' ? 'bpm' : 'kcal'}</span>
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => saveExtra()}>
                Enregistrer
              </button>
              <button className="btn ghost" onClick={() => saveExtra(true)}>
                Effacer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
