// Logique du parcours programme guidé : questions, réponses, mapping vers ProgramAnswers.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyAnswer, buildSteps } from '../src/ui/IppoProgram';
import type { ProgramAnswers } from '../src/engine/programBuilder';

const base: ProgramAnswers = { pains: [] };

describe('buildSteps', () => {
  it('pose les questions de base, sans course quand l’objectif est la force', () => {
    const ids = buildSteps({ ...base, priority: 'force' }).map((s) => s.id);
    expect(ids).toEqual(['style', 'rope', 'morning', 'priority', 'pains', 'flatGlutes', 'days', 'minutes', 'slot', 'sleep', 'quit', 'weeks']);
  });

  it('ajoute la course pour un objectif hybride, et l’objectif de course seulement s’il y a des sorties', () => {
    const withoutRuns = buildSteps({ ...base, priority: 'hybride' }).map((s) => s.id);
    expect(withoutRuns).toContain('runs');
    expect(withoutRuns).not.toContain('runGoal');
    const withRuns = buildSteps({ ...base, priority: 'hybride', runsPerWeek: 2 }).map((s) => s.id);
    expect(withRuns).toContain('runGoal');
  });

  it('demande les jours et le lieu de boxe quand le style est boxe', () => {
    const ids = buildSteps({ ...base, style: 'boxe', boxingPerWeek: 2 }).map((s) => s.id);
    expect(ids).toContain('boxingPerWeek');
    expect(ids).toContain('boxingDays');
    expect(ids).toContain('boxingPlace');
  });

  it('saute la question du créneau quand le matin est choisi', () => {
    const ids = buildSteps({ ...base, morningAnchor: true }).map((s) => s.id);
    expect(ids).not.toContain('slot');
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

  it('mappe fessiers évités, lieu de boxe et durée du bloc', () => {
    expect(applyAnswer(base, 'flatGlutes', 'oui').flatGlutes).toBe(true);
    expect(applyAnswer(base, 'boxingPlace', 'maison').boxingPlace).toBe('maison');
    expect(applyAnswer(base, 'weeks', '8').weeks).toBe(8);
  });

  it('mappe le style, la boxe, la corde et le matin', () => {
    const boxe = applyAnswer(base, 'style', 'boxe');
    expect(boxe.style).toBe('boxe');
    expect(applyAnswer(boxe, 'boxingPerWeek', '2').boxingPerWeek).toBe(2);
    expect(applyAnswer(boxe, 'boxingDays', ['1', '3']).boxingDays).toEqual([1, 3]);
    expect(applyAnswer(base, 'rope', 'oui').rope).toBe(true);
    const morning = applyAnswer(base, 'morning', 'oui');
    expect(morning.morningAnchor).toBe(true);
    expect(morning.slot).toBe('matin');
  });

  it('mappe l’objectif et la raison d’abandon', () => {
    expect(applyAnswer(base, 'priority', 'muscle').priority).toBe('muscle');
    expect(applyAnswer(base, 'quit', 'temps').quitReason).toBe('temps');
    expect(applyAnswer(base, 'slot', 'midi').slot).toBe('midi');
    expect(applyAnswer(base, 'runGoal', '5k').runGoal).toBe('5k');
  });
});
