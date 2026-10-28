// Répartition A/B/C (données de test fictives, base simulée).
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { redistribute, ROW_RANGE, type RLine } from '../src/engine/redistribute';
import { MUSCLE_MAP, MUSCLES } from '../src/engine/volume';
import { estimateLineMinutes } from '../src/engine/programBuilder';
import { CoachDb, Repository } from '../src/storage/db';
import { applyRedistribution } from '../src/ui/programMigration';
import type { SessionTemplate } from '../src/ui/templates';
import type { PlannedItem } from '../src/engine/planning';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const L = (variantId: string, sets: number, restSeconds = 75, extra: Partial<RLine> = {}): RLine => ({ variantId, sets, kind: 'reps', role: 'work', restSeconds, repRange: [10, 15], targetReps: 10, targetRir: 2, ...extra });
const hold = (variantId: string, sets: number): RLine => ({ variantId, sets, kind: 'hold', role: 'work', restSeconds: 45, targetSeconds: 30 });
const A = () => [L('pullup-strict', 4, 150, { repRange: [7, 10] }), L('dips-weighted', 4, 150, { repRange: [5, 8] }), L('kb-row-1arm', 3), L('leg-raise-hanging', 3)];
const B = () => [L('squat-goblet-kb', 4, 150), L('lunge-reverse', 3), L('kb-rdl', 3), L('glute-bridge-kb', 3), L('kb-swing-2h', 4, 45, { repRange: [15, 18] }), hold('hollow-hold', 3)];
const C = () => [L('chinup-strict', 4, 150), L('pushup-diamond', 3), L('kb-press-1arm', 3), L('knee-raise-hanging', 3)];

const direct = (plan: Record<string, RLine[]>) => {
  const out: Record<string, { sets: number; sessions: string }> = {};
  for (const m of MUSCLES) out[m] = { sets: 0, sessions: '' };
  for (const [k, lines] of Object.entries(plan)) for (const l of lines) for (const m of (MUSCLE_MAP as Record<string, { direct: string[] }>)[l.variantId]!.direct) { out[m]!.sets += l.sets; if (!out[m]!.sessions.includes(k)) out[m]!.sessions += k; }
  return out;
};

describe('répartition A/B/C : mêmes séries, jambes réparties, aucune séance ajoutée', () => {
  it('comptage exact selon la convention de l’app', () => {
    const before = direct({ A: A(), B: B(), C: C() });
    const r = redistribute(A(), B(), C())!;
    const after = direct({ A: r.A, B: r.B, C: r.C });
    expect(before.fessiers).toEqual({ sets: 17, sessions: 'B' });
    expect(after.fessiers).toEqual({ sets: 13, sessions: 'ABC' });
    expect(after.quadriceps).toEqual({ sets: 7, sessions: 'BC' });
    expect(before.quadriceps!.sets).toBe(7);
    expect(after.ischios).toEqual({ sets: 6, sessions: 'AB' });
    expect(after.dos).toEqual({ sets: 11, sessions: 'ABC' });
    for (const m of ['pectoraux', 'triceps', 'épaules', 'biceps', 'abdominaux'] as const) expect(after[m]!.sets).toBe(before[m]!.sets);
  });
  it('durées estimées : A 46, B 38, C 50 min, unilatéral compté des deux côtés (avant 49 / 51 / 42) ; trois séances, pas une de plus', () => {
    const r = redistribute(A(), B(), C())!;
    expect([estimateLineMinutes(r.A as never), estimateLineMinutes(r.B as never), estimateLineMinutes(r.C as never)]).toEqual([46, 38, 50]);
    expect([estimateLineMinutes(A() as never), estimateLineMinutes(B() as never), estimateLineMinutes(C() as never)]).toEqual([49, 51, 42]);
  });
  it('rowing : plage haute de calibration à 2 en réserve ; pont fessier retiré ; swings à 3', () => {
    const r = redistribute(A(), B(), C())!;
    const row = r.B.find((l) => l.variantId === 'kb-row-1arm')!;
    expect(row.repRange).toEqual(ROW_RANGE);
    expect(row.cue).toMatch(/calibration/);
    expect(r.B.some((l) => l.variantId === 'glute-bridge-kb')).toBe(false);
    expect(r.B.find((l) => l.variantId === 'kb-swing-2h')!.sets).toBe(3);
    expect(r.moves.map((m) => `${m.variantId}:${m.from}>${m.to}`)).toContain('lunge-reverse:B>C');
  });
  it('idempotent et prudent : déjà appliquée ou forme inattendue = rien', () => {
    const r = redistribute(A(), B(), C())!;
    expect(redistribute(r.A, r.B, r.C)).toBeNull();
    expect(redistribute([L('pullup-strict', 4)], B(), C())).toBeNull();
  });
});

describe('application aux séances à venir sans toucher à l’historique', () => {
  const tpl = (id: string, title: string, lines: RLine[]): SessionTemplate => ({ id, title, updatedAt: 0, lines: lines.map((l, i) => ({ ...l, id: `${id}-${i}` })) as never });
  const item = (id: string, weekStart: string, day: number, templateId: string, extra: Partial<PlannedItem> = {}): PlannedItem => ({ id, weekStart, day, start: '18:15', durationMin: 49, kind: 'seance', title: 't', templateId, moves: [], ...extra });

  it('modèles, durées et versions adaptées des séances futures ; séance faite et journal intacts', async () => {
    const repo = new Repository(new CoachDb('redistribution-1'));
    await repo.setKv('templates', [tpl('prog-A', 'A', A()), tpl('prog-B', 'B', B()), tpl('prog-C', 'C', C()), tpl('prog-T', 'T', [])]);
    await repo.setKv('program.current', { program: { templates: [{ key: 'A', title: 'A', lines: A() }, { key: 'B', title: 'B', lines: B() }, { key: 'C', title: 'C', lines: C() }], week: [{ day: 2, durationMin: 49, templateKey: 'B' }], weekly: [[{ day: 2, durationMin: 49, templateKey: 'B' }]], notes: ['Bas du corps prioritaire : pont fessier et swings ajoutés à la séance Jambes.', 'Autre note'] } });
    await repo.setKv('agenda.trips', [{ id: 't', from: '2099-01-05', to: '2099-01-10', label: 'France', equipment: ['tapis', 'banc'] }]);
    await repo.setKv('decisions.log', [{ id: 'ancien', variantId: 'x', rule: 'ancien' }]);
    await repo.setKv('planning.items', [
      item('past', '2020-01-06', 0, 'prog-A', { sessionId: 'faite', durationMin: 46 }),
      item('futureB', '2099-02-02', 2, 'prog-B'),
      item('tripB', '2099-01-05', 2, 'prog-B', { adapted: { lines: [], estimatedMin: 1, removed: ['ancien'] }, adjustment: { reason: 'deplacement', decision: 'adaptée', at: 1, note: 'France' } }),
    ]);
    expect(await applyRedistribution(repo)).toBe(3);

    const t = (await repo.getKv<SessionTemplate[]>('templates'))!;
    expect(t.find((x) => x.id === 'prog-A')!.lines.map((l) => l.variantId)).toEqual(['pullup-strict', 'dips-weighted', 'kb-rdl', 'leg-raise-hanging']);
    expect(t.find((x) => x.id === 'prog-B')!.lines.map((l) => l.variantId)).toEqual(['squat-goblet-kb', 'kb-row-1arm', 'kb-swing-2h', 'hollow-hold']);
    expect(t.find((x) => x.id === 'prog-C')!.lines.map((l) => l.variantId)).toContain('lunge-reverse');
    const items = (await repo.getKv<PlannedItem[]>('planning.items'))!;
    expect(items.find((x) => x.id === 'past')).toMatchObject({ durationMin: 46, sessionId: 'faite' }); // séance faite : inchangée
    expect(items.find((x) => x.id === 'futureB')!.durationMin).toBe(38);
    const trip = items.find((x) => x.id === 'tripB')!;
    expect(trip.adapted!.removed).not.toContain('ancien');
    expect(trip.adapted!.lines.length).toBeGreaterThan(0);
    const prog = (await repo.getKv<{ program: { notes: string[]; week: { durationMin: number }[] } }>('program.current'))!;
    expect(prog.program.notes.join(' ')).not.toMatch(/Bas du corps prioritaire/);
    expect(prog.program.notes.join(' ')).toMatch(/Orientation : Physique athlétique/);
    expect(prog.program.week[0]!.durationMin).toBe(38);
    // journal : l'ancienne entrée est conservée, la répartition y est tracée
    const log = (await repo.getKv<{ id: string; rule: string }[]>('decisions.log'))!;
    expect(log.some((e) => e.id === 'ancien')).toBe(true);
    expect(log.filter((e) => e.rule === 'programme : répartition A/B/C').length).toBeGreaterThanOrEqual(4);
    // une seule fois
    expect(await applyRedistribution(repo)).toBe(0);
  });
});
