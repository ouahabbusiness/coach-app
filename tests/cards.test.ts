// Fiches « Mes séances » : l'aperçu affiché = la prescription appliquée au lancement (base fictive, rien n'est écrit par l'aperçu).
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decide, project } from '../src/engine/session';
import { CoachDb, Repository } from '../src/storage/db';
import { previewTemplate, startSessionFromTemplate } from '../src/ui/actions';
import type { SessionCommand } from '../src/engine/types';
import type { SessionTemplate } from '../src/ui/templates';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

let n = 0;
async function run(repo: Repository, sessionId: string, cmd: SessionCommand) {
  const st = project(await repo.sessionEvents(sessionId));
  const res = decide(st, cmd, { now: Date.now() + n * 1000, newId: () => `c${++n}`, sessionId });
  if (!res.ok) throw new Error(`${cmd.type}: ${res.error}`);
  await repo.append(res.events);
}
async function perform(repo: Repository, id: string, variantId: string, reps: number, rir: number) {
  for (const s of project(await repo.sessionEvents(id))!.sets.filter((x) => x.planned.variantId === variantId)) {
    await run(repo, id, { type: 'start_set', plannedSetId: s.planned.id });
    await run(repo, id, { type: 'end_set', plannedSetId: s.planned.id });
    await run(repo, id, { type: 'record_result', plannedSetId: s.planned.id, result: { reps, rir, loadKg: s.planned.loadKg } });
  }
}

const dips = (loadKg: number) => ({ id: 'd', variantId: 'dips-weighted', kind: 'reps' as const, role: 'work' as const, sets: 3, restSeconds: 150, repRange: [5, 8] as [number, number], targetReps: 5, targetRir: 2, loadKg });
const tpl = (loadKg: number): SessionTemplate => ({ id: 'prog-A', title: 'A', updatedAt: 0, lines: [dips(loadKg)] });
const sig = (sets: { variantId: string; loadKg?: number; targetRir?: number; repRange?: [number, number]; role: string; progression?: string }[]) => sets.map((s) => `${s.variantId}|${s.loadKg ?? '-'}|${s.targetRir ?? '-'}|${s.repRange?.join('-') ?? '-'}|${s.role}|${s.progression ?? ''}`);

describe('fiche = prescription au lancement', () => {
  it('charge réellement faite (+12 kg) conservée, jamais retour à la charge du modèle (+5 kg), avec ou sans gêne déclarée', async () => {
    for (const declared of [false, true]) {
      const repo = new Repository(new CoachDb(`cards-${declared}`));
      if (declared) {
        await repo.setKv('profile.complement', { joints: [{ zone: 'epaule', triggers: ['dips'], alerts: [] }] });
        await repo.setKv('joint.adapt', { patterns: ['dips'], tests: ['dips'], at: 1 });
      }
      const s0 = await startSessionFromTemplate(repo, tpl(12));
      await perform(repo, s0, 'dips-weighted', 6, 2);
      await run(repo, s0, { type: 'end_session' });

      const preview = await previewTemplate(repo, tpl(5)); // modèle de base resté à +5 kg
      const before = (await repo.allSessionEvents()).size;
      const launched = project(await repo.sessionEvents(await startSessionFromTemplate(repo, tpl(5))))!;
      expect((await repo.allSessionEvents()).size).toBe(before + 1);
      // même prescription affichée et exécutée
      expect(sig(preview.sets)).toEqual(sig(launched.sets.map((s) => s.planned)));
      // et c'est la charge réelle
      expect(Math.min(...launched.sets.map((s) => s.planned.loadKg ?? 0))).toBeGreaterThanOrEqual(12);
    }
  });

  it('séance faite AVANT la déclaration de gêne (RIR 2, +12 kg) : la prescription adaptée (RIR 3) garde +12 kg, pas +5 kg du modèle', async () => {
    const repo = new Repository(new CoachDb('cards-before'));
    const s0 = await startSessionFromTemplate(repo, tpl(12));
    await perform(repo, s0, 'dips-weighted', 6, 2);
    await run(repo, s0, { type: 'end_session' });
    await repo.setKv('profile.complement', { joints: [{ zone: 'epaule', triggers: ['dips'], alerts: [] }] });
    await repo.setKv('joint.adapt', { patterns: ['dips'], tests: ['dips'], at: 1 });
    const preview = await previewTemplate(repo, tpl(5));
    const launched = project(await repo.sessionEvents(await startSessionFromTemplate(repo, tpl(5))))!;
    expect(sig(preview.sets)).toEqual(sig(launched.sets.map((s) => s.planned)));
    expect(launched.sets.map((s) => s.planned.loadKg)).toEqual(launched.sets.map(() => 12));
  });

  it('l’aperçu n’écrit rien : ni séance ni journal des décisions', async () => {
    const repo = new Repository(new CoachDb('cards-dry'));
    const s0 = await startSessionFromTemplate(repo, tpl(12));
    await perform(repo, s0, 'dips-weighted', 6, 2);
    await run(repo, s0, { type: 'end_session' });
    const log = JSON.stringify(await repo.getKv('decisions.log'));
    const events = (await repo.allSessionEvents()).size;
    await previewTemplate(repo, tpl(5));
    expect(JSON.stringify(await repo.getKv('decisions.log'))).toBe(log);
    expect((await repo.allSessionEvents()).size).toBe(events);
  });
});
