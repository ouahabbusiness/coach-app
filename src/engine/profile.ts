// Profil issu de l'onboarding et objectifs versionnés. Types et fonctions pures.

/** Statut d'une valeur : jamais d'estimation présentée comme une mesure. */
export type ValueStatus = 'mesuré' | 'déclaré' | 'estimé' | 'inconnu';

export interface Valued<T> {
  value?: T;
  status: ValueStatus;
  /** Instant de saisie (UTC ms). */
  at?: number;
}

export type GoalCategory =
  | 'perte_de_graisse'
  | 'muscle'
  | 'recomposition'
  | 'street_workout'
  | 'reprise_course'
  | 'performance_course'
  | 'regularite';

export const GOAL_LABELS: Record<GoalCategory, string> = {
  perte_de_graisse: 'Perte de graisse',
  muscle: 'Développement musculaire',
  recomposition: 'Recomposition corporelle',
  street_workout: 'Progresser en street workout',
  reprise_course: 'Reprendre la course',
  performance_course: 'Distance ou performance en course',
  regularite: 'Construire une régularité',
};

export type Slot = 'matin' | 'midi' | 'soir';
export type Answer3 = 'oui' | 'non' | 'je_ne_sais_pas';

export interface OnboardingAnswers {
  coachAck?: boolean;
  privacyAck?: boolean;
  devices: { iphone?: string; watch?: string; apps?: string };
  body: { age: Valued<number>; heightCm: Valued<number>; weightKg: Valued<number>; waistCm: Valued<number>; formulaSex?: 'homme' | 'femme' };
  history: { sports?: string; breakDuration?: string; runningBefore?: string; pullupsMax: Valued<number>; pushupsMax: Valued<number> };
  safety: { pains?: string; restrictions?: string; medicalFollowUp?: Answer3 };
  goal: GoalDraft;
  equipment: { items: string[]; kettlebellKg?: string; notes?: string };
  food: { restrictions?: string; allergies?: string; later?: boolean };
  schedule: { workDays: number[]; workStart?: string; workEnd?: string; commuteMin?: number; weekendNotes?: string };
  sleep: { bedtime?: string; wake?: string; preferredSlots: Slot[]; sessionsPerWeek?: number; sessionMinutes?: number };
  coaching: { tone?: 'ferme' | 'neutre' | 'doux' };
}

export interface GoalDraft {
  main?: GoalCategory;
  secondary: GoalCategory[];
  description?: string;
  why?: string;
  measure?: string;
  /** AAAA-MM-JJ, souhaitée par l'utilisateur. Jamais déplacée par l'app. */
  targetDate?: string;
  limits?: string;
}

export interface GoalVersion extends GoalDraft {
  version: number;
  at: number;
  reason: string;
}

export interface OnboardingState {
  version: 1;
  /** Index de l'étape en cours (reprise). */
  step: number;
  answers: OnboardingAnswers;
  completedAt?: number;
  updatedAt: number;
}

export function emptyAnswers(): OnboardingAnswers {
  const unknown = (): Valued<number> => ({ status: 'inconnu' });
  return {
    devices: {},
    body: { age: unknown(), heightCm: unknown(), weightKg: unknown(), waistCm: unknown() },
    history: { pullupsMax: unknown(), pushupsMax: unknown() },
    safety: {},
    goal: { secondary: [] },
    equipment: { items: [] },
    food: {},
    schedule: { workDays: [] },
    sleep: { preferredSlots: [] },
    coaching: {},
  };
}

const GOAL_FIELDS: (keyof GoalDraft)[] = ['main', 'secondary', 'description', 'why', 'measure', 'targetDate', 'limits'];

function sameGoal(a: GoalDraft, b: GoalDraft): boolean {
  return GOAL_FIELDS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

/**
 * Ajoute une version d'objectif seulement si quelque chose a changé.
 * Les versions précédentes ne sont jamais modifiées : l'historique reste lisible.
 */
export function addGoalVersion(history: GoalVersion[], draft: GoalDraft, reason: string, at: number): GoalVersion[] {
  const last = history[history.length - 1];
  if (last && sameGoal(last, draft)) return history;
  return [...history, { ...structuredClone(draft), version: (last?.version ?? 0) + 1, at, reason }];
}

/** Ce qui a changé entre deux versions, pour l'afficher clairement (jamais de changement discret). */
export function goalChanges(prev: GoalDraft | undefined, next: GoalDraft): (keyof GoalDraft)[] {
  if (!prev) return [];
  return GOAL_FIELDS.filter((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null));
}
