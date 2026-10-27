// Parcours complet sur une base IndexedDB simulée (données fictives, séparées de tout dossier réel) :
// prescription → saisie réelle → sauvegarde → décision → prochaine prescription → redémarrage → conservation.
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CoachDb, Repository } from '../src/storage/db';
import { decide, project } from '../src/engine/session';
import type { SessionCommand, SetResult } from '../src/engine/types';
import { startSessionFromTemplate } from '../src/ui/actions';
import { loadJournal } from '../src/ui/journal';
import { acceptDeload, recoveryReport } from '../src/ui/deload';
import type { SessionTemplate } from '../src/ui/templates';

// Node 18 : `crypto` n'est pas global (il l'est dans le navigateur).
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

let n = 0;
async function run(repo: Repository, sessionId: string, cmd: SessionCommand) {
  const st = project(await repo.sessionEvents(sessionId));
  const res = decide(st, cmd, { now: Date.now() + n * 1000, newId: () => `e${++n}`, sessionId });
  if (!res.ok) throw new Error(`${cmd.type}: ${res.error}`);
  await repo.append(res.events);
}

/** Fait une séance : pour chaque série, un résultat (ou « skip » avec une raison). */
async function doSession(repo: Repository, sessionId: string, perSet: (SetResult | { skip: string })[]) {
  const st = project(await repo.sessionEvents(sessionId))!;
  const work = st.sets.filter((s) => s.planned.role === 'work');
  for (const [i, s] of work.entries()) {
    const r = perSet[i];
    if (!r) continue;
    if ('skip' in r) {
      await run(repo, sessionId, { type: 'skip_set', plannedSetId: s.planned.id, reason: r.skip });
      continue;
    }
    await run(repo, sessionId, { type: 'start_set', plannedSetId: s.planned.id });
    await run(repo, sessionId, { type: 'end_set', plannedSetId: s.planned.id });
    await run(repo, sessionId, { type: 'record_result', plannedSetId: s.planned.id, result: r });
  }
  await run(repo, sessionId, { type: 'end_session' });
}

const tpl: SessionTemplate = {
  id: 'prog-A',
  title: 'Force haut du corps',
  updatedAt: 0,
  lines: [{ id: 'l1', variantId: 'pullup-weighted', kind: 'reps', role: 'work', sets: 3, targetReps: 6, repRange: [6, 10], targetRir: 2, loadKg: 10, restSeconds: 150 }],
};

async function freshRepo(name: string) {
  const repo = new Repository(new CoachDb(name));
  await repo.setKv('weight.log', [{ id: 'w', day: '2026-10-25', kg: 77, status: 'mesuré', fasting: true, at: 0 }]);
  return repo;
}

const planOf = async (repo: Repository, id: string) => project(await repo.sessionEvents(id))!.plan.sets.filter((s) => s.role === 'work');

describe('parcours complet du coach', () => {
  it('haut de plage + réserve conforme → la séance suivante passe au palier réel (10 → 11 kg), décision journalisée, conservée après redémarrage', async () => {
    const repo = await freshRepo('journey-1');
    const s1 = await startSessionFromTemplate(repo, tpl);
    expect((await planOf(repo, s1)).map((s) => s.loadKg)).toEqual([10, 10, 10]);
    await doSession(repo, s1, [{ reps: 10, rir: 2, loadKg: 10 }, { reps: 10, rir: 2, loadKg: 10 }, { reps: 10, rir: 2, loadKg: 10 }]);

    const s2 = await startSessionFromTemplate(repo, tpl);
    expect((await planOf(repo, s2)).map((s) => [s.loadKg, s.targetReps])).toEqual([[11, 6], [11, 6], [11, 6]]);
    const j = await loadJournal(repo);
    expect(j.at(-1)).toMatchObject({ action: 'augmenter', rule: 'double progression', variantId: 'pullup-weighted' });

    // Redémarrage : nouvelle instance sur la même base.
    const again = new Repository(new CoachDb('journey-1'));
    expect((await planOf(again, s2)).map((s) => s.loadKg)).toEqual([11, 11, 11]);
    expect((await loadJournal(again)).length).toBe(j.length);
  });

  it('séance partielle (2/3, une série passée par l’utilisateur) → aucune progression', async () => {
    const repo = await freshRepo('journey-2');
    const s1 = await startSessionFromTemplate(repo, tpl);
    await doSession(repo, s1, [{ reps: 10, rir: 2, loadKg: 10 }, { reps: 10, rir: 2, loadKg: 10 }, { skip: 'pas le temps' }]);
    const s2 = await startSessionFromTemplate(repo, tpl);
    expect((await planOf(repo, s2)).every((s) => s.loadKg === 10)).toBe(true);
    expect((await loadJournal(repo)).at(-1)?.rule).toBe('séance partielle');
  });

  it('série retirée par le coach ≠ échec : 2/2 séries demandées réussies → progression', async () => {
    const repo = await freshRepo('journey-3');
    const s1 = await startSessionFromTemplate(repo, tpl);
    await doSession(repo, s1, [{ reps: 10, rir: 2, loadKg: 10 }, { reps: 10, rir: 2, loadKg: 10 }, { skip: 'retirée par le coach' }]);
    const s2 = await startSessionFromTemplate(repo, tpl);
    expect((await planOf(repo, s2))[0]!.loadKg).toBe(11);
  });

  it('séance allégée par le contrôle avant séance → non comparable : ni progrès ni échec', async () => {
    const repo = await freshRepo('journey-4');
    const s1 = await startSessionFromTemplate(repo, tpl);
    await repo.setKv(`readiness.${s1}`, { d: { decision: 'adaptée' } });
    await doSession(repo, s1, [{ reps: 4, rir: 0, loadKg: 10 }, { reps: 4, rir: 0, loadKg: 10 }, { reps: 4, rir: 0, loadKg: 10 }]);
    const s2 = await startSessionFromTemplate(repo, tpl);
    expect((await planOf(repo, s2)).every((s) => s.loadKg === 10)).toBe(true);
    expect((await loadJournal(repo)).at(-1)?.rule).toBe('séance non comparable');
  });

  it('réserve absente → pas de progression sur une seule séance (donnée absente ≠ réussite)', async () => {
    const repo = await freshRepo('journey-5');
    const s1 = await startSessionFromTemplate(repo, tpl);
    await doSession(repo, s1, [{ reps: 10, loadKg: 10 }, { reps: 10, loadKg: 10 }, { reps: 10, loadKg: 10 }]);
    const s2 = await startSessionFromTemplate(repo, tpl);
    expect((await planOf(repo, s2)).every((s) => s.loadKg === 10)).toBe(true);
    expect((await loadJournal(repo)).at(-1)?.missing).toContain('réserve (RIR)');
  });

  it('stagnation sur 3 séances comparables / 14 jours (2 exercices) → phase allégée proposée ; validée → séries réduites, réserve +1, puis réévaluation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const repo = await freshRepo('journey-deload');
      const two: SessionTemplate = { ...tpl, id: 'prog-B', lines: [...tpl.lines, { ...tpl.lines[0]!, id: 'l2', variantId: 'dips-weighted' }] };
      const same = { reps: 8, rir: 2, loadKg: 10 };
      // Une seule séance : aucune conclusion.
      vi.setSystemTime(new Date('2026-11-02T18:00:00'));
      await doSession(repo, await startSessionFromTemplate(repo, two), Array(6).fill(same));
      expect((await recoveryReport(repo)).proposal.propose).toBe(false);
      for (const d of ['2026-11-09', '2026-11-16']) {
        vi.setSystemTime(new Date(`${d}T18:00:00`));
        await doSession(repo, await startSessionFromTemplate(repo, two), Array(6).fill(same));
      }
      // Blocage sans fatigue observée : pas d'allègement (la cause n'est pas la fatigue).
      let rep = await recoveryReport(repo);
      expect(rep.trends.map((t) => t.trend)).toEqual(['stable', 'stable']);
      expect(rep.proposal.propose).toBe(false);
      expect(rep.proposal.first[0]).toContain('sans fatigue');
      // Fatigue déclarée 3 jours sur 14 → allègement proposé (à valider).
      await repo.setKv('readiness.log', ['2026-11-10', '2026-11-12', '2026-11-14'].map((day) => ({ day, tired: true })));
      rep = await recoveryReport(repo);
      expect(rep.proposal.propose).toBe(true);

      await acceptDeload(repo, rep.proposal.reasons);
      vi.setSystemTime(new Date('2026-11-18T18:00:00'));
      const s = await startSessionFromTemplate(repo, two);
      const work = await planOf(repo, s);
      expect(work).toHaveLength(4);
      expect(work.every((x) => x.targetRir === 3 && x.loadKg === 10)).toBe(true);
      // Pendant la phase : pas de nouvelle proposition. Après : réévaluation.
      expect((await recoveryReport(repo)).proposal.propose).toBe(false);
      vi.setSystemTime(new Date('2026-11-24T18:00:00'));
      expect((await recoveryReport(repo)).reevaluate).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('transition de charge (kettlebell 12 → 16 kg, saut > 10 %) : 1 essai réussi → 2 séries sur 3 à 16 ; tenues → toutes ; essai raté → retour à 12', async () => {
    const kb: SessionTemplate = { id: 'prog-KB', title: 'Rowing', updatedAt: 0, lines: [{ id: 'k1', variantId: 'kb-row-1arm', kind: 'reps', role: 'work', sets: 3, targetReps: 10, repRange: [10, 15], targetRir: 2, loadKg: 12, restSeconds: 90 }] };
    for (const [name, testReps, expected] of [['journey-tr-ok', 10, [16, 16, 12]], ['journey-tr-ko', 7, [12, 12, 12]]] as const) {
      const repo = await freshRepo(name);
      await repo.setKv('equipment.kettlebells', [6, 12, 16]);
      const s1 = await startSessionFromTemplate(repo, kb);
      await doSession(repo, s1, Array(3).fill({ reps: 15, rir: 2, loadKg: 12 }));
      const s2 = await startSessionFromTemplate(repo, kb);
      // Seule la 1re série passe à la charge d'essai.
      expect((await planOf(repo, s2)).map((x) => x.loadKg)).toEqual([16, 12, 12]);
      expect((await loadJournal(repo)).at(-1)).toMatchObject({ action: 'transition', rule: 'transition de charge' });
      await doSession(repo, s2, [{ reps: testReps, rir: 2, loadKg: 16 }, { reps: 15, rir: 2, loadKg: 12 }, { reps: 15, rir: 2, loadKg: 12 }]);
      const s3 = await startSessionFromTemplate(repo, kb);
      expect((await planOf(repo, s3)).map((x) => x.loadKg)).toEqual(expected);
      expect((await loadJournal(repo)).at(-1)?.rule).toBe(testReps >= 10 ? 'transition : étape suivante' : 'transition non confirmée');
      if (testReps >= 10) {
        // Les 2 séries à 16 kg tenues dans la même séance → toutes les séries passent à 16 kg.
        await doSession(repo, s3, [{ reps: 10, rir: 2, loadKg: 16 }, { reps: 10, rir: 2, loadKg: 16 }, { reps: 15, rir: 2, loadKg: 12 }]);
        const s4 = await startSessionFromTemplate(repo, kb);
        expect((await planOf(repo, s4)).map((x) => x.loadKg)).toEqual([16, 16, 16]);
        expect((await loadJournal(repo)).at(-1)?.rule).toBe('transition confirmée');
        continue;
      }
      // Idempotence : relancer la même décision ne duplique pas le journal.
      const n = (await loadJournal(repo)).length;
      await startSessionFromTemplate(repo, kb);
      expect((await loadJournal(repo)).filter((e) => e.rule.startsWith('transition')).length).toBeLessThanOrEqual(n);
    }
  });
});
