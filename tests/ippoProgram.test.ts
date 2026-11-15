// Logique du parcours programme guidé : questions, réponses, mapping vers ProgramAnswers.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyAnswer, buildSteps } from '../src/ui/IppoProgram';
import type { ProgramAnswers } from '../src/engine/programBuilder';

const base: ProgramAnswers = { pains: [] };

describe('buildSteps', () => {
  it('pose les questions de base, sans course quand l’objectif est la force', () => {
    const ids = buildSteps({ ...base, priority: 'force' }).map((s) => s.id);
    expect(ids).toEqual(['priority', 'pains', 'days', 'minutes', 'slot', 'sleep', 'quit', 'tests']);
  });

  it('ajoute course et objectif de course pour un objectif hybride', () => {
    const ids = buildSteps({ ...base, priority: 'hybride' }).map((s) => s.id);
    expect(ids).toContain('runs');
    expect(ids).toContain('runGoal');
    expect(ids.at(-1)).toBe('runGoal');
  });
});

describe('applyAnswer', () => {
  it('mappe les douleurs et ignore « aucune »', () => {
    expect(applyAnswer(base, 'pains', ['aucune']).pains).toEqual([]);
    expect(applyAnswer(base, 'pains', ['epaules', 'coudes']).pains).toEqual(['epaules', 'coudes']);
  });

  it('convertit les nombres et le sommeil', () => {
    expect(applyAnswer(base, 'days', '4').days).toBe(4);
    expect(applyAnswer(base, 'minutes', '60').minutes).toBe(60);
    expect(applyAnswer(base, 'sleep', '7.5').sleepH).toBe(7.5);
    expect(applyAnswer(base, 'runs', '3').runsPerWeek).toBe(3);
  });

  it('conserve les tests inconnus comme null, jamais zéro', () => {
    const a = applyAnswer(base, 'tests', { pullups: 12, dips: null, pushups: 30 });
    expect(a.maxPullups).toBe(12);
    expect(a.maxDips).toBeNull();
    expect(a.maxPushups).toBe(30);
  });

  it('mappe l’objectif et la raison d’abandon', () => {
    expect(applyAnswer(base, 'priority', 'muscle').priority).toBe('muscle');
    expect(applyAnswer(base, 'quit', 'temps').quitReason).toBe('temps');
    expect(applyAnswer(base, 'slot', 'midi').slot).toBe('midi');
    expect(applyAnswer(base, 'runGoal', '5k').runGoal).toBe('5k');
  });
});
