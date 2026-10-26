// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { MUSCLE_MAP, weekVolume } from '../src/engine/volume';
import { EXERCISES } from '../src/catalog/exercises';

describe('volume hebdomadaire', () => {
  it('chaque variante du catalogue a une correspondance musculaire', () => {
    const ids = EXERCISES.flatMap((e) => e.variants.map((v) => v.id));
    expect(ids.filter((id) => !MUSCLE_MAP[id])).toEqual([]);
  });

  it('travail direct vs indirect séparés, échauffement à part, EMOM listé sans équivalent inventé', () => {
    const v = weekVolume(
      [{ variantId: 'pullup-weighted', role: 'work', done: false }, { variantId: 'pullup-weighted', role: 'work', done: false }, { variantId: 'dips-bars', role: 'work', done: false }],
      [{ variantId: 'pullup-weighted', role: 'work', done: true }, { variantId: 'pullup-weighted', role: 'warmup', done: true }, { variantId: 'dips-bars', role: 'work', done: true }],
      [{ variantId: 'pullup-weighted', label: 'EMOM 12 min · 72 rép. déclarées' }],
    );
    const dos = v.muscles.find((m) => m.muscle === 'dos')!;
    expect(dos).toMatchObject({ plannedDirect: 2, doneDirect: 1, doneIndirect: 0, free: ['EMOM 12 min · 72 rép. déclarées'] });
    expect(v.muscles.find((m) => m.muscle === 'biceps')).toMatchObject({ doneDirect: 0, doneIndirect: 1 });
    expect(v.muscles.find((m) => m.muscle === 'épaules')).toMatchObject({ doneIndirect: 1 });
    expect(v.warmupSets).toBe(1);
    expect(v.uncertain[0]).toContain('équivalent en séries est inconnu');
  });
});
