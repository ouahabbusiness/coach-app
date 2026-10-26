// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { addWater, challengeValues, daysUntil } from '../src/engine/daily';

describe('données du jour', () => {
  it('l’eau s’additionne et ne descend jamais sous zéro', () => {
    const a = addWater(undefined, 250, 1);
    expect(a.waterMl).toBe(250);
    expect(addWater(a, -500, 2).waterMl).toBe(0);
  });

  it('le défi lit sommeil et pas depuis les données du jour, sans inventer de valeur', () => {
    expect(challengeValues({ journal: true }, { sleepH: 7.5, updatedAt: 0 })).toEqual({ journal: true, sleep: 7.5 });
    expect(challengeValues(undefined, undefined)).toEqual({});
  });

  it('compte les jours jusqu’à l’échéance', () => {
    expect(daysUntil('2026-10-26', '2026-11-01')).toBe(6);
    expect(daysUntil('2026-11-02', '2026-11-01')).toBe(-1);
  });
});
