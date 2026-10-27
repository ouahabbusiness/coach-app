// Mise à jour sur une base existante (données fictives au format des versions précédentes) :
// rien n'est supprimé ni réécrit, l'ancien programme reste utilisable, les anciennes saisies sont lues prudemment.
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CoachDb, Repository } from '../src/storage/db';
import { project } from '../src/engine/session';
import { startSessionFromTemplate } from '../src/ui/actions';
import type { SessionTemplate } from '../src/ui/templates';
import { docOf } from '../src/engine/dayPlan';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const oldTemplate: SessionTemplate = {
  id: 'old-A',
  title: 'Force haut du corps',
  updatedAt: 1,
  lines: [{ id: 'd1', variantId: 'dips-bars', kind: 'reps', role: 'work', sets: 4, targetReps: 6, repRange: [6, 12], targetRir: 1, restSeconds: 120, cue: 'Semaine 1 : 1re série = test max' }],
};

describe('mise à jour sans perte', () => {
  it('ancienne base : clés conservées, programme stocké intact, consigne « test max » remplacée à la lecture seulement', async () => {
    const repo = new Repository(new CoachDb('upgrade-1'));
    const old: Record<string, unknown> = {
      templates: [oldTemplate],
      'program.current': { id: 'p1', title: 'Mon programme' },
      'weight.log': [{ id: 'w', day: '2026-10-20', kg: 77, status: 'mesuré', fasting: true, at: 0 }],
      'intake.2026-10-20': { kcal: 2100, protein: 150, meals: 3 },
      'dayplan.eaten.2026-10-20': { midi: { label: 'Resto', kcal: 950, protein: 40 } },
      'free.log': [{ id: 'f', day: '2026-10-26', at: 0, format: 'emom', variantId: 'pullup-weighted', loadKg: 12, targetPerRound: 6, rounds: Array(12).fill(null), declaredTotal: 72 }],
    };
    for (const [k, v] of Object.entries(old)) await repo.setKv(k, v);

    const s = await startSessionFromTemplate(repo, oldTemplate);
    const plan = project(await repo.sessionEvents(s))!.plan;
    expect(plan.sets[0]!.cue).toContain('Calibration sous-maximale');

    // Rien de supprimé, rien de réécrit.
    for (const [k, v] of Object.entries(old)) expect(await repo.getKv(k), k).toEqual(v);
    // Ancien repas sans niveau : traité comme estimé (exclu), jamais comme documenté.
    expect(docOf((old['dayplan.eaten.2026-10-20'] as Record<string, { source?: never }>).midi!.source)).toBe('estimation');
  });

  it('fermeture et réouverture : une nouvelle instance relit les mêmes données', async () => {
    const a = new Repository(new CoachDb('upgrade-2'));
    await a.setKv('weight.log', [{ day: '2026-10-27', kg: 77 }]);
    const s = await startSessionFromTemplate(a, oldTemplate);
    const b = new Repository(new CoachDb('upgrade-2'));
    expect(await b.getKv('weight.log')).toEqual([{ day: '2026-10-27', kg: 77 }]);
    expect((await b.sessionEvents(s)).length).toBeGreaterThan(0);
  });
});
