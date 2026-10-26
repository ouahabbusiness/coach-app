import { describe, expect, it } from 'vitest';
import { readiness, type ReadinessInput } from '../src/engine/readiness';

const ok: ReadinessInput = { sleepBad: false, fatigue: false, pain: 'aucune', ill: false, shortTime: false, redFlag: false };

describe('contrôle avant séance', () => {
  it('tout va bien → séance normale', () => expect(readiness(ok).decision).toBe('normale'));
  it('signal d’alerte → arrêt et orientation urgente, avant tout le reste', () => {
    const d = readiness({ ...ok, redFlag: true, shortTime: true });
    expect(d.decision).toBe('arrêt');
    expect(d.reason).toContain('112');
  });
  it('malade → reporter sans pénalité', () => expect(readiness({ ...ok, ill: true }).decision).toBe('reporter'));
  it('douleur nouvelle → adaptée, pas d’échec, orientation si persistante', () => {
    const d = readiness({ ...ok, pain: 'nouvelle' });
    expect(d).toMatchObject({ decision: 'adaptée', noFailure: true });
    expect(d.reason).toContain('professionnel');
  });
  it('mauvaise nuit seule → normale sans échec ; + fatigue → une série de moins', () => {
    expect(readiness({ ...ok, sleepBad: true })).toMatchObject({ decision: 'normale', noFailure: true, dropLastSet: false });
    expect(readiness({ ...ok, sleepBad: true, fatigue: true })).toMatchObject({ decision: 'adaptée', dropLastSet: true });
  });
  it('peu de temps → version courte', () => expect(readiness({ ...ok, shortTime: true })).toMatchObject({ decision: 'adaptée', shorten: true }));
});
