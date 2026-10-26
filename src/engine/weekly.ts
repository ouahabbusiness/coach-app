// Bilan de la semaine : ce qui a été fait contre ce qui était prévu, sans rien inventer.
// Une donnée absente reste absente (« — »), elle n'est jamais comptée comme zéro réussi.

export interface WeekInput {
  plannedSessions: number;
  doneSessions: number;
  plannedRuns: number;
  runsKm: number[];
  /** Habitudes tenues par jour écoulé (0–6), jours non renseignés exclus. */
  habitsByDay: number[];
  weightAvg?: number;
  weightAvgPrev?: number;
  pagesRead: number;
  /** Travail hors programme (EMOM, séries libres) : répétitions déclarées. */
  freeReps?: number;
}

export interface WeekReport {
  sessions: string;
  runs: string;
  km: number;
  habits?: number;
  weightDelta?: number;
  pages: number;
  verdict: string;
  free?: string;
}

export function weekReport(w: WeekInput): WeekReport {
  const km = Math.round(w.runsKm.reduce((a, b) => a + b, 0) * 10) / 10;
  const habits = w.habitsByDay.length ? Math.round((w.habitsByDay.reduce((a, b) => a + b, 0) / w.habitsByDay.length) * 10) / 10 : undefined;
  const weightDelta = w.weightAvg !== undefined && w.weightAvgPrev !== undefined ? Math.round((w.weightAvg - w.weightAvgPrev) * 10) / 10 : undefined;
  const missed = Math.max(0, w.plannedSessions - w.doneSessions) + Math.max(0, w.plannedRuns - w.runsKm.length);
  const verdict =
    w.plannedSessions + w.plannedRuns === 0
      ? 'Aucune séance prévue cette semaine : passe par le coach pour construire ton programme.'
      : missed === 0
        ? 'Semaine tenue. Rien n’a sauté.'
        : `${missed} séance${missed > 1 ? 's' : ''} manquée${missed > 1 ? 's' : ''}. On ne rattrape pas en double : on tient la suivante.`;
  const free = w.freeReps ? `Hors programme : ${w.freeReps} rép. déclarées, intégrées à la charge de la semaine.` : undefined;
  return { free, sessions: `${w.doneSessions}/${w.plannedSessions}`, runs: `${w.runsKm.length}/${w.plannedRuns}`, km, habits, weightDelta, pages: w.pagesRead, verdict };
}
