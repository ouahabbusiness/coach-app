// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { average7, dailyWeights, isValidKg, trend, type WeighIn } from '../src/engine/weight';

let n = 0;
const w = (day: string, kg: number, at = ++n): WeighIn => ({ id: `w${n}`, day, kg, status: 'mesuré', at });

describe('suivi du poids', () => {
  it('garde la dernière pesée de chaque jour, triée par date', () => {
    const d = dailyWeights([w('2026-11-02', 79, 2), w('2026-11-01', 80, 1), w('2026-11-02', 78.6, 3)]);
    expect(d.map((x) => [x.day, x.kg])).toEqual([
      ['2026-11-01', 80],
      ['2026-11-02', 78.6],
    ]);
  });

  it('moyenne sur 7 jours glissants, sans inventer de jour manquant', () => {
    const d = dailyWeights([w('2026-11-01', 80), w('2026-11-03', 79), w('2026-11-09', 78)]);
    expect(average7(d, '2026-11-07')).toEqual({ kg: 79.5, count: 2 });
    expect(average7(d, '2026-10-20')).toBeUndefined();
  });

  it('tendance : données insuffisantes tant qu’il n’y a pas 3 pesées par semaine', () => {
    const d = dailyWeights([w('2026-11-01', 80), w('2026-11-08', 79)]);
    expect(trend(d, '2026-11-14').status).toBe('données insuffisantes');
  });

  it('tendance : baisse, stable ou hausse sur deux semaines complètes', () => {
    const base = ['2026-11-01', '2026-11-03', '2026-11-05'].map((day) => w(day, 80));
    const down = dailyWeights([...base, ...['2026-11-08', '2026-11-10', '2026-11-12'].map((day) => w(day, 79.4))]);
    expect(trend(down, '2026-11-14')).toEqual({ status: 'baisse', deltaKg: -0.6 });
    const flat = dailyWeights([...base, ...['2026-11-08', '2026-11-10', '2026-11-12'].map((day) => w(day, 80.1))]);
    expect(trend(flat, '2026-11-14').status).toBe('stable');
  });

  it('refuse les valeurs absurdes', () => {
    expect(isValidKg(78.4)).toBe(true);
    expect(isValidKg(0)).toBe(false);
    expect(isValidKg(Number.NaN)).toBe(false);
  });
});
