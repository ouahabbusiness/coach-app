// Rapport de séance et séances d'initiation (données fictives, base simulée).
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CoachDb, Repository } from '../src/storage/db';
import { decide, project } from '../src/engine/session';
import type { SessionCommand } from '../src/engine/types';
import { startSessionFromTemplate } from '../src/ui/actions';
import type { SessionTemplate } from '../src/ui/templates';
import { FEEL_LABELS, INITIATION_SESSIONS, initiationRank, sessionReport } from '../src/engine/sessionReport';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

let n = 0;
async function run(repo: Repository, sessionId: string, cmd: SessionCommand) {
  const st = project(await repo.sessionEvents(sessionId));
  const res = decide(st, cmd, { now: Date.now() + n * 1000, newId: () => `r${++n}`, sessionId });
  if (!res.ok) throw new Error(`${cmd.type}: ${res.error}`);
  await repo.append(res.events);
}

const tpl: SessionTemplate = {
  id: 'init-A',
  title: 'Force haut du corps',
  updatedAt: 0,
  lines: [{ id: 'l1', variantId: 'pullup-weighted', kind: 'reps', role: 'work', sets: 3, targetReps: 6, repRange: [6, 10], targetRir: 2, loadKg: 10, restSeconds: 90 }],
};

describe('rapport de séance', () => {
  it('séance d’initiation : précisé en tête, résultats prévu → fait, ressenti, inconnu ≠ zéro', async () => {
    const repo = new Repository(new CoachDb('rapport-1'));
    const id = await startSessionFromTemplate(repo, tpl);
    const st0 = project(await repo.sessionEvents(id))!;
    const work = st0.sets.filter((s) => s.planned.role === 'work');
    for (const [i, s] of work.entries()) {
      await run(repo, id, { type: 'start_set', plannedSetId: s.planned.id });
      await run(repo, id, { type: 'end_set', plannedSetId: s.planned.id });
      // la dernière série n'a pas de résultat saisi
      if (i < 2) await run(repo, id, { type: 'record_result', plannedSetId: s.planned.id, result: { reps: 8 + i, loadKg: 10, rir: 2 } });
    }
    await run(repo, id, { type: 'end_session' });
    const st = project(await repo.sessionEvents(id))!;
    const txt = sessionReport(st, { initiation: 1, feel: { level: 'simple', note: 'classique', at: 1 } });
    expect(txt).toMatch(/Rapport de séance · Force haut du corps/);
    expect(txt).toMatch(/Séance d'initiation 1\/3/);
    expect(txt).toMatch(/Aucune conclusion sur la progression/);
    expect(txt).toMatch(/8 · 10 kg · RIR 2 \/ 9 · 10 kg · RIR 2/);
    expect(txt).toMatch(/1 série\(s\) sans résultat saisi : inconnu, pas zéro/);
    expect(txt).toMatch(/Plutôt simple · « classique »/);
    expect(txt).toMatch(/aucun diagnostic/);
  });

  it('sans initiation ni ressenti : rien n’est inventé', async () => {
    const repo = new Repository(new CoachDb('rapport-2'));
    const id = await startSessionFromTemplate(repo, tpl);
    const st = project(await repo.sessionEvents(id))!;
    const txt = sessionReport(st);
    expect(txt).not.toMatch(/initiation/i);
    expect(txt).toMatch(/Non renseigné/);
  });
});

describe('séances d’initiation', () => {
  const s = (id: string, at: number) => ({ id, startedAt: at });
  it('les 3 premières séances enregistrées sont des séances d’initiation, dans l’ordre', () => {
    const all = [s('d', 400), s('a', 100), s('c', 300), s('b', 200)];
    expect(initiationRank(all, 'a')).toBe(1);
    expect(initiationRank(all, 'b')).toBe(2);
    expect(initiationRank(all, 'c')).toBe(3);
    expect(initiationRank(all, 'd')).toBeUndefined();
    expect(INITIATION_SESSIONS).toBe(3);
  });
  it('séance inconnue : pas d’initiation', () => {
    expect(initiationRank([s('a', 1)], 'zzz')).toBeUndefined();
  });
  it('les niveaux de ressenti ont un libellé', () => {
    expect(Object.keys(FEEL_LABELS)).toHaveLength(5);
  });
});
