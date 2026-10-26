// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { exerciseSheet } from '../src/engine/exerciseSheet';
import { EXERCISES } from '../src/catalog/exercises';

describe('fiches d’exercice', () => {
  it('chaque variante a une fiche complète : consignes, effort, repos, arrêt, alternative, progression', () => {
    for (const v of EXERCISES.flatMap((e) => e.variants)) {
      const s = exerciseSheet(v.id, { repRange: [6, 10], targetRir: 2, restSeconds: 120 })!;
      expect(s.cues.length, v.id).toBeGreaterThan(0);
      expect(s.effort, v.id).not.toBe('');
      expect(s.rest, v.id).toContain('2 min');
      expect(s.stop.length, v.id).toBeGreaterThanOrEqual(2);
      expect(s.alternatives.length, v.id).toBeGreaterThan(0);
      expect(s.progression, v.id).not.toBe('');
    }
  });

  it('tractions lestées : RIR, jamais d’échec avec lest, double progression, variante plus accessible', () => {
    const s = exerciseSheet('pullup-weighted', { repRange: [3, 6], targetRir: 2, loadKg: 12, restSeconds: 180 })!;
    expect(s.effort).toContain('3–6 rép. à 12 kg');
    expect(s.stop.join(' ')).toContain('jamais jusqu’à l’échec');
    expect(s.progression).toContain('Double progression');
    expect(s.alternatives[0]!.why).toContain('plus accessible');
  });
});
