import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ImageOff, Minus, Pause, Play, Plus, SkipForward, Square, TriangleAlert, Undo2 } from 'lucide-react';
import { findVariant } from '../catalog/exercises';
import { currentResult, lastComparable, timings } from '../engine/derive';
import { project } from '../engine/session';
import type { SessionState, SetResult, SetState } from '../engine/types';
import type { Repository } from '../storage/db';
import { Modal, Notice } from './common';
import { Scene } from './Fighter';
import { CharacterArt } from './character';
import { fmtDuration, useNow, useWakeLock } from './support';
import { useSession, type SendResult } from './useSession';

const SKIP_REASONS = ['Manque de temps', 'Fatigue', 'Matériel indisponible', 'Autre'];
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

export function SessionScreen({ repo, sessionId, onExit, onSummary }: { repo: Repository; sessionId: string; onExit: () => void; onSummary: () => void }) {
  const { state, loaded, send, storageError } = useSession(repo, sessionId);
  const now = useNow(250);
  const wake = useWakeLock(!!state && state.phase !== 'ended');
  const [history, setHistory] = useState<SessionState[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'pain' | 'skip' | 'interrupt' | 'end' | null>(null);
  const [live, setLive] = useState('');

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
    if (state?.phase === 'ended') onSummary();
  }, [state?.phase, onSummary]);

  const act = async (cmd: Parameters<typeof send>[0], message?: string): Promise<SendResult> => {
    const res = await send(cmd);
    if (res.ok && message) setLive(message);
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
  const comparable = focus ? lastComparable(history, focus.planned.variantId, state.startedAt) : undefined;
  const blocks: { blockId: string; name: string; done: number; total: number }[] = [];
  for (const s of state.sets) {
    let b = blocks.find((x) => x.blockId === s.planned.blockId);
    if (!b) {
      b = { blockId: s.planned.blockId, name: findVariant(s.planned.variantId)?.exercise.name ?? s.planned.variantId, done: 0, total: 0 };
      blocks.push(b);
    }
    b.total++;
    if (s.status !== 'pending' && s.status !== 'in_progress') b.done++;
  }

  return (
    <div className="session">
      <div className="session-hero">
        <Scene kind="gym">
          <CharacterArt size={230} />
        </Scene>
        <div className="fade" />
        <div className="top">
          <button className="round" onClick={onExit} aria-label="Quitter l’écran de séance (la séance reste en cours)">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <span className="badge num" style={{ background: 'var(--surface-glass)' }}>Total {fmtDuration(t.totalMs)}</span>
          <button className="btn" style={{ minHeight: 44 }} onClick={() => setDialog('end')}>
            Terminer
          </button>
        </div>
      </div>

      <div className="session-body">
        <div aria-live="polite" className="sr-only">{live}</div>
        {storageError && (
          <Notice tone="danger">
            Échec d’enregistrement sur l’appareil : la dernière action n’a pas été sauvegardée. ({storageError})
          </Notice>
        )}
        {state.safetyStop && (
          <Notice tone="danger">
            Séance arrêtée suite à une douleur signalée. Ce n’est pas un diagnostic. Si la douleur est forte, inhabituelle,
            persiste ou s’accompagne d’autres symptômes, consulte un professionnel de santé. Tu peux terminer la séance.
          </Notice>
        )}

        <div className="steps" role="list" aria-label="Exercices de la séance">
          {blocks.map((b) => (
            <div key={b.blockId} role="listitem" className="cat" aria-current={focus?.planned.blockId === b.blockId ? 'step' : undefined}>
              <span className="bubble" style={{ position: 'relative', borderColor: focus?.planned.blockId === b.blockId ? 'var(--accent)' : undefined }}>
                <Scene kind="gym">
                  <CharacterArt size={54} />
                </Scene>
              </span>
              <span style={{ maxWidth: 76, textAlign: 'center', lineHeight: 1.2 }}>
                {b.name} · {b.done}/{b.total}
              </span>
            </div>
          ))}
        </div>

        <section aria-label="Série en cours" style={{ margin: '8px 0 20px' }}>
          {state.phase === 'interrupted' && openInterruption ? (
            <>
              <div className="counter">Interruption · {openInterruption.reason}</div>
              <div className="clock" style={{ marginTop: 12 }}>{fmtDuration(now - openInterruption.start)}</div>
              <div className="clock-label">Ce temps n’est pas compté comme repos.</div>
            </>
          ) : focus ? (
            <>
              <div className="counter">
                {inSet ? 'Série en cours' : state.phase === 'resting' ? 'Repos' : 'Prêt'} · {setPosition(state, focus)}
              </div>
              <div className="ex-name">{focusInfo?.variant.name ?? focus.planned.variantId}</div>
              <p className="ex-target">
                Cible : <strong>{describeTarget(focus)}</strong>
              </p>
              {state.phase === 'resting' && lastRest && t.currentRestMs !== undefined ? (
                <>
                  <div className={`clock ${t.currentRestMs > lastRest.targetSeconds * 1000 ? 'over' : ''}`}>{fmtDuration(t.currentRestMs)}</div>
                  <div className="clock-label">
                    {t.currentRestMs > lastRest.targetSeconds * 1000
                      ? `+${fmtDuration(t.currentRestMs - lastRest.targetSeconds * 1000)} au-delà de la cible (${fmtDuration(lastRest.targetSeconds * 1000)})`
                      : `Repos cible ${fmtDuration(lastRest.targetSeconds * 1000)}`}
                  </div>
                </>
              ) : inSet && t.currentSetMs !== undefined ? (
                <>
                  <div className="clock">{fmtDuration(t.currentSetMs)}</div>
                  <div className="clock-label">{focus.planned.kind === 'hold' ? `Cible ${focus.planned.targetSeconds ?? '?'} s` : 'Durée de la série'}</div>
                </>
              ) : (
                <>
                  <div className="clock" aria-hidden="true">0:00</div>
                  <div className="clock-label">Le chrono démarre quand tu touches « Commencer ».</div>
                </>
              )}

              {!inSet && (
                <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
                  <button className="btn" onClick={() => setDialog('skip')}>
                    <SkipForward size={18} aria-hidden="true" /> Passer cette série
                  </button>
                </div>
              )}

              <details className="card" style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>Consignes et démonstration</summary>
                <div className="stack" style={{ marginTop: 8 }}>
                  {focusInfo && focusInfo.variant.media.length === 0 && (
                    <div className="media-missing">
                      <ImageOff size={18} aria-hidden="true" /> Démonstration non disponible : aucun média vérifié pour cette variante.
                    </div>
                  )}
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{focusInfo?.variant.cues.map((c) => <li key={c}>{c}</li>)}</ul>
                  {focusInfo && focusInfo.variant.commonErrors.length > 0 && (
                    <p className="muted" style={{ margin: 0 }}>Erreurs fréquentes : {focusInfo.variant.commonErrors.join(' ; ')}</p>
                  )}
                  <span className="badge warn" style={{ alignSelf: 'flex-start' }}>Consignes non relues par un professionnel</span>
                </div>
              </details>

              <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
                Dernière performance comparable :{' '}
                {comparable ? comparable.results.map(describeResult).join(' / ') : 'aucune donnée pour cette variante'}
              </p>
            </>
          ) : (
            <p style={{ textAlign: 'center' }}>Toutes les séries prévues sont faites ou passées.</p>
          )}
        </section>

        <div className="controls">
          <button className="btn side" aria-label="Signaler une douleur ou un problème" onClick={() => setDialog('pain')} style={{ color: 'var(--danger)' }}>
            <TriangleAlert size={22} aria-hidden="true" />
          </button>
          {state.phase === 'interrupted' ? (
            <button className="btn dark main" onClick={() => act({ type: 'end_interruption' }, 'Interruption terminée')}>
              <Play size={20} aria-hidden="true" /> Reprendre
            </button>
          ) : focus ? (
            inSet ? (
              <button
                className="btn dark main"
                onClick={() => act({ type: 'end_set', plannedSetId: focus.planned.id }, 'Série terminée, repos lancé').then(() => setEntryId(focus.planned.id))}
              >
                <Square size={18} aria-hidden="true" /> Terminer la série
              </button>
            ) : (
              <button className="btn dark main" disabled={state.safetyStop} onClick={() => act({ type: 'start_set', plannedSetId: focus.planned.id }, 'Série commencée')}>
                <Play size={20} aria-hidden="true" /> Commencer la série
              </button>
            )
          ) : (
            <button className="btn dark main" onClick={() => setDialog('end')}>
              <Check size={20} aria-hidden="true" /> Terminer la séance
            </button>
          )}
          <button
            className="btn side"
            aria-label="Déclarer une interruption"
            disabled={!!inSet || state.safetyStop || state.phase === 'interrupted'}
            onClick={() => setDialog('interrupt')}
          >
            <Pause size={22} aria-hidden="true" />
          </button>
        </div>

        {entry && <ResultEntry key={entry.planned.id + entry.entries.length} state={state} set={entry} act={act} />}

        <section className="card" aria-label="Séries de la séance">
          <h3>Séries</h3>
          <ul className="setlist">
            {state.sets.map((s) => {
              const name = findVariant(s.planned.variantId)?.variant.name ?? s.planned.variantId;
              const status =
                s.status === 'done' ? describeResult(currentResult(s)) : s.status === 'skipped' ? `passée (${s.skipReason})` : s.status === 'in_progress' ? 'en cours' : `prévu ${describeTarget(s)}`;
              const clickable = s.status === 'pending' || s.status === 'done';
              return (
                <li key={s.planned.id} className={s === focus ? 'current' : ''}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                    <div className="muted" style={{ fontSize: '0.9rem' }}>
                      {setPosition(state, s)} · {status}
                    </div>
                  </div>
                  {clickable && !inSet && (
                    <button
                      className="btn ghost"
                      onClick={() => (s.status === 'pending' ? setFocusId(s.planned.id) : setEntryId(s.planned.id))}
                    >
                      {s.status === 'pending' ? 'Choisir' : 'Corriger'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted" style={{ marginTop: 12, marginBottom: 0, fontSize: '0.9rem' }}>
            Actif {fmtDuration(t.activeMs)} · Repos {fmtDuration(t.restMs)} · Interruptions {fmtDuration(t.interruptedMs)}
            {wake === 'unsupported' ? ' · Écran : maintien allumé non pris en charge' : wake === 'active' ? ' · Écran maintenu allumé' : ''}
          </p>
        </section>
      </div>

      <Modal open={dialog === 'pain'} onClose={() => setDialog(null)} title="Douleur ou problème">
        <PainForm
          onCancel={() => setDialog(null)}
          onSubmit={async (location, intensity, stop) => {
            const res = await act({ type: 'report_pain', plannedSetId: focus?.planned.id, location, intensity, stop }, stop ? 'Séance arrêtée pour sécurité' : 'Gêne notée');
            if (res.ok) setDialog(null);
          }}
        />
      </Modal>

      <Modal open={dialog === 'skip'} onClose={() => setDialog(null)} title="Passer cette série">
        <p className="muted">Elle sera notée comme non réalisée. La séance sera marquée partielle.</p>
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
        <p className="muted">Le temps d’interruption est mesuré à part et n’est pas compté comme repos.</p>
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

function ResultEntry({ state, set, act }: { state: SessionState; set: SetState; act: (cmd: Parameters<ReturnType<typeof useSession>['send']>[0], msg?: string) => Promise<SendResult> }) {
  const saved = currentResult(set);
  const p = set.planned;
  const measuredSeconds = set.startedAt !== undefined && set.endedAt !== undefined ? Math.round((set.endedAt - set.startedAt) / 1000) : undefined;
  // Valeurs de départ pour faciliter la saisie ; rien n'est enregistré sans validation.
  const [reps, setReps] = useState<number>(saved?.reps ?? p.targetReps ?? 0);
  const [seconds, setSeconds] = useState<number>(saved?.seconds ?? measuredSeconds ?? p.targetSeconds ?? 0);
  const [loadKg, setLoadKg] = useState<string>(String(saved?.loadKg ?? p.loadKg ?? ''));
  const [rir, setRir] = useState<number | undefined>(saved?.rir);
  const [error, setError] = useState<string | null>(null);
  const name = findVariant(p.variantId)?.variant.name ?? p.variantId;
  const lastEntry = [...set.entries].reverse().find((e) => !e.undone);

  const save = async () => {
    const result: SetResult = p.kind === 'reps' ? { reps } : { seconds };
    if (loadKg.trim() !== '') result.loadKg = Number(loadKg);
    if (p.assistance) result.assistance = p.assistance;
    if (rir !== undefined) result.rir = rir;
    const res = await act({ type: 'record_result', plannedSetId: p.id, result }, 'Résultat enregistré');
    setError(res.ok ? null : 'Valeur refusée : vérifie les nombres saisis.');
  };

  const value = p.kind === 'reps' ? reps : seconds;
  const setValue = p.kind === 'reps' ? setReps : setSeconds;

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
        <button className="btn" aria-label="Moins un" onClick={() => setValue(Math.max(0, value - 1))}>
          <Minus aria-hidden="true" />
        </button>
        <input
          aria-label={p.kind === 'reps' ? 'Répétitions réalisées' : 'Secondes réalisées'}
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => setValue(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <button className="btn" aria-label="Plus un" onClick={() => setValue(value + 1)}>
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
      <p className="muted" style={{ margin: 0 }}>L’application n’établit aucun diagnostic. Elle note ce que tu signales.</p>
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
