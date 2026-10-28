// Fin de séance : l'essentiel en 4 tuiles, le détail repliable.
// Durée et séries viennent du journal ; calories et fréquence cardiaque sont déclarées (lues sur la montre).

import { useEffect, useState } from 'react';
import { PostFeedback } from './PostFeedback';
import { ChevronLeft, Dumbbell, FileText, Flame, Heart, Timer, TriangleAlert, Trophy } from 'lucide-react';
import { findVariant } from '../catalog/exercises';
import { NOVEMBER_2026, habitStatus } from '../engine/challenge';
import { challengeValues, dailyKey, type DailyMetrics } from '../engine/daily';
import { currentResult, localDay, sessionOutcome, summarizeSession, timings } from '../engine/derive';
import { project } from '../engine/session';
import { FEEL_LABELS, INITIATION_SESSIONS, initiationRank, sessionReport, type FeelLevel, type SessionFeel } from '../engine/sessionReport';
import type { SessionState, SetResult } from '../engine/types';
import type { Repository } from '../storage/db';
import { Help, Modal, Notice, OutcomeBadge } from './common';
import { SessionJointFeedback } from './JointFeedback';
import { useChallengeEntries } from './Challenge';
import { fmtDateTime, fmtDuration } from './support';
import { useSession } from './useSession';

interface SessionExtra {
  activeKcal?: number;
  avgBpm?: number;
}
const extraKey = (id: string) => `session.extra.${id}`;
const feelKey = (id: string) => `session.feel.${id}`;

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
  const { send } = useSession(repo, sessionId);
  const [fixing, setFixing] = useState<{ id: string; name: string; load?: number } | null>(null);
  const [fixReps, setFixReps] = useState('');
  const [fixKg, setFixKg] = useState('');
  const [fixRir, setFixRir] = useState<number | undefined>();
  const [fixError, setFixError] = useState<string | null>(null);
  const [feel, setFeel] = useState<SessionFeel | undefined>();
  const [note, setNote] = useState('');
  const [initiation, setInitiation] = useState<number | undefined>();
  const [reportOpen, setReportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    repo.sessionEvents(sessionId).then((ev) => {
      const s = project(ev);
      setSt(s);
      if (s) repo.getKv<DailyMetrics>(dailyKey(localDay(s.startedAt, s.timeZone))).then(setDaily);
    });
    repo.getKv<SessionExtra>(extraKey(sessionId)).then((e) => e && setExtra(e));
    repo.getKv<SessionFeel>(feelKey(sessionId)).then((f) => {
      if (f) {
        setFeel(f);
        setNote(f.note ?? '');
      }
    });
    repo.listSessions().then((rows) => setInitiation(initiationRank(rows, sessionId)));
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

  /** Répétitions saisies après coup pour une série faite (jamais préremplies). */
  const saveFix = async () => {
    if (!fixing) return;
    const reps = Number(fixReps.replace(',', '.'));
    if (fixReps.trim() === '' || !Number.isFinite(reps) || reps < 0) return setFixError('Saisis le nombre de répétitions réellement faites.');
    const result: SetResult = { reps };
    if (fixKg.trim() !== '') {
      const kg = Number(fixKg.replace(',', '.'));
      if (!Number.isFinite(kg) || kg < 0) return setFixError('Charge invalide.');
      result.loadKg = kg;
    }
    if (fixRir !== undefined) result.rir = fixRir;
    const res = await send({ type: 'record_result', plannedSetId: fixing.id, result });
    if (!res.ok) return setFixError('Valeur refusée : vérifie les nombres saisis.');
    setSt(project(await repo.sessionEvents(sessionId)));
    setFixing(null);
  };

  /** Ressenti de fin de séance : enregistré tout de suite, modifiable. */
  const saveFeel = async (level: FeelLevel | undefined, text: string) => {
    if (!level) return;
    const next: SessionFeel = { level, note: text.trim() || undefined, at: Date.now() };
    await repo.setKv(feelKey(sessionId), next);
    setFeel(next);
  };
  const report = sessionReport(st, { feel, initiation, activeKcal: extra.activeKcal, avgBpm: extra.avgBpm });
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

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

      {initiation && (
        <div className="stack" style={{ marginBottom: 12 }}>
          <span className="pill" style={{ alignSelf: 'center' }}>Séance d’initiation {initiation}/{INITIATION_SESSIONS}</span>
          <div style={{ alignSelf: 'center' }}>
            <Help>Les premières séances servent à calibrer charges et répétitions : pas de conclusion sur ta progression.</Help>
          </div>
        </div>
      )}

      {safety && (
        <Notice tone="danger">Arrêt suite à une douleur signalée. Pas de diagnostic : demande un avis médical si elle persiste.</Notice>
      )}

      <section className="ui-card stack" aria-label="Ton ressenti">
        <p className="eyebrow" style={{ margin: 0 }}>Ton ressenti</p>
        <div className="chips" role="group" aria-label="Difficulté ressentie">
          {(Object.keys(FEEL_LABELS) as FeelLevel[]).map((k) => (
            <button key={k} className="chip" aria-pressed={feel?.level === k} onClick={() => saveFeel(k, note)}>
              {FEEL_LABELS[k]}
            </button>
          ))}
        </div>
        <input
          type="text"
          aria-label="Un mot sur ta séance"
          placeholder="Un mot (ex. classique)"
          value={note}
          maxLength={120}
          disabled={!feel}
          onChange={(e) => {
            setNote(e.target.value);
            if (feel) saveFeel(feel.level, e.target.value);
          }}
        />
        <Help>Noté dans le rapport. Il ne change pas tes charges tout seul.</Help>
      </section>

      <SessionJointFeedback repo={repo} st={st} />

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
                      <td>
                        {s.status === 'skipped' ? (
                          'Passée'
                        ) : s.status === 'pending' ? (
                          'Non démarrée'
                        ) : s.actual ? (
                          cell(s.actual, s.planned.kind)
                        ) : (
                          <button
                            className="btn sm"
                            onClick={() => {
                              setFixing({ id: s.plannedSetId, name: findVariant(g.variantId)?.variant.name ?? g.variantId, load: s.planned.loadKg });
                              setFixReps('');
                              setFixKg(s.planned.loadKg !== undefined ? String(s.planned.loadKg) : '');
                              setFixRir(undefined);
                              setFixError(null);
                            }}
                          >
                            Faite · saisir
                          </button>
                        )}
                      </td>
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

      <button className="btn block" style={{ marginTop: 16 }} onClick={() => { setCopied(false); setReportOpen(true); }}>
        <FileText size={16} aria-hidden="true" /> Rapport de la séance
      </button>
      <button className="btn primary big" style={{ marginTop: 12 }} onClick={onHome}>
        Retour à l’accueil
      </button>

      <Modal open={fixing !== null} onClose={() => setFixing(null)} title={fixing ? `Saisir · ${fixing.name}` : 'Saisir'}>
        {fixing && (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Série faite, répétitions non enregistrées : saisis ce que tu as vraiment fait.</p>
            <label className="field">
              Répétitions faites
              <input type="text" inputMode="numeric" value={fixReps} onChange={(e) => setFixReps(e.target.value)} />
            </label>
            <label className="field">
              Charge (kg)
              <input type="text" inputMode="decimal" value={fixKg} onChange={(e) => setFixKg(e.target.value)} />
            </label>
            <div className="chips" role="group" aria-label="Répétitions en réserve">
              {[0, 1, 2, 3, 4].map((r) => (
                <button key={r} className="chip" aria-pressed={fixRir === r} onClick={() => setFixRir(fixRir === r ? undefined : r)}>
                  RIR {r}
                </button>
              ))}
            </div>
            {fixError && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 600, margin: 0 }}>{fixError}</p>}
            <button className="btn primary" onClick={saveFix}>Enregistrer</button>
          </div>
        )}
      </Modal>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Rapport de séance">
        <div className="stack">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.85rem', maxHeight: '55vh', overflow: 'auto' }}>{report}</pre>
          <button className="btn primary" onClick={copyReport}>{copied ? 'Copié' : 'Copier le rapport'}</button>
        </div>
      </Modal>

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
