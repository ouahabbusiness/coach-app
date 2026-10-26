// Accès au profil (onboarding) et à l'historique des objectifs, stockés localement.

import { useCallback, useEffect, useState } from 'react';
import { addGoalVersion, emptyAnswers, type GoalVersion, type OnboardingAnswers, type OnboardingState } from '../engine/profile';
import type { Repository } from '../storage/db';

const KEY = 'onboarding';
const GOALS = 'goals';

export async function loadOnboarding(repo: Repository): Promise<OnboardingState> {
  const s = await repo.getKv<OnboardingState>(KEY);
  if (s) return { ...s, answers: { ...emptyAnswers(), ...s.answers } };
  return { version: 1, step: 0, answers: emptyAnswers(), updatedAt: 0 };
}

export function useOnboarding(repo: Repository) {
  const [state, setState] = useState<OnboardingState | null>(null);
  useEffect(() => {
    loadOnboarding(repo).then(setState);
  }, [repo]);

  /** Chaque modification est enregistrée immédiatement : l'onboarding peut être quitté à tout moment. */
  const save = useCallback(
    async (next: OnboardingState) => {
      const withTime = { ...next, updatedAt: Date.now() };
      setState(withTime);
      await repo.setKv(KEY, withTime);
    },
    [repo],
  );

  const complete = useCallback(
    async (answers: OnboardingAnswers, reason: string) => {
      const history = (await repo.getKv<GoalVersion[]>(GOALS)) ?? [];
      await repo.setKv(GOALS, addGoalVersion(history, answers.goal, reason, Date.now()));
      await save({ version: 1, step: 0, answers, completedAt: Date.now(), updatedAt: Date.now() });
    },
    [repo, save],
  );

  return { state, save, complete };
}

export async function loadGoals(repo: Repository): Promise<GoalVersion[]> {
  return (await repo.getKv<GoalVersion[]>(GOALS)) ?? [];
}
