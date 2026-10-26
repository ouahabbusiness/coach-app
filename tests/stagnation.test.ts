// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { deloadLine, deloadProposal, deloadSets, trendOf, type Perf } from '../src/engine/stagnation';

const p = (day: string, load: number, reps: number): Perf => ({ day, load, reps, rirKnown: true });

describe('stagnation et récupération', () => {
  it('une seule mauvaise séance (ou < 14 jours) → aucune conclusion', () => {
    expect(trendOf([p('2026-11-02', 12, 8), p('2026-11-05', 12, 5)]).trend).toBe('insuffisant');
    expect(trendOf([p('2026-11-02', 12, 8), p('2026-11-05', 12, 8), p('2026-11-09', 12, 6)]).trend).toBe('insuffisant');
  });

  it('progrès, stable, baisse sur ≥ 3 séances comparables / 14 jours', () => {
    expect(trendOf([p('2026-11-02', 12, 8), p('2026-11-09', 12, 9), p('2026-11-16', 12, 10)], 77).trend).toBe('progrès');
    expect(trendOf([p('2026-11-02', 12, 8), p('2026-11-09', 12, 8), p('2026-11-16', 12, 8)], 77).trend).toBe('stable');
    expect(trendOf([p('2026-11-02', 12, 10), p('2026-11-09', 12, 8), p('2026-11-16', 12, 5)], 77).trend).toBe('baisse');
  });

  it('pas de phase allégée si le vrai problème est ailleurs : régularité ou réserve non notée', () => {
    const t = [{ name: 'Tractions lestées', trend: 'stable' as const }, { name: 'Dips', trend: 'stable' as const }];
    const r1 = deloadProposal(t, { tiredDays: 0, done: 4, planned: 8, rirNotedRatio: 0.9 });
    expect(r1.propose).toBe(false);
    expect(r1.first[0]).toContain('Régularité');
    expect(deloadProposal(t, { tiredDays: 0, done: 8, planned: 8, rirNotedRatio: 0.2 }).first[0]).toContain('réserve');
  });

  it('deux exercices bloqués, régulier, données correctes → phase allégée proposée (à valider)', () => {
    const t = [{ name: 'Tractions lestées', trend: 'stable' as const }, { name: 'Dips', trend: 'baisse' as const }];
    expect(deloadProposal(t, { tiredDays: 1, done: 8, planned: 8, rirNotedRatio: 0.9 }).propose).toBe(true);
  });

  it('phase allégée : ≈ 40 % de séries en moins (jamais 0), +1 rép. en réserve, pas d’échec', () => {
    expect(deloadLine({ sets: 4, targetRir: 1, lastSetToFailure: true })).toEqual({ sets: 2, targetRir: 2, lastSetToFailure: false });
    expect(deloadLine({ sets: 1, targetRir: 2 }).sets).toBe(1);
  });

  it('plan allégé : échauffements gardés, 4 séries → 2, 1 série → 1, réserve +1', () => {
    const s = (blockId: string, role: string) => ({ blockId, role, targetRir: 2, lastSetToFailure: true });
    const out = deloadSets([s('a', 'warmup'), s('a', 'work'), s('a', 'work'), s('a', 'work'), s('a', 'work'), s('b', 'work')], 'allégée');
    expect(out.filter((x) => x.blockId === 'a' && x.role === 'work')).toHaveLength(2);
    expect(out.filter((x) => x.role === 'warmup')).toHaveLength(1);
    expect(out.filter((x) => x.blockId === 'b')).toHaveLength(1);
    expect(out.every((x) => x.role !== 'work' || (x.targetRir === 3 && !x.lastSetToFailure))).toBe(true);
  });
});
