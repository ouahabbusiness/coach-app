// Données de test fictives : aucune ne représente les performances réelles de l'utilisateur.
import { describe, expect, it } from 'vitest';
import { decide, project } from '../src/engine/session';
import { currentResult, sessionOutcome, timings, localDay } from '../src/engine/derive';
import type { SessionCommand, SessionEvent, SessionPlan } from '../src/engine/types';

const T0 = Date.UTC(2026, 0, 10, 17, 0, 0); // 10 janv. 2026, 18:00 à Bruxelles
const s = (sec: number) => sec * 1000;

function plan(): SessionPlan {
  return {
    id: 'plan-test',
    title: 'Séance test',
    source: 'manual',
    sets: [
      { id: 'p1', exerciseId: 'pushup', variantId: 'pushup-standard', blockId: 'b1', blockType: 'straight', role: 'work', kind: 'reps', targetReps: 10, restSeconds: 90 },
      { id: 'p2', exerciseId: 'pushup', variantId: 'pushup-standard', blockId: 'b1', blockType: 'straight', role: 'work', kind: 'reps', targetReps: 10, restSeconds: 90 },
      { id: 'h1', exerciseId: 'plank', variantId: 'plank-forearm', blockId: 'b2', blockType: 'straight', role: 'work', kind: 'hold', targetSeconds: 30, restSeconds: 60 },
    ],
  };
}

/** Petit harnais : applique des commandes à des instants précis et garde le journal. */
function harness(start = T0) {
  let n = 0;
  const events: SessionEvent[] = [];
  const run = (cmd: SessionCommand, at: number) => {
    const res = decide(project(events), cmd, { now: at, newId: () => `e${++n}`, sessionId: 'sess-1' });
    if (res.ok) events.push(...res.events);
    return res;
  };
  run({ type: 'start_session', plan: plan(), timeZone: 'Europe/Brussels' }, start);
  return { events, run, state: () => project(events)! };
}

describe('séries et résultats réels', () => {
  it('conserve un nombre de répétitions supérieur ou inférieur à la cible (scénario 3)', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    h.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: 13, rir: 1 } }, T0 + s(45));
    h.run({ type: 'start_set', plannedSetId: 'p2' }, T0 + s(130));
    h.run({ type: 'end_set', plannedSetId: 'p2' }, T0 + s(160));
    h.run({ type: 'record_result', plannedSetId: 'p2', result: { reps: 7 } }, T0 + s(165));

    const st = h.state();
    expect(currentResult(st.sets[0]!)?.reps).toBe(13);
    expect(currentResult(st.sets[1]!)?.reps).toBe(7);
    // La cible reste intacte pour l'analyse.
    expect(st.sets[0]!.planned.targetReps).toBe(10);
  });

  it('une série terminée sans saisie a un résultat inconnu, pas zéro', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    expect(currentResult(h.state().sets[0]!)).toBeUndefined();
  });

  it("une correction est tracée et l'annulation restaure la valeur précédente", () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    h.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: 10 } }, T0 + s(45));
    const wrong = h.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: 100 } }, T0 + s(50));
    expect(wrong.ok).toBe(true);
    const wrongId = wrong.ok ? wrong.events[0]!.id : '';
    h.run({ type: 'undo_result', targetEventId: wrongId }, T0 + s(52));

    const set = h.state().sets[0]!;
    expect(currentResult(set)?.reps).toBe(10);
    expect(set.entries).toHaveLength(2);
    expect(set.entries[1]!.undone).toBe(true);
  });

  it('refuse des valeurs absurdes (répétitions négatives)', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    const r = h.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: -2 } }, T0 + s(12));
    expect(r).toEqual({ ok: false, error: 'invalid_value' });
  });
});

describe('chronométrage', () => {
  it('le repos commence à la fin de la série, pas à la fin de la saisie (scénario 5)', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    h.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: 10 } }, T0 + s(70));
    const st = h.state();
    expect(st.phase).toBe('resting');
    expect(st.rests[0]!.start).toBe(T0 + s(40));
    expect(timings(st, T0 + s(100)).currentRestMs).toBe(s(60));
  });

  it('le repos dépassé continue d’être mesuré et ne lance aucune série (scénario 6)', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    const st = h.state();
    // Cible 90 s ; on regarde 5 minutes plus tard.
    expect(timings(st, T0 + s(340)).currentRestMs).toBe(s(300));
    expect(st.phase).toBe('resting');
    expect(st.sets[1]!.status).toBe('pending');
  });

  it("l'interruption est distinguée du repos (scénario 7)", () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    h.run({ type: 'start_interruption', reason: 'appel' }, T0 + s(60));
    expect(h.state().phase).toBe('interrupted');
    h.run({ type: 'end_interruption' }, T0 + s(240));
    expect(h.state().phase).toBe('resting');
    h.run({ type: 'start_set', plannedSetId: 'p2' }, T0 + s(280));

    const t = timings(h.state(), T0 + s(280));
    expect(t.interruptedMs).toBe(s(180));
    // Repos réel = 240 s écoulés − 180 s d'interruption.
    expect(t.restMs).toBe(s(60));
    expect(t.activeMs).toBe(s(30));
    expect(t.totalMs).toBe(s(280));
  });

  it('un maintien enregistre sa durée mesurée', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'h1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'h1' }, T0 + s(42));
    const set = h.state().sets[2]!;
    expect(set.endedAt! - set.startedAt!).toBe(s(32));
  });

  it('commencer plus tôt que la cible de repos est permis', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    const r = h.run({ type: 'start_set', plannedSetId: 'p2' }, T0 + s(70));
    expect(r.ok).toBe(true);
    expect(h.state().rests[0]!.end).toBe(T0 + s(70));
  });
});

describe('robustesse', () => {
  it('un double appui sur « Terminer la série » ne crée pas deux fins (scénario 8)', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    const first = h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    const second = h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40.2));
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: 'not_in_set' });
    expect(h.events.filter((e) => e.type === 'set_ended')).toHaveLength(1);
  });

  it('un double appui sur « Commencer » ne démarre pas deux séries', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    const again = h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10.1));
    expect(again.ok).toBe(false);
  });

  it('un événement rejoué avec le même identifiant est ignoré (resynchronisation)', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    const replayed = [...h.events, ...h.events];
    const st = project(replayed)!;
    expect(st.sets[0]!.status).toBe('done');
    expect(st.rests).toHaveLength(1);
  });

  it("l'état est reconstruit à l'identique depuis le journal (fermeture puis réouverture)", () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    h.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: 12 } }, T0 + s(45));
    const reopened = project(JSON.parse(JSON.stringify(h.events)))!;
    expect(reopened).toEqual(h.state());
  });
});

describe('sécurité', () => {
  it('une douleur avec arrêt termine la série en cours et bloque la suite (scénario 14)', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    const r = h.run({ type: 'report_pain', plannedSetId: 'p1', location: 'épaule droite', intensity: 6, stop: true }, T0 + s(20));
    expect(r.ok).toBe(true);
    const st = h.state();
    expect(st.safetyStop).toBe(true);
    expect(st.sets[0]!.status).toBe('done');
    expect(h.run({ type: 'start_set', plannedSetId: 'p2' }, T0 + s(60))).toEqual({ ok: false, error: 'safety_stop' });
    h.run({ type: 'end_session' }, T0 + s(70));
    expect(sessionOutcome(h.state())).toBe('stopped_for_safety');
  });

  it('une gêne signalée sans arrêt ne bloque pas la séance', () => {
    const h = harness();
    h.run({ type: 'report_pain', location: 'poignet', intensity: 2, stop: false }, T0 + s(5));
    expect(h.state().safetyStop).toBe(false);
    expect(h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10)).ok).toBe(true);
  });
});

describe('fin de séance', () => {
  it('une séance raccourcie est marquée partielle, pas complète', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    h.run({ type: 'end_session' }, T0 + s(60));
    const st = h.state();
    expect(st.phase).toBe('ended');
    expect(st.rests[0]!.end).toBe(T0 + s(60));
    expect(sessionOutcome(st)).toBe('partial');
  });

  it('terminer pendant une série clôt la série au même instant', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_session' }, T0 + s(30));
    const st = h.state();
    expect(st.sets[0]!.endedAt).toBe(T0 + s(30));
    expect(st.endedAt).toBe(T0 + s(30));
  });

  it('toutes les séries faites = séance complète', () => {
    const h = harness();
    let t = T0;
    for (const id of ['p1', 'p2', 'h1']) {
      h.run({ type: 'start_set', plannedSetId: id }, (t += s(60)));
      h.run({ type: 'end_set', plannedSetId: id }, (t += s(30)));
    }
    h.run({ type: 'end_session' }, (t += s(10)));
    expect(sessionOutcome(h.state())).toBe('completed');
  });

  it('aucune commande ne modifie une séance terminée, sauf les corrections de résultat', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    h.run({ type: 'end_session' }, T0 + s(50));
    expect(h.run({ type: 'start_set', plannedSetId: 'p2' }, T0 + s(60))).toEqual({ ok: false, error: 'session_ended' });
    expect(h.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: 9 } }, T0 + s(70)).ok).toBe(true);
  });
});

describe('fuseau horaire Europe/Brussels (scénario 21)', () => {
  it("le passage à l'heure d'hiver ne fausse ni la durée ni le jour", () => {
    // 25 oct. 2026 : à 03:00 CEST on revient à 02:00 CET (01:00 UTC).
    const start = Date.UTC(2026, 9, 24, 23, 50); // 01:50 heure locale (CEST)
    const end = Date.UTC(2026, 9, 25, 2, 10); // 03:10 heure locale (CET)
    const h = harness(start);
    h.run({ type: 'end_session' }, end);
    const st = h.state();
    expect(timings(st, end).totalMs).toBe(140 * 60 * 1000);
    expect(localDay(st.startedAt, st.timeZone)).toBe('2026-10-25');
  });

  it('une séance commencée à 23:30 heure belge appartient à ce jour-là', () => {
    const at = Date.UTC(2026, 6, 14, 21, 30); // 23:30 CEST
    expect(localDay(at, 'Europe/Brussels')).toBe('2026-07-14');
  });
});

import { lastComparable, summarizeSession } from '../src/engine/derive';

describe('bilan et comparaison', () => {
  it('le bilan distingue réalisé, passé et résultat non saisi', () => {
    const h = harness();
    h.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    h.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    h.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: 11 } }, T0 + s(45));
    h.run({ type: 'start_set', plannedSetId: 'p2' }, T0 + s(140));
    h.run({ type: 'end_set', plannedSetId: 'p2' }, T0 + s(170));
    h.run({ type: 'skip_set', plannedSetId: 'h1', reason: 'manque de temps' }, T0 + s(180));
    h.run({ type: 'end_session' }, T0 + s(190));
    const [push, plank] = summarizeSession(h.state());
    expect(push).toMatchObject({ variantId: 'pushup-standard', done: 2, missingResults: 1 });
    expect(plank).toMatchObject({ variantId: 'plank-forearm', skipped: 1 });
    expect(sessionOutcome(h.state())).toBe('partial');
  });

  it('la dernière performance comparable vient de la même variante et d’une séance antérieure', () => {
    const old = harness(T0);
    old.run({ type: 'start_set', plannedSetId: 'p1' }, T0 + s(10));
    old.run({ type: 'end_set', plannedSetId: 'p1' }, T0 + s(40));
    old.run({ type: 'record_result', plannedSetId: 'p1', result: { reps: 9 } }, T0 + s(45));
    const later = T0 + 2 * 86_400_000;
    expect(lastComparable([old.state()], 'pushup-standard', later)?.results).toEqual([{ reps: 9 }]);
    expect(lastComparable([old.state()], 'pushup-incline', later)).toBeUndefined();
    expect(lastComparable([old.state()], 'pushup-standard', T0 - 1)).toBeUndefined();
  });
});
