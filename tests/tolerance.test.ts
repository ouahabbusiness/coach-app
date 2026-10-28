// Tolérance des mouvements et séances de voyage (données de test fictives, base simulée).
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isUpperLoaded, toleranceOf, toleratedVariants } from '../src/engine/tolerance';
import { adaptToEquipment } from '../src/engine/trip';
import { CoachDb, Repository } from '../src/storage/db';
import { refitTripSessions } from '../src/ui/programMigration';
import { startSessionFromTemplate } from '../src/ui/actions';
import { project } from '../src/engine/session';
import type { PlannedItem } from '../src/engine/planning';
import type { SessionTemplate } from '../src/ui/templates';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const ctx = (tolerated: string[] = []) => ({ triggerPatterns: ['pullup|chinup', 'dips'], tolerated: new Set(tolerated) });

describe('tolérance d’un mouvement : trois états, jamais « adapté parce que non cité »', () => {
  it('déclencheur connu / fait récemment sans douleur signalée / tolérance inconnue ; jambes et abdos non concernés', () => {
    expect(toleranceOf('pullup-strict', ctx())).toBe('declencheur');
    expect(toleranceOf('dips-bench', ctx())).toBe('declencheur');
    expect(toleranceOf('kb-row-1arm', ctx(['kb-row-1arm']))).toBe('toleree');
    expect(toleranceOf('pike-pushup', ctx(['kb-row-1arm']))).toBe('inconnue');
    expect(toleranceOf('pushup-diamond', ctx())).toBe('inconnue');
    expect(toleranceOf('lunge-reverse', ctx())).toBeUndefined();
    expect(isUpperLoaded('hollow-hold')).toBe(false);
  });
  it('« toléré » = série terminée récemment dans une séance sans douleur signalée ; une douleur ou 28 jours sans le faire l’annule', () => {
    const now = Date.UTC(2026, 10, 1);
    const day = 86_400_000;
    const s = (startedAt: number, pain: number, variantId: string, status = 'done') => ({ startedAt, pain: new Array(pain).fill({}), sets: [{ planned: { variantId, role: 'work' }, status }] });
    const t = toleratedVariants([s(now - 3 * day, 0, 'kb-row-1arm'), s(now - 2 * day, 1, 'pushup-standard'), s(now - 40 * day, 0, 'pike-pushup'), s(now - day, 0, 'dips-bars', 'pending')], now);
    expect([...t]).toEqual(['kb-row-1arm']);
  });
});

describe('séjour : jamais de remplaçant « déclencheur connu », tolérance annoncée', () => {
  const dips = { variantId: 'dips-weighted', kind: 'reps' as const, role: 'work' as const, sets: 3, restSeconds: 150 };
  const opts = { avoid: (id: string) => toleranceOf(id, ctx()) === 'declencheur', note: (id: string) => (toleranceOf(id, ctx()) === 'inconnue' ? 'tolérance inconnue' : undefined) };
  it('sans règle : dips lestés → dips aux barres impossible → dips sur banc (ancien comportement)', () => {
    const a = adaptToEquipment([dips], ['tapis', 'banc']);
    expect(a.lines[0]!.variantId).toBe('dips-bench');
  });
  it('avec ta gêne : pas de dips sur banc ; remplaçant à tolérance inconnue annoncé comme tel', () => {
    const a = adaptToEquipment([dips], ['tapis', 'banc'], opts);
    expect(a.lines[0]!.variantId).toBe('pushup-diamond');
    expect(a.removed.join(' ')).toMatch(/\(tolérance inconnue\)/);
    expect(a.lines.some((l) => l.variantId === 'dips-bench')).toBe(false);
  });
  it('seul remplaçant possible = déclencheur : retiré et dit, jamais imposé', () => {
    const a = adaptToEquipment([{ ...dips, variantId: 'dips-bars' }], ['tapis', 'banc'], { avoid: (id) => id === 'dips-bench' || id === 'pushup-diamond' });
    expect(a.lines).toHaveLength(0);
    expect(a.removed.join(' ')).toMatch(/geste déclencheur : à choisir avec toi/);
  });
});

describe('séances de voyage déjà adaptées : refaites une fois, dates et matériel de chaque séance', () => {
  const line = (variantId: string, sets = 3) => ({ id: variantId, variantId, kind: 'reps' as const, role: 'work' as const, sets, restSeconds: 75 });
  const tpl = (id: string, lines: ReturnType<typeof line>[]): SessionTemplate => ({ id, title: id, updatedAt: 0, lines });
  const item = (id: string, weekStart: string, day: number, templateId: string, extra: Partial<PlannedItem> = {}): PlannedItem => ({ id, weekStart, day, start: '18:15', durationMin: 40, kind: 'seance', title: id, templateId, moves: [], adapted: { lines: [], estimatedMin: 1, removed: ['ancien'] }, adjustment: { reason: 'deplacement', decision: 'adaptée', at: 1, note: 'France' }, ...extra });

  it('seules les séances DANS le séjour sont touchées (séjour 3 → 10 ; la séance du lundi 2 ne l’est pas)', async () => {
    const repo = new Repository(new CoachDb('tolerance-refit'));
    await repo.setKv('templates', [tpl('prog-A', [line('dips-weighted'), line('lunge-reverse')])]);
    await repo.setKv('agenda.trips', [{ id: 't', from: '2099-11-03', to: '2099-11-10', label: 'France', equipment: ['tapis', 'banc'] }]);
    await repo.setKv('profile.complement', { joints: [{ zone: 'coudes', triggers: ['dips'], alerts: [] }] });
    await repo.setKv('planning.items', [
      item('lundi-2', '2099-10-26', 0, 'prog-A', { adapted: undefined, adjustment: undefined }), // lundi 26/10 + 0 : avant le séjour
      item('mardi-3', '2099-11-02', 1, 'prog-A'), // mardi 3/11 : dans le séjour
    ]);
    expect(await refitTripSessions(repo)).toBe(1);
    const items = (await repo.getKv<PlannedItem[]>('planning.items'))!;
    const inTrip = items.find((x) => x.id === 'mardi-3')!;
    expect(inTrip.adapted!.lines.map((l) => l.variantId)).toEqual(['pushup-diamond', 'lunge-reverse']);
    expect(inTrip.adapted!.removed.join(' ')).toMatch(/tolérance inconnue/);
    expect(items.find((x) => x.id === 'lundi-2')!.adapted).toBeUndefined();
    expect(await refitTripSessions(repo)).toBe(0); // une seule fois
  });
});

describe('au lancement : tolérance inconnue = prudence de départ', () => {
  it('mouvement du haut du corps jamais fait : marge de 3 et une série de moins ; fait sans douleur signalée : prescription normale', async () => {
    const repo = new Repository(new CoachDb('tolerance-launch'));
    await repo.setKv('joint.adapt', { patterns: ['dips'], tests: ['dips'], at: 1 });
    const t: SessionTemplate = {
      id: 'C',
      title: 'C',
      updatedAt: 0,
      lines: [
        { id: 'a', variantId: 'pushup-diamond', kind: 'reps', role: 'work', sets: 3, restSeconds: 75, repRange: [10, 15], targetReps: 10, targetRir: 2 },
        { id: 'b', variantId: 'lunge-reverse', kind: 'reps', role: 'work', sets: 3, restSeconds: 75, repRange: [10, 15], targetReps: 10, targetRir: 2 },
      ],
    };
    const first = project(await repo.sessionEvents(await startSessionFromTemplate(repo, t)))!;
    const push = first.sets.filter((s) => s.planned.variantId === 'pushup-diamond');
    expect(push).toHaveLength(2);
    expect(push[0]!.planned).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    // les jambes ne sont pas concernées
    expect(first.sets.filter((s) => s.planned.variantId === 'lunge-reverse')).toHaveLength(3);
  });
});
