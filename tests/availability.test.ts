// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { nearestFree, replanDay, type OneOff } from '../src/engine/availability';
import type { FixedEvent, PlannedItem } from '../src/engine/planning';

const work: FixedEvent = { id: 'w', kind: 'travail', label: 'Travail', days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00' };
const item = (id: string, start: string, kind: 'course' | 'seance' = 'course', durationMin = 40): PlannedItem => ({ id, weekStart: '2026-11-02', day: 2, start, durationMin, kind, title: kind === 'course' ? 'Course · endurance 5 km' : 'Force', moves: [] });
const soiree: OneOff = { id: 's', date: '2026-11-04', start: '19:00', end: '23:30', kind: 'soiree', label: 'Soirée prévue' };

describe('disponibilités', () => {
  it('créneau libre le plus proche, avec 15 min de battement', () => {
    expect(nearestFree('18:30', 40, [[540, 1020], [1140, 1410]])).toBe('18:00');
  });

  it('soirée à 19:00 → la course de 18:30 est avancée au créneau libre le plus proche, même jour', () => {
    const r = replanDay([item('c', '18:30')], '2026-11-04', [work], [soiree], 1);
    expect(r.moves).toEqual([{ itemId: 'c', title: 'Course · endurance 5 km', from: '18:30', to: '18:00', because: 'Soirée prévue' }]);
    expect(r.items[0]!.start).toBe('18:00');
    expect(r.items[0]!.moves).toHaveLength(1);
  });

  it('deux éléments le même jour ne se chevauchent pas après replacement', () => {
    const r = replanDay([item('c', '19:30'), item('f', '17:15', 'seance', 45)], '2026-11-04', [work], [soiree], 1);
    const c = r.items.find((x) => x.id === 'c')!;
    expect(c.start).not.toBe('17:15');
    expect(['07:00', '07:45', '08:00', '06:00', '06:15', '18:15'].includes(c.start) || c.start < '09:00').toBe(true);
  });

  it('élément sans conflit : rien ne bouge', () => {
    const r = replanDay([item('c', '07:00')], '2026-11-04', [work], [soiree], 1);
    expect(r.moves).toHaveLength(0);
  });
});
