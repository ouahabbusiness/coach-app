// Audit automatique : tout hôte contacté par le code doit figurer dans le registre des flux. Données fictives.
import 'fake-indexeddb/auto';
// @ts-ignore -- modules Node disponibles pendant les tests (types Node non installés)
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, FLOWS, declaredHosts, isGranted, withConsent } from '../src/engine/privacy';
import { CoachDb, Repository } from '../src/storage/db';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f: string) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

describe('protection des données', () => {
  it('chaque hôte appelé dans le code est déclaré (et rien d’autre que le registre)', () => {
    const hosts = new Set<string>();
    for (const f of [...files('src'), 'index.html', ...files('public')]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.add(m[1]!.toLowerCase());
    }
    hosts.delete('www.w3.org');
    const declared = new Set(declaredHosts());
    expect([...hosts].filter((h) => !declared.has(h))).toEqual([]);
  });

  it('les flux qui quittent l’appareil demandent un accord', () => {
    for (const f of Object.values(FLOWS)) if (f.hosts.length) expect(f.consent, f.key).toBe(true);
  });

  it('accord daté, versionné, révocable', () => {
    let c = withConsent({}, 'food', true, new Date('2026-10-26T10:00:00Z'));
    expect(isGranted(c, 'food')).toBe(true);
    expect(c.food).toEqual({ granted: true, at: '2026-10-26T10:00:00.000Z', version: CONSENT_VERSION });
    c = withConsent(c, 'food', false);
    expect(isGranted(c, 'food')).toBe(false);
    expect(isGranted({ food: { granted: true, at: '', version: CONSENT_VERSION - 1 } }, 'food')).toBe(false);
  });

  it('suppression : tout est effacé et vérifié vide, export complet avant', async () => {
    const repo = new Repository(new CoachDb('privacy-del'));
    await repo.setKv('weight.log', [{ day: '2026-10-26', kg: 77 }]);
    await repo.setKv('proof.2026-10-26', { photo: 'data:image/jpeg;base64,xx' });
    const exp = await repo.exportAll();
    expect(exp.kv.map((r) => r.key).sort()).toEqual(['proof.2026-10-26', 'weight.log']);
    expect(await repo.deleteAll()).toEqual({ events: 0, sessions: 0, kv: 0 });
    expect(await repo.getKv('weight.log')).toBeUndefined();
  });
});
