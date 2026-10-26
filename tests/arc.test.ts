// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { arcStats } from '../src/engine/arc';
import type { Entries } from '../src/engine/challenge';

const full = { water_only: true, no_junk: true, sleep: 7.5, steps: 11000, journal: true, read: true };
const day = (values: Record<string, boolean | number>, excused = false) => ({ values, excused, updatedAt: 0 });

describe('statut Winter Arc', () => {
  it('avant novembre : rien de tenu, rien de manqué', () => {
    const s = arcStats({}, new Set(), '2026-10-26');
    expect(s.todayIndex).toBe(-1);
    expect(s.locked).toBe(0);
    expect(s.days.every((d) => d.state === 'à venir')).toBe(true);
  });

  it('jour tenu à partir de 5 habitudes, non renseigné = manqué (jamais inventé)', () => {
    const entries: Entries = {
      '2026-11-01': day(full),
      '2026-11-02': day({ water_only: true, no_junk: true, journal: true, read: true }),
    };
    const s = arcStats(entries, new Set(), '2026-11-04');
    expect(s.days[0]!.state).toBe('tenu');
    expect(s.days[1]!.state).toBe('manqué');
    expect(s.days[2]!.state).toBe('manqué');
    expect(s.days[3]!.state).toBe('aujourd’hui');
  });

  it('série : un jour excusé ne la casse pas, aujourd’hui non encore tenu non plus', () => {
    const entries: Entries = {
      '2026-11-01': day(full),
      '2026-11-02': day({}, true),
      '2026-11-03': day(full),
    };
    const s = arcStats(entries, new Set(), '2026-11-04');
    expect(s.streak).toBe(2);
    expect(s.locked).toBe(2);
  });

  it('semaine tenue seulement si salle et course atteignent leur objectif', () => {
    const entries: Entries = {};
    ['2026-11-02', '2026-11-03', '2026-11-04'].forEach((d) => (entries[d] = day({ run: true })));
    const gym = new Set(['2026-11-02', '2026-11-04', '2026-11-05', '2026-11-07']);
    const s = arcStats(entries, gym, '2026-11-10');
    expect(s.weeksJudged).toBe(1);
    expect(s.weeksHeld).toBe(1);
  });
});
