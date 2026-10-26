// Données de test fictives (aucune n'est une performance réelle).
import { describe, expect, it } from 'vitest';
import { decide, type Rx } from '../src/engine/decide';
import { availableLoads, DEFAULT_PIECES } from '../src/engine/progression';

const loads = availableLoads(DEFAULT_PIECES); // 0, 5, 6, 10, 11, 12, 16…
const rx: Rx = { lo: 6, hi: 10, rir: 2, loadKg: 10, target: 6 };
const s = (reps: number[], loadKg = 10, rir?: number) => reps.map((r) => ({ reps: r, loadKg, rir }));

describe('double progression (choix de conception)', () => {
  it('haut de plage + effort conforme → progression autorisée au plus petit incrément réel', () => {
    const d = decide('pullup-weighted', rx, [s([10, 10, 10], 10, 2)], loads);
    expect(d).toMatchObject({ action: 'augmenter', progressionAllowed: true, after: { loadKg: 11, target: 6 } });
  });

  it('mêmes répétitions mais effort excessif → pas d’augmentation', () => {
    const d = decide('pullup-weighted', rx, [s([10, 10, 10], 10, 0)], loads);
    expect(d.action).toBe('maintenir');
    expect(d.progressionAllowed).toBe(false);
    expect(d.targetReached).toBe(true);
  });

  it('effort non noté → confirmation sur 2 séances comparables', () => {
    expect(decide('x', rx, [s([10, 10, 10])], loads)).toMatchObject({ action: 'maintenir', missing: ['réserve (RIR)'] });
    expect(decide('x', rx, [s([10, 10, 10]), s([10, 10, 10])], loads).action).toBe('augmenter');
  });

  it('dans la plage → même charge, +1 répétition visée', () => {
    expect(decide('x', rx, [s([8, 7, 7], 10, 2)], loads)).toMatchObject({ action: 'maintenir', after: { loadKg: 10, target: 8 } });
  });

  it('une séance sous la plage ne change rien ; deux de suite → réduction', () => {
    expect(decide('x', rx, [s([5, 4, 4], 10, 1)], loads).action).toBe('maintenir');
    expect(decide('x', rx, [s([5, 4, 4], 10, 1), s([5, 5, 4], 10, 1)], loads)).toMatchObject({ action: 'réduire', after: { loadKg: 6 } });
  });

  it('résultats incomplets → aucune réussite inventée ; douleur → sécurité', () => {
    expect(decide('x', rx, [[{ reps: 10, loadKg: 10 }, { loadKg: 10 }]], loads).rule).toBe('données incomplètes');
    expect(decide('x', rx, [s([10, 10, 10], 10, 3)], loads, { pain: true }).rule).toBe('sécurité');
  });

  it('incrément prévu indisponible : 12 → 16 kg est un gros saut → répétitions d’abord', () => {
    const d = decide('x', { ...rx, loadKg: 12 }, [s([10, 10, 10], 12, 2)], loads);
    expect(d).toMatchObject({ action: 'maintenir', after: { loadKg: 12, target: 12 }, rule: 'gros saut de charge' });
  });
});
