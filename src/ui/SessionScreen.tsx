import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, History, Minus, MoreHorizontal, Pause, Play, Plus, SkipForward, Square, TriangleAlert, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { findVariant } from '../catalog/exercises';
import { exerciseSheet } from '../engine/exerciseSheet';
import { ExerciseSheetView } from './ExerciseSheetView';
import { currentResult, lastComparable, timings } from '../engine/derive';
import { liveLoad } from '../engine/progression';
import { deviceTimeZone } from './support';
import { localDay } from '../engine/derive';
import type { ReadinessDecision, ReadinessInput } from '../engine/readiness';
import { ReadinessCheck } from './ReadinessCheck';
import { loadsFor, useEquipment } from './equipment';
import { project } from '../engine/session';
import type { SessionState, SetResult, SetState } from '../engine/types';
import type { Repository } from '../storage/db';
import { Modal, Notice } from './common';
import { CATEGORY_ICON } from './Scene';
import { fmtDuration, useNow, useWakeLock } from './support';
import { useSession, type SendResult } from './useSession';

const SKIP_REASONS = ['Manque de temps', 'Fatigue', 'Matériel indisponible', 'Autre'];
/** Passer un mouvement dont tu n'es pas sûr : ni séance partielle, ni échec, ni rattrapage, ni compté comme réalisé. */
const SKIP_SAFE = 'Passé : tolérance inconnue';
const INTERRUPT_REASONS = ['Appel', 'Pause imprévue', 'Matériel occupé', 'Autre'];

function describeTarget(set: SetState): string {
  const p = set.planned;
  const parts = [p.kind === 'reps' ? `${p.targetReps ?? '?'} rép.` : `${p.targetSeconds ?? '?'} s`];
  if (p.loadKg) parts.push(`lest ${p.loadKg} kg`);
  if (p.assistance) parts.push(`assistance : ${p.assistance}`);
  if (p.targetRir !== undefined) parts.push(`RIR visé ${p.targetRir}`);
  return parts.join(' · ');
}

function describeResult(r: SetResult | undefined): string {
  if (!r) return 'non saisi';
  const parts: string[] = [];
  if (r.reps !== undefined) parts.push(`${r.reps} rép.`);
  if (r.seconds !== undefined) parts.push(`${r.seconds} s`);
  if (r.loadKg !== undefined) parts.push(`${r.loadKg} kg`);
  if (r.rir !== undefined) parts.push(`RIR ${r.rir}`);
  return parts.join(' · ') || 'saisi sans valeur';
}

function setPosition(st: SessionState, set: SetState): string {
  const same = st.sets.filter((s) => s.planned.blockId === set.planned.blockId);
  return `Série ${same.indexOf(set) + 1}/${same.length}`;
}

export function SessionScreen({ repo, sessionId, onExit, onSummary, booted }: { repo: Repository; sessionId: string; onExit: () => void; onSummary: () => void; booted?: boolean }) {
  const { state, loaded, send, storageError } = useSession(repo, sessionId);
  const now = useNow(250);
  const wake = useWakeLock(!!state && state.phase !== 'ended');
  const [history, setHistory] = useState<SessionState[]>([]);
  const equipment = useEquipment(repo);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'pain' | 'skip' | 'interrupt' | 'end' | 'menu' | 'sheet' | null>(null);
  const [live, setLive] = useState('');
  const [flash, setFlash] = useState(0);
  const [check, setCheck] = useState<{ d: ReadinessDecision } | null | undefined>(undefined);
  useEffect(() => {
    repo.getKv<{ d: ReadinessDecision }>(`readiness.${sessionId}`).then((v) => setCheck(v ?? null));
  }, [repo, sessionId]);

  useEffect(() => {
    repo.allSessionEvents().then((map) => {
      const states: SessionState[] = [];
      for (const [id, evs] of map) {
        if (id === sessionId) continue;
        const s = project(evs);
        if (s) states.push(s);
      }
      setHistory(states);
    });
  }, [repo, sessionId]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(0), 750);
    return () => window.clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (state?.phase === 'ended') onSummary();
  }, [state?.phase, onSummary]);

  const applyReadiness = async (input: ReadinessInput, d: ReadinessDecision) => {
    await repo.setKv(`readiness.${sessionId}`, { input, d, at: Date.now() });
    const rlog = (await repo.getKv<{ day: string; tired: boolean }[]>('readiness.log')) ?? [];
    await repo.setKv('readiness.log', [...rlog, { day: localDay(Date.now(), deviceTimeZone()), tired: input.sleepBad || input.fatigue }].slice(-120));
    setCheck({ d });
    if (!state) return;
    const work = state.sets.filter((x) => x.status === 'pending');
    if (d.decision === 'arrêt' || d.decision === 'reporter') {
      for (const x of work) await send({ type: 'skip_set', plannedSetId: x.planned.id, reason: d.decision === 'arrêt' ? 'arrêt : signal d’alerte' : 'reportée : malade' });
      await send({ type: 'end_session' });
      onExit();
      return;
    }
    const blocks = [...new Set(state.sets.map((x) => x.planned.blockId))];
    for (const [bi, b] of blocks.entries()) {
      const sets = state.sets.filter((x) => x.planned.blockId === b && x.planned.role === 'work');
      if (d.shorten && bi >= 2) {
        for (const x of sets) await send({ type: 'skip_set', plannedSetId: x.planned.id, reason: 'version courte (contrôle avant séance)' });
        continue;
      }
      // Principaux (2 premiers blocs) intacts ; secondaires −1 série, jamais jusqu'à zéro.
      if (d.trimSecondary && bi >= 2 && sets.length > 1) await send({ type: 'skip_set', plannedSetId: sets[sets.length - 1]!.planned.id, reason: 'allégée : exercice secondaire (contrôle avant séance)' });
    }
  };

  const act = async (cmd: Parameters<typeof send>[0], message?: string): Promise<SendResult> => {
    const res = await send(cmd);
    if (res.ok && message) setLive(message);
    // Effet visuel de validation (flash + pulsation) sur les actions clés.
    if (res.ok && ['start_set', 'end_set', 'end_interruption', 'record_result', 'skip_set'].includes(cmd.type)) setFlash(Date.now());
    return res;
  };

  const view = useMemo(() => {
    if (!state) return null;
    const inSet = state.sets.find((s) => s.planned.id === state.currentSetId);
    const pending = state.sets.filter((s) => s.status === 'pending');
    const focus = inSet ?? pending.find((s) => s.planned.id === focusId) ?? pending[0];
    const done = state.sets.filter((s) => s.status === 'done').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    const entry = state.sets.find((s) => s.planned.id === entryId && s.status !== 'pending') ?? done[0];
    return { inSet, pending, focus, entry };
  }, [state, focusId, entryId]);

  if (!loaded) return <p style={{ padding: 16 }}>Chargement de la séance…</p>;
  if (!state || !view) return <p style={{ padding: 16 }}>Séance introuvable.</p>;

  const t = timings(state, now);
  const { inSet, pending, focus, entry } = view;
  const lastRest = state.rests[state.rests.length - 1];
  const openInterruption = state.interruptions.find((i) => i.end === undefined);
  const focusInfo = focus ? findVariant(focus.planned.variantId) : undefined;
  const sheet = focus ? exerciseSheet(focus.planned.variantId, focus.planned) : undefined;
  const comparable = focus ? lastComparable(history, focus.planned.variantId, state.startedAt) : undefined;
  // Consigne en direct : si la série d'avant était trop facile, la suivante monte.
  const order = focus && focus.status === 'pending' ? liveLoad(state, focus.planned, loadsFor(focus.planned.variantId, equipment)) : undefined;
  const setsDone = state.sets.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const blocks: { blockId: string; name: string; icon?: LucideIcon; done: number; total: number }[] = [];
  for (const s of state.sets) {
    let b = blocks.find((x) => x.blockId === s.planned.blockId);
    if (!b) {
      const ex = findVariant(s.planned.variantId)?.exercise;
      b = { blockId: s.planned.blockId, name: ex?.name ?? s.planned.variantId, icon: ex ? CATEGORY_ICON[ex.category] : undefined, done: 0, total: 0 };
      blocks.push(b);
    }
    b.total++;
    if (s.status !== 'pending' && s.status !== 'in_progress') b.done++;
  }

  // Contrôle avant séance : une fois, avant la toute première série.
  const fresh = state.phase === 'ready' && state.sets.every((x) => x.status === 'pending');
  if (check === null && fresh) {
    return (
      <div className="session hud">
        <ReadinessCheck onDone={applyReadiness} />
      </div>
    );
  }

  return (
    <div className={`session hud ${booted ? 'booted' : ''}`}>
      <header className="hud-top">
        <button className="icon-btn ghost" onClick={onExit} aria-label="Quitter l’écran de séance (la séance reste en cours)">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="grow">
          <p className="hud-label">Mission</p>
          <p className="row-title">{state.plan.title}</p>
        </div>
        <button className="icon-btn ghost hud-pain" aria-label="Signaler une douleur ou un problème" onClick={() => setDialog('pain')}>
          <TriangleAlert size={17} aria-hidden="true" />
        </button>
        <button className="icon-btn ghost" aria-label="Options de la séance" onClick={() => setDialog('menu')}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="hud-progress" aria-label={`${setsDone} séries sur ${state.sets.length}`}>
        <span className="meter">
          <span style={{ width: `${(setsDone / Math.max(1, state.sets.length)) * 100}%` }} />
        </span>
        <span className="hud-progress-txt num">
          {setsDone}/{state.sets.length} · {fmtDuration(t.totalMs)}
        </span>
      </div>

      <div className="session-body hud-body">
        <div aria-live="polite" className="sr-only">{live}</div>
        {storageError && <Notice tone="danger">Échec d’enregistrement : dernière action non sauvegardée.</Notice>}
        {state.safetyStop && <Notice tone="danger">Arrêt pour douleur. Si ça persiste : avis médical.</Notice>}

        {state.phase === 'interrupted' && openInterruption ? (
          <section className="hud-core" aria-label="Interruption">
            <span className="hud-tag">Pause · {openInterruption.reason}</span>
            <div className="hud-clock num">{fmtDuration(now - openInterruption.start)}</div>
            <button className={`btn primary big hud-cta ${flash ? 'pulse' : ''}`} onClick={() => act({ type: 'end_interruption' }, 'Interruption terminée')}>
              <Play size={18} aria-hidden="true" /> Reprendre
            </button>
          </section>
        ) : focus ? (
          <section
            key={`${focus.planned.id}-${state.phase}`}
            className={`hud-core ${inSet ? 'is-live' : ''} ${flash ? 'flash' : ''}`}
            aria-label="Série en cours"
          >
            <div className="hud-core-head">
              <span className="hud-tag num">
                {blocks.findIndex((b) => b.blockId === focus.planned.blockId) + 1}/{blocks.length} · {setPosition(state, focus).replace('Série ', 'S')}
              </span>
              <span className={`hud-status ${inSet ? 'live' : ''}`}>{inSet ? 'En série' : state.phase === 'resting' ? 'Repos' : 'Prêt'}</span>
            </div>
            <h1 className="hud-title">{focusInfo?.variant.name ?? focus.planned.variantId}</h1>

            <div className="hud-target num" key={focus.planned.id}>
              {focus.planned.kind === 'reps' ? focus.planned.targetReps ?? (focus.planned.role === 'test' ? ((focus.planned.targetRir ?? 0) >= 3 ? 'SOUS-MAX' : 'MAX') : '?') : focus.planned.targetSeconds ?? '?'}
              <span>{focus.planned.kind === 'reps' ? 'rép.' : 's'}</span>
            </div>
            {order && (
              <div className={`hud-order ${order.reason}`} role="status" key={`${focus.planned.id}-order`}>
                <span className="hud-order-tag">{order.reason === 'facile' ? 'Trop facile' : order.reason === 'manqué' ? 'Trop lourd' : 'Charge'}</span>
                <strong className="num">
                  {order.loadKg !== undefined ? `${order.loadKg.toLocaleString('fr-BE')} kg` : ''}{order.loadKg !== undefined && order.targetReps !== undefined ? ' × ' : ''}{order.targetReps !== undefined ? `${order.targetReps} rép.` : ''}
                </strong>
                <span>{order.reason === 'facile' ? 'monte, vas-y' : order.reason === 'manqué' ? 'redescends' : 'garde'}</span>
              </div>
            )}
            {!order && focus.planned.progression && (
              <div className="hud-order prog" role="status">
                <span className="hud-order-tag">Dernière séance</span>
                <strong className="num">{focus.planned.progression}</strong>
              </div>
            )}
            {focus.planned.kind === 'reps' && (focus.planned.repRange || focus.planned.targetRir !== undefined) && (
              <div className="hud-chips">
                {focus.planned.repRange && <span className="pill num">plage {focus.planned.repRange[0]}–{focus.planned.repRange[1]}</span>}
                {isLastOfBlock(state, focus) && focus.planned.lastSetToFailure && !check?.d.noFailure ? (
                  <span className="pill num hud-fail">dernière série : échec propre</span>
                ) : focus.planned.targetRir !== undefined ? (
                  <span className="pill num">réserve {focus.planned.targetRir}</span>
                ) : null}
              </div>
            )}
            {(focus.planned.cue || focus.planned.loadKg || focus.planned.assistance) && (
              <div className="hud-chips">
                {focus.planned.cue && <span className="pill">{focus.planned.cue}</span>}
                {focus.planned.loadKg ? <span className="pill num">+{focus.planned.loadKg} kg</span> : null}
                {focus.planned.assistance && <span className="pill">{focus.planned.assistance}</span>}
              </div>
            )}

            <div className="hud-clock-wrap">
              {state.phase === 'resting' && lastRest && t.currentRestMs !== undefined ? (
                <>
                  <div className={`hud-clock num running ${t.currentRestMs > lastRest.targetSeconds * 1000 ? 'over' : ''}`}>{fmtDuration(t.currentRestMs)}</div>
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (t.currentRestMs / Math.max(1, lastRest.targetSeconds * 1000)) * 100)}%` }} />
                  </span>
                  <p className="hud-clock-label num">
                    {t.currentRestMs > lastRest.targetSeconds * 1000
                      ? `+${fmtDuration(t.currentRestMs - lastRest.targetSeconds * 1000)}`
                      : `repos ${fmtDuration(lastRest.targetSeconds * 1000)}`}
                  </p>
                </>
              ) : inSet && t.currentSetMs !== undefined ? (
                <div className="hud-clock num running live">{fmtDuration(t.currentSetMs)}</div>
              ) : (
                <div className="hud-clock num idle" aria-hidden="true">0:00</div>
              )}
            </div>

            {inSet ? (
              <button
                className={`btn primary big hud-cta ${flash ? 'pulse' : ''}`}
                onClick={() => act({ type: 'end_set', plannedSetId: focus.planned.id }, 'Série terminée, repos lancé').then(() => setEntryId(focus.planned.id))}
              >
                <Square size={16} aria-hidden="true" /> Terminer la série
              </button>
            ) : (
              <button className={`btn primary big hud-cta ${flash ? 'pulse' : ''}`} disabled={state.safetyStop} onClick={() => act({ type: 'start_set', plannedSetId: focus.planned.id }, 'Série commencée')}>
                <Play size={18} aria-hidden="true" /> Commencer
              </button>
            )}
            {comparable && (
              <p className="hud-last num">
                <History size={12} aria-hidden="true" /> {comparable.results.map(describeResult).join(' / ')}
              </p>
            )}
          </section>
        ) : (
          <section className="hud-core" aria-label="Mission terminée">
            <span className="hud-tag">Mission accomplie</span>
            <button className={`btn primary big hud-cta ${flash ? 'pulse' : ''}`} onClick={() => setDialog('end')}>
              <Check size={18} aria-hidden="true" /> Terminer la séance
            </button>
          </section>
        )}

        {entry && <ResultEntry key={entry.planned.id + entry.entries.length} state={state} set={entry} act={act} loads={loadsFor(entry.planned.variantId, equipment)} />}

        <section className="ui-card" aria-label="Plan de mission">
          <p className="hud-label">Plan</p>
          <ul className="hud-plan">
            {blocks.map((b) => {
              const sets = state.sets.filter((s) => s.planned.blockId === b.blockId);
              const nextPending = sets.find((s) => s.status === 'pending');
              const isCurrent = focus?.planned.blockId === b.blockId;
              return (
                <li key={b.blockId} className={isCurrent ? 'current' : ''}>
                  <button
                    className="hud-plan-row"
                    disabled={!!inSet || !nextPending}
                    onClick={() => nextPending && setFocusId(nextPending.planned.id)}
                    aria-label={`${b.name} : ${b.done} séries sur ${b.total}`}
                  >
                    <span className="hud-plan-name">{findVariant(sets[0]!.planned.variantId)?.variant.name ?? b.name}</span>
                    <span className="hud-plan-dots" aria-hidden="true">
                      {sets.map((s) => (
                        <span key={s.planned.id} className={`dot st-${s.status}`} />
                      ))}
                    </span>
                    <span className="hud-plan-count num">
                      {b.done}/{b.total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <Modal open={dialog === 'menu'} onClose={() => setDialog(null)} title="Options">
        <div className="stack">
          <button className="btn block" disabled={!!inSet || state.safetyStop || state.phase === 'interrupted'} onClick={() => setDialog('interrupt')}>
            <Pause size={16} aria-hidden="true" /> Pause
          </button>
          <button className="btn block" disabled={!!inSet || !focus} onClick={() => setDialog('skip')}>
            <SkipForward size={16} aria-hidden="true" /> Passer la série
          </button>
          {state.sets.some((s) => s.status === 'done') && (
            <button
              className="btn block"
              onClick={() => {
                const last = [...state.sets].filter((s) => s.status === 'done').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
                if (last) setEntryId(last.planned.id);
                setDialog(null);
              }}
            >
              Corriger un résultat
            </button>
          )}
          {focusInfo && (
            <button className="btn block" onClick={() => setDialog('sheet')}>
              Fiche de l’exercice
            </button>
          )}
          <button className="btn primary block" onClick={() => setDialog('end')}>
            Terminer la séance
          </button>
        </div>
      </Modal>

      <Modal open={dialog === 'sheet'} onClose={() => setDialog(null)} title={focusInfo?.variant.name ?? 'Fiche'}>
        {focus && sheet && <ExerciseSheetView s={sheet} />}
      </Modal>

      <Modal open={dialog === 'pain'} onClose={() => setDialog(null)} title="Douleur ou problème">
        <button
          className="rc-red"
          style={{ width: '100%', marginBottom: 12 }}
          onClick={async () => {
            const res = await act({ type: 'report_pain', plannedSetId: focus?.planned.id, location: 'alerte : douleur thoracique / malaise / essoufflement', intensity: 10, stop: true }, 'Séance arrêtée : signal d’alerte');
            if (res.ok) {
              setDialog(null);
              setLive('Arrête l’effort. Douleur thoracique, malaise ou essoufflement anormal : appelle le 112.');
            }
          }}
        >
          Douleur thoracique, malaise, essoufflement anormal → arrêt + 112
        </button>
        <PainForm
          onCancel={() => setDialog(null)}
          onSubmit={async (location, intensity, stop) => {
            const res = await act({ type: 'report_pain', plannedSetId: focus?.planned.id, location, intensity, stop }, stop ? 'Séance arrêtée pour sécurité' : 'Gêne notée');
            if (res.ok) setDialog(null);
          }}
        />
      </Modal>

      <Modal open={dialog === 'skip'} onClose={() => setDialog(null)} title="Passer cette série">
        <p className="muted">→ non réalisée · séance partielle</p>
        <button
          className="btn block"
          onClick={async () => {
            if (focus) await act({ type: 'skip_set', plannedSetId: focus.planned.id, reason: SKIP_SAFE }, 'Série passée sans pénalité');
            setFocusId(null);
            setDialog(null);
          }}
        >
          {SKIP_SAFE}
        </button>
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Cette option : sans pénalité, sans rattrapage, jamais comptée comme réalisée.</p>
        <div className="stack">
          {SKIP_REASONS.map((r) => (
            <button
              key={r}
              className="btn block"
              onClick={async () => {
                if (focus) await act({ type: 'skip_set', plannedSetId: focus.planned.id, reason: r }, 'Série passée');
                setFocusId(null);
                setDialog(null);
              }}
            >
              {r}
            </button>
          ))}
          <button className="btn ghost block" onClick={() => setDialog(null)}>Annuler</button>
        </div>
      </Modal>

      <Modal open={dialog === 'interrupt'} onClose={() => setDialog(null)} title="Déclarer une interruption">
        <p className="muted">⏸ Compté à part, pas comme repos.</p>
        <div className="stack">
          {INTERRUPT_REASONS.map((r) => (
            <button
              key={r}
              className="btn block"
              onClick={async () => {
                await act({ type: 'start_interruption', reason: r }, 'Interruption commencée');
                setDialog(null);
              }}
            >
              {r}
            </button>
          ))}
          <button className="btn ghost block" onClick={() => setDialog(null)}>Annuler</button>
        </div>
      </Modal>

      <Modal open={dialog === 'end'} onClose={() => setDialog(null)} title="Terminer la séance ?">
        {pending.length > 0 ? (
          <p>
            {pending.length} série{pending.length > 1 ? 's' : ''} prévue{pending.length > 1 ? 's' : ''} non réalisée{pending.length > 1 ? 's' : ''}. La séance
            sera enregistrée comme <strong>partielle</strong>, pas comme complète.
          </p>
        ) : (
          <p>Toutes les séries prévues sont faites ou passées.</p>
        )}
        {inSet && <p className="muted">La série en cours sera arrêtée maintenant.</p>}
        <div className="row">
          <button className="btn primary" onClick={async () => { await act({ type: 'end_session' }, 'Séance terminée'); setDialog(null); }}>
            Terminer
          </button>
          <button className="btn ghost" onClick={() => setDialog(null)}>Continuer la séance</button>
        </div>
      </Modal>
    </div>
  );
}

function ResultEntry({ state, set, act, loads }: { loads: number[]; state: SessionState; set: SetState; act: (cmd: Parameters<ReturnType<typeof useSession>['send']>[0], msg?: string) => Promise<SendResult> }) {
  const saved = currentResult(set);
  const p = set.planned;
  const measuredSeconds = set.startedAt !== undefined && set.endedAt !== undefined ? Math.round((set.endedAt - set.startedAt) / 1000) : undefined;
  // Répétitions : jamais préremplies comme réussies (champ vide tant que rien n'est saisi).
  const [reps, setReps] = useState<number | undefined>(saved?.reps);
  const [seconds, setSeconds] = useState<number>(saved?.seconds ?? measuredSeconds ?? p.targetSeconds ?? 0);
  const advice = liveLoad(state, p, loads);
  const advised = advice?.loadKg;
  const [loadKg, setLoadKg] = useState<string>(String(saved?.loadKg ?? advised ?? p.loadKg ?? ''));
  const [rir, setRir] = useState<number | undefined>(saved?.rir);
  const [error, setError] = useState<string | null>(null);
  const name = findVariant(p.variantId)?.variant.name ?? p.variantId;
  const lastEntry = [...set.entries].reverse().find((e) => !e.undone);

  const save = async () => {
    if (p.kind === 'reps' && reps === undefined) return setError('Saisis le nombre de répétitions réellement faites.');
    const result: SetResult = p.kind === 'reps' ? { reps } : { seconds };
    if (loadKg.trim() !== '') result.loadKg = Number(loadKg);
    if (p.assistance) result.assistance = p.assistance;
    if (rir !== undefined) result.rir = rir;
    const res = await act({ type: 'record_result', plannedSetId: p.id, result }, 'Résultat enregistré');
    setError(res.ok ? null : 'Valeur refusée : vérifie les nombres saisis.');
  };

  const value = p.kind === 'reps' ? reps : seconds;
  const setValue = (v: number) => (p.kind === 'reps' ? setReps(v) : setSeconds(v));

  return (
    <section className="card stack" aria-label="Saisie du résultat">
      <div className="spread">
        <h3 style={{ margin: 0 }}>Résultat · {name}</h3>
        <span className={`badge ${saved ? 'ok' : 'warn'}`}>{saved ? 'Enregistré' : 'Non enregistré'}</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {setPosition(state, set)} · prévu {describeTarget(set)}
        {measuredSeconds !== undefined && ` · durée mesurée ${measuredSeconds} s`}
      </p>
      <div className="stepper">
        <button className="btn" aria-label="Moins un" onClick={() => setValue(Math.max(0, (value ?? p.targetReps ?? 1) - 1))}>
          <Minus aria-hidden="true" />
        </button>
        <input
          aria-label={p.kind === 'reps' ? 'Répétitions réalisées' : 'Secondes réalisées'}
          type="number"
          inputMode="numeric"
          min={0}
          value={value ?? ''}
          placeholder={p.targetReps !== undefined ? `cible ${p.targetReps}` : ''}
          onChange={(e) => (e.target.value === '' ? setReps(undefined) : setValue(Math.max(0, Math.floor(Number(e.target.value) || 0))))}
        />
        <button className="btn" aria-label="Plus un" onClick={() => setValue(value === undefined ? (p.targetReps ?? 0) : value + 1)}>
          <Plus aria-hidden="true" />
        </button>
      </div>
      <div className="muted" style={{ textAlign: 'center', marginTop: -4 }}>{p.kind === 'reps' ? 'répétitions' : 'secondes'}</div>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 500, marginBottom: 6 }}>RIR : répétitions encore possibles (estimation)</legend>
        <div className="chips">
          <button className="chip" aria-pressed={rir === undefined} onClick={() => setRir(undefined)}>?</button>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button key={n} className="chip" aria-pressed={rir === n} onClick={() => setRir(n)}>
              {n === 5 ? '5+' : n}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        Lest réel (kg)
        <span className="hint">Laisse vide si sans lest</span>
        <input type="number" inputMode="decimal" min={0} step="0.5" value={loadKg} onChange={(e) => setLoadKg(e.target.value)} />
      </label>
      {error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      <button className="btn primary block" onClick={save}>
        <Check size={18} aria-hidden="true" /> {saved ? 'Corriger le résultat' : 'Enregistrer le résultat'}
      </button>
      {lastEntry && (
        <button className="btn ghost block" onClick={() => act({ type: 'undo_result', targetEventId: lastEntry.eventId }, 'Dernière saisie annulée')}>
          <Undo2 size={18} aria-hidden="true" /> Annuler la dernière saisie
        </button>
      )}
    </section>
  );
}

function PainForm({ onSubmit, onCancel }: { onSubmit: (location: string, intensity: number, stop: boolean) => void; onCancel: () => void }) {
  const [location, setLocation] = useState('');
  const [intensity, setIntensity] = useState<number | null>(null);
  const ready = location.trim() !== '' && intensity !== null;
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Pas de diagnostic, juste une note.</p>
      <label className="field">
        Où ?
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ex. épaule droite" />
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 500, marginBottom: 6 }}>Intensité ressentie (0 = aucune, 10 = maximale)</legend>
        <div className="chips">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} className="chip" aria-pressed={intensity === n} onClick={() => setIntensity(n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <button className="btn danger block" disabled={!ready} onClick={() => ready && onSubmit(location.trim(), intensity!, true)}>
        Arrêter la séance par sécurité
      </button>
      <button className="btn block" disabled={!ready} onClick={() => ready && onSubmit(location.trim(), intensity!, false)}>
        Noter une gêne et continuer
      </button>
      <button className="btn ghost block" onClick={onCancel}>Annuler</button>
    </div>
  );
}

/** Dernière série de travail de son bloc ? (l'échec n'est prévu que là) */
function isLastOfBlock(st: SessionState, set: SetState): boolean {
  const block = st.sets.filter((x) => x.planned.blockId === set.planned.blockId && x.planned.role === 'work');
  return block[block.length - 1]?.planned.id === set.planned.id;
}
