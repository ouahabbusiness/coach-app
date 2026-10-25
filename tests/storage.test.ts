// Données de test fictives.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CoachDb, Repository } from '../src/storage/db';
import { decide, project } from '../src/engine/session';
import { currentResult } from '../src/engine/derive';
import type { SessionCommand, SessionEvent, SessionPlan } from '../src/engine/types';

const T0 = Date.UTC(2026, 0, 10, 17, 0, 0);
const plan: SessionPlan = {
  id: 'plan',
  title: 'Séance test',
  source: 'manual',
  sets: [
    { id: 'p1', exerciseId: 'pushup', variantId: 'pushup-standard', blockId: 'b1', blockType: 'straight', role: 'work', kind: 'reps', targetReps: 10, restSeconds: 90 },
    { id: 'p2', exerciseId: 'pushup', variantId: 'pushup-standard', blockId: 'b1', blockType: 'straight', role: 'work', kind: 'reps', targetReps: 10, restSeconds: 90 },
  ],
};

let n = 0;
let dbName = '';

async function run(repo: Repository, sessionId: string, cmd: SessionCommand, at: number) {
  const state = project(await repo.sessionEvents(sessionId));
  const res = decide(state, cmd, { now: at, newId: () => `${sessionId}-e${++n}`, sessionId });
  if (!res.ok) throw new Error(res.error);
  await repo.append(res.events);
  return res.events;
}

beforeEach(() => {
  dbName = `test-${Math.random()}`;
});

describe('persistance', () => {
  it('le résultat réel survit à la fermeture et à la réouverture (scénario 4)', async () => {
    const repo = new Repository(new CoachDb(dbName));
    await run(repo, 's1', { type: 'start_session', plan, timeZone: 'Europe/Brussels' }, T0);
    await run(repo, 's1', { type: 'start_set', plannedSetId: 'p1' }, T0 + 10_000);
    await run(repo, 's1', { type: 'end_set', plannedSetId: 'p1' }, T0 + 40_000);
    await run(repo, 's1', { type: 'record_result', plannedSetId: 'p1', result: { reps: 12 } }, T0 + 45_000);

    // « Réouverture » : nouvelle connexion à la même base.
    const reopened = new Repository(new CoachDb(dbName));
    const st = project(await reopened.sessionEvents('s1'))!;
    expect(currentResult(st.sets[0]!)?.reps).toBe(12);
    expect(st.phase).toBe('resting');
    expect((await reopened.openSession())?.id).toBe('s1');
  });

  it('rejouer un même lot ne crée pas de doublon (scénario 9, côté local)', async () => {
    const repo = new Repository(new CoachDb(dbName));
    const events = await run(repo, 's1', { type: 'start_session', plan, timeZone: 'Europe/Brussels' }, T0);
    const added = await repo.append(events);
    expect(added).toBe(0);
    expect(await repo.sessionEvents('s1')).toHaveLength(1);
  });

  it('une séance terminée sort de « séance en cours » et apparaît dans l’historique', async () => {
    const repo = new Repository(new CoachDb(dbName));
    await run(repo, 's1', { type: 'start_session', plan, timeZone: 'Europe/Brussels' }, T0);
    await run(repo, 's1', { type: 'end_session' }, T0 + 60_000);
    expect(await repo.openSession()).toBeUndefined();
    const list = await repo.listSessions();
    expect(list[0]).toMatchObject({ id: 's1', outcome: 'partial' });
  });
});

describe('export et import (scénario 19)', () => {
  it('un export réimporté dans une base vide restitue les mêmes séances', async () => {
    const repo = new Repository(new CoachDb(dbName));
    await run(repo, 's1', { type: 'start_session', plan, timeZone: 'Europe/Brussels' }, T0);
    await run(repo, 's1', { type: 'start_set', plannedSetId: 'p1' }, T0 + 10_000);
    await run(repo, 's1', { type: 'end_set', plannedSetId: 'p1' }, T0 + 40_000);
    await run(repo, 's1', { type: 'record_result', plannedSetId: 'p1', result: { reps: 8, rir: 2 } }, T0 + 45_000);
    await repo.setKv('onboarding', { step: 3 });

    const file = JSON.parse(JSON.stringify(await repo.exportAll()));
    const fresh = new Repository(new CoachDb(`${dbName}-fresh`));
    const res = await fresh.importAll(file);
    expect(res.events).toBe(4);
    const st = project(await fresh.sessionEvents('s1'))!;
    expect(currentResult(st.sets[0]!)).toEqual({ reps: 8, rir: 2 });
    expect(await fresh.getKv('onboarding')).toEqual({ step: 3 });

    // Réimporter le même fichier n'ajoute rien.
    expect((await fresh.importAll(file)).events).toBe(0);
  });

  it('refuse un fichier qui n’est pas un export de l’application', async () => {
    const repo = new Repository(new CoachDb(dbName));
    await expect(repo.importAll({ hello: 'world' })).rejects.toThrow(/non reconnu/);
    const events = [{ nope: true }] as unknown as SessionEvent[];
    await expect(repo.importAll({ format: 'coach-app-export', version: 1, events, kv: [] })).rejects.toThrow();
  });
});
