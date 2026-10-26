// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { DEFAULT_OWNED, recommendGear, type GearContext } from '../src/engine/gear';

const base: GearContext = { owned: DEFAULT_OWNED, pieces: [5, 5, 6, 12], kettlebells: [6, 12], priority: 'seche', fatZones: ['cuisses', 'fessiers'], muscleZones: [], pains: [], runsPerWeek: 3 };

describe('matériel conseillé', () => {
  it('gras cuisses/fessiers + KB max 12 kg → kettlebell lourde et banc en « Game changer »', () => {
    const r = recommendGear(base, []);
    expect(r[0]!.gear.id).toBe('kb-lourde');
    expect(r[0]!.verdict).toBe('Game changer');
    expect(r[0]!.why).toContain('12 kg');
    expect(r.find((x) => x.gear.id === 'banc')!.verdict).toBe('Game changer');
  });

  it('priorité force : petits disques en tête (saut de 4 kg entre 12 et 16)', () => {
    const r = recommendGear({ ...base, priority: 'force', fatZones: [] }, []);
    expect(r[0]!.gear.id).toBe('disques-fins');
    expect(r[0]!.why).toContain('kg');
  });

  it('dos sensible → roue abdominale déconseillée ; matériel déjà acheté retiré', () => {
    const r = recommendGear({ ...base, pains: ['dos'] }, ['banc']);
    expect(r.find((x) => x.gear.id === 'roue')!.verdict).toBe('Bonus');
    expect(r.some((x) => x.gear.id === 'banc')).toBe(false);
  });
});
