// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { NOVEMBER_2026, dayRange, habitStatus, summarizeHabits, summarizeWeeks, weekStart, type Entries } from '../src/engine/challenge';

const sleep = NOVEMBER_2026.daily.find((h) => h.id === 'sleep')!;
const steps = NOVEMBER_2026.daily.find((h) => h.id === 'steps')!;
const water = NOVEMBER_2026.daily.find((h) => h.id === 'water_only')!;

describe('défi de novembre', () => {
  it('couvre les 30 jours de novembre', () => {
    const days = dayRange(NOVEMBER_2026.start, NOVEMBER_2026.end);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-11-01');
    expect(days.at(-1)).toBe('2026-11-30');
  });

  it('une journée sans saisie est non renseignée, pas ratée', () => {
    expect(habitStatus(water, undefined)).toBe('unknown');
    const s = summarizeHabits(NOVEMBER_2026, {}, '2026-11-03');
    expect(s.find((x) => x.id === 'water_only')).toEqual({ id: 'water_only', done: 0, notDone: 0, unknown: 3, excused: 0 });
  });

  it('les seuils numériques sont appliqués (7 h de sommeil, 10 000 pas)', () => {
    const e = (v: number, id: string) => ({ values: { [id]: v }, updatedAt: 0 });
    expect(habitStatus(sleep, e(6.5, 'sleep'))).toBe('not_done');
    expect(habitStatus(sleep, e(7, 'sleep'))).toBe('done');
    expect(habitStatus(steps, e(9999, 'steps'))).toBe('not_done');
    expect(habitStatus(steps, e(10000, 'steps'))).toBe('done');
  });

  it('un jour excusé (maladie, blessure) ne compte pas comme manqué', () => {
    const entries: Entries = { '2026-11-02': { values: { water_only: false }, excused: true, updatedAt: 0 } };
    const s = summarizeHabits(NOVEMBER_2026, entries, '2026-11-02').find((x) => x.id === 'water_only')!;
    expect(s.notDone).toBe(0);
    expect(s.excused).toBe(1);
  });

  it('les jours futurs ne sont pas comptés', () => {
    const s = summarizeHabits(NOVEMBER_2026, {}, '2026-10-26');
    expect(s[0]!.unknown).toBe(0);
  });

  it('les semaines commencent le lundi ; le 1er novembre 2026 (dimanche) forme une semaine partielle', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    const weeks = summarizeWeeks(NOVEMBER_2026, {}, new Set());
    expect(weeks[0]).toMatchObject({ weekStart: '2026-10-26', partial: true, days: ['2026-11-01'] });
    expect(weeks[1]!.days).toHaveLength(7);
    expect(weeks.at(-1)).toMatchObject({ weekStart: '2026-11-30', partial: true });
  });

  it('une séance enregistrée dans l’app compte pour la salle ; la course est déclarée', () => {
    const entries: Entries = {
      '2026-11-03': { values: { run: true }, updatedAt: 0 },
      '2026-11-04': { values: { gym: true }, updatedAt: 0 },
    };
    const w = summarizeWeeks(NOVEMBER_2026, entries, new Set(['2026-11-02', '2026-11-04']))[1]!;
    // Le 4 : séance app + case cochée = un seul jour compté.
    expect(w.counts).toEqual({ gym: 2, run: 1 });
  });
});
