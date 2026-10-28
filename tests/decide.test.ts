// Données de test fictives (aucune n'est une performance réelle).
import { describe, expect, it } from 'vitest';
import { decide, type Rx, type Sample } from '../src/engine/decide';
import { availableLoads, DEFAULT_PIECES } from '../src/engine/progression';

const loads = availableLoads(DEFAULT_PIECES); // 0, 5, 6, 10, 11, 12, 16…
const kb = [6, 12];
const rx: Rx = { lo: 6, hi: 10, rir: 2, loadKg: 10, target: 6 };
const s = (reps: number[], loadKg = 10, rir?: number, extra: Partial<Sample> = {}): Sample => ({ results: reps.map((r) => ({ reps: r, loadKg, rir })), planned: reps.length, comparable: true, ...extra });

describe('double progression (choix de conception)', () => {
  it('haut de plage + effort conforme → plus petit incrément réel (lest : 10 → 11 kg, < 10 % de la résistance totale)', () => {
    const d = decide('pullup-weighted', rx, [s([10, 10, 10], 10, 2)], loads, { bodyweightKg: 77, addedLoad: true });
    expect(d).toMatchObject({ action: 'augmenter', progressionAllowed: true, after: { loadKg: 11, target: 6 } });
  });

  it('mêmes répétitions mais effort excessif → pas d’augmentation', () => {
    const d = decide('x', rx, [s([10, 10, 10], 10, 0)], loads);
    expect(d).toMatchObject({ action: 'maintenir', progressionAllowed: false, targetReached: true });
  });

  it('effort non noté → confirmation sur 2 séances COMPARABLES', () => {
    expect(decide('x', rx, [s([10, 10, 10])], loads, { bodyweightKg: 77, addedLoad: true })).toMatchObject({ action: 'maintenir', missing: ['réserve (RIR)'] });
    expect(decide('x', rx, [s([10, 10, 10]), s([10, 10, 10])], loads, { bodyweightKg: 77, addedLoad: true }).action).toBe('augmenter');
    expect(decide('x', rx, [s([10, 10, 10]), s([10, 10, 10], 10, undefined, { comparable: false, why: 'allégée' })], loads).action).toBe('maintenir');
  });

  it('séance partielle → jamais de progression ; série retirée par le coach ≠ échec', () => {
    expect(decide('x', rx, [s([10, 10], 10, 3, { planned: 3 })], loads)).toMatchObject({ action: 'maintenir', rule: 'séance partielle', progressionAllowed: false });
    // 2 séries faites sur 2 demandées (la 3e retirée par le coach n'est pas comptée) → séance complète
    expect(decide('x', rx, [s([10, 10], 10, 2, { planned: 2 })], loads, { bodyweightKg: 77, addedLoad: true }).action).toBe('augmenter');
  });

  it('séance non comparable (allégée, interrompue) → ni progrès ni échec', () => {
    const d = decide('x', rx, [s([4, 4, 4], 10, 0, { comparable: false, why: 'contrôle avant séance : allégée' })], loads);
    expect(d).toMatchObject({ action: 'observer', rule: 'séance non comparable' });
  });

  it('deux séances comparables sous la plage → ANALYSE + proposition à valider, jamais une baisse automatique', () => {
    expect(decide('x', rx, [s([5, 4, 4], 10, 1)], loads).action).toBe('maintenir');
    const d = decide('x', rx, [s([5, 4, 4], 10, 1), s([5, 5, 4], 10, 1)], loads);
    expect(d).toMatchObject({ action: 'réduire', proposal: true, after: { loadKg: 6 } });
    expect(d.reason).toContain('à valider');
  });

  it('kettlebell 12 → 16 kg (+33 %) → transition : 1 série d’essai, pas de saut imposé', () => {
    const d = decide('squat-goblet-kb', { ...rx, loadKg: 12 }, [s([10, 10, 10], 12, 2)], [6, 12, 16]);
    expect(decide('squat-goblet-kb', { ...rx, loadKg: 12 }, [s([10, 10, 10], 12, 2)], kb).rule).toBe('matériel au maximum');
    expect(d).toMatchObject({ action: 'transition', transition: { loadKg: 16, sets: 1, target: 6 }, after: { loadKg: 12 }, progressionAllowed: false });
  });

  it('tractions : 12 → 16 kg de lest pour 77 kg de poids du corps = +4,5 % → pas une transition', () => {
    const d = decide('pullup-weighted', { ...rx, loadKg: 12 }, [s([10, 10, 10], 12, 2)], loads, { bodyweightKg: 77, addedLoad: true });
    expect(d).toMatchObject({ action: 'augmenter', after: { loadKg: 16 } });
  });

  it('un essai réussi ne fait pas tout basculer : moitié des séries d’abord, puis tout ; essai non confirmé → retour', () => {
    const mixed = (testReps: number, testRir?: number): Sample => ({ results: [{ reps: testReps, loadKg: 16, rir: testRir }, { reps: 10, loadKg: 12, rir: 2 }, { reps: 10, loadKg: 12, rir: 2 }], planned: 3, comparable: true });
    expect(decide('x', { ...rx, loadKg: 12 }, [mixed(7, 2)], kb)).toMatchObject({ action: 'transition', transition: { loadKg: 16, sets: 2 }, after: { loadKg: 12 }, rule: 'transition : étape suivante' });
    const twoAt16: Sample = { results: [{ reps: 7, loadKg: 16, rir: 2 }, { reps: 6, loadKg: 16, rir: 2 }, { reps: 10, loadKg: 12, rir: 2 }], planned: 3, comparable: true };
    expect(decide('x', { ...rx, loadKg: 12 }, [twoAt16], kb)).toMatchObject({ action: 'augmenter', after: { loadKg: 16, target: 6 }, rule: 'transition confirmée' });
    expect(decide('x', { ...rx, loadKg: 12 }, [mixed(5, 1)], kb)).toMatchObject({ action: 'maintenir', after: { loadKg: 12 }, rule: 'transition non confirmée' });
    expect(decide('x', { ...rx, loadKg: 12 }, [mixed(7)], kb).missing).toContain('réserve de la série d’essai');
  });

  it('résultats incomplets → aucune réussite inventée ; douleur → sécurité', () => {
    expect(decide('x', rx, [{ results: [{ reps: 10, loadKg: 10 }, { loadKg: 10 }], planned: 2, comparable: true }], loads).rule).toBe('données incomplètes');
    expect(decide('x', rx, [s([10, 10, 10], 10, 3)], loads, { pain: true }).rule).toBe('sécurité');
  });
});

describe('gêne déclarée (épaule, coudes)', () => {
  const dipsRx: Rx = { lo: 5, hi: 8, rir: 2, loadKg: 10, target: 5 };
  it('haut de plage atteint : sans gêne la charge monte, avec gêne elle est gelée', () => {
    const up = decide('dips-weighted', dipsRx, [s([8, 8, 8], 10, 2)], loads, { bodyweightKg: 77, addedLoad: true });
    expect(up.action).not.toBe('maintenir');
    const held = decide('dips-weighted', dipsRx, [s([8, 8, 8], 10, 2)], loads, { bodyweightKg: 77, addedLoad: true, guarded: true });
    expect(held).toMatchObject({ action: 'maintenir', rule: 'gêne déclarée', progressionAllowed: false, after: { loadKg: 10, target: 8 } });
    expect(held.transition).toBeUndefined();
  });
  it('le gel dépend de l’ÉTAT du mouvement désigné par l’appelant, jamais d’une liste de noms : le rowing est gelé s’il est désigné, libre sinon', () => {
    const rx2 = { lo: 10, hi: 15, rir: 2, loadKg: 6, target: 10 };
    expect(decide('kb-row-1arm', rx2, [s([15, 15, 15], 6, 2)], kb, { guarded: true }).rule).toBe('gêne déclarée');
    expect(decide('kb-row-1arm', rx2, [s([15, 15, 15], 6, 2)], kb, { guarded: false }).rule).not.toBe('gêne déclarée');
  });
});
