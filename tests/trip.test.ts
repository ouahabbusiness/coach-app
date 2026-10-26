// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { adaptToEquipment } from '../src/engine/trip';

const line = (variantId: string, extra: { loadKg?: number } = {}) => ({ variantId, kind: 'reps' as const, role: 'work' as const, sets: 4, targetReps: 6, restSeconds: 120, ...extra });

describe('séjour : le coach adapte au matériel', () => {
  it('parc avec barre, sans lest ni kettlebell : tractions lestées → strictes, goblet → bulgare impossible → fentes', () => {
    const a = adaptToEquipment([line('pullup-weighted', { loadKg: 10 }), line('squat-goblet-kb', { loadKg: 12 })], ['barre fixe', 'barres parallèles']);
    expect(a.lines.map((l) => l.variantId)).toEqual(['pullup-strict', 'lunge-reverse']);
    expect(a.lines[0]!.loadKg).toBeUndefined();
    expect(a.removed).toContain('Tractions lestées → Tractions strictes');
  });

  it('chambre d’hôtel sans rien : dips → pompes diamant, relevés suspendus → hollow (gainage)', () => {
    const a = adaptToEquipment([line('dips-bars'), line('leg-raise-hanging')], []);
    expect(a.lines[0]!.variantId).toBe('pushup-diamond');
    expect(a.lines[1]).toMatchObject({ variantId: 'hollow-hold', kind: 'hold', targetSeconds: 30 });
  });

  it('tirage sans barre ni kettlebell : retiré et signalé, jamais inventé', () => {
    const a = adaptToEquipment([line('pullup-strict')], []);
    expect(a.lines).toHaveLength(0);
    expect(a.removed[0]).toContain('retiré');
  });
});
