// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { habitStatus, NOVEMBER_2026 } from '../src/engine/challenge';
import { takenOnDay, withProofs, type Proof } from '../src/engine/proof';

const p = (habitId: string): Proof => ({ habitId, photo: 'data:', takenAt: 1, savedAt: 1 });
const habit = (id: string) => NOVEMBER_2026.daily.find((h) => h.id === id)!;

describe('preuves', () => {
  it('un objectif réussi sans photo redevient non renseigné', () => {
    const v = withProofs({ water_only: true, journal: true, steps: 12000, run: true }, { journal: p('journal') });
    expect(habitStatus(habit('water_only'), { values: v, updatedAt: 0 })).toBe('unknown');
    expect(habitStatus(habit('steps'), { values: v, updatedAt: 0 })).toBe('unknown');
    expect(habitStatus(habit('journal'), { values: v, updatedAt: 0 })).toBe('done');
    expect(v.run).toBeUndefined();
  });

  it('un échec déclaré reste un échec, sans photo', () => {
    const v = withProofs({ no_junk: false, sleep: 5.5 }, undefined);
    expect(v).toEqual({ no_junk: false, sleep: 5.5 });
  });

  it('photo refusée si elle n’est pas du jour', () => {
    const at = Date.parse('2026-11-03T20:00:00Z');
    expect(takenOnDay(at, '2026-11-03', 'Europe/Brussels')).toBe(true);
    expect(takenOnDay(at, '2026-11-04', 'Europe/Brussels')).toBe(false);
    expect(takenOnDay(0, '2026-11-03', 'Europe/Brussels')).toBe(false);
  });
});
