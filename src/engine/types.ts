// Types du moteur de séance. Toutes les dates sont des instants UTC en millisecondes
// (epoch). Le fuseau horaire ne sert qu'à l'affichage et au calcul du « jour ».

export type EpochMs = number;

export type SetKind = 'reps' | 'hold';
export type SetRole = 'warmup' | 'work' | 'technique' | 'test';
export type BlockType = 'straight' | 'superset' | 'circuit';
export type Side = 'left' | 'right' | 'both';

export interface PlannedSet {
  id: string;
  exerciseId: string;
  variantId: string;
  blockId: string;
  blockType: BlockType;
  role: SetRole;
  kind: SetKind;
  targetReps?: number;
  targetSeconds?: number;
  loadKg?: number;
  /** Assistance décrite telle quelle (ex. « élastique rouge ») : pas de conversion en kg inventée. */
  assistance?: string;
  side?: Side;
  targetRir?: number;
  restSeconds: number;
  /** Consigne d'exécution saisie par l'utilisateur (ex. « prise neutre »). */
  cue?: string;
}

export interface SessionPlan {
  id: string;
  title: string;
  source: 'manual' | 'program';
  sets: PlannedSet[];
}

/** Résultat réel d'une série. Un champ absent signifie « non renseigné », jamais zéro. */
export interface SetResult {
  reps?: number;
  seconds?: number;
  loadKg?: number;
  assistance?: string;
  /** Répétitions estimées encore possibles (déclaré). */
  rir?: number;
  side?: Side;
  note?: string;
}

export interface PainReport {
  eventId: string;
  at: EpochMs;
  plannedSetId?: string;
  location: string;
  /** Intensité déclarée 0–10. */
  intensity: number;
  stop: boolean;
}

interface EventBase {
  /** Identifiant unique : sert aussi de clé d'idempotence (double appui, resynchronisation). */
  id: string;
  sessionId: string;
  at: EpochMs;
}

export type SessionEvent =
  | (EventBase & { type: 'session_started'; plan: SessionPlan; timeZone: string })
  | (EventBase & { type: 'set_started'; plannedSetId: string })
  | (EventBase & { type: 'set_ended'; plannedSetId: string })
  | (EventBase & { type: 'set_result_recorded'; plannedSetId: string; result: SetResult })
  | (EventBase & { type: 'result_undone'; targetEventId: string })
  | (EventBase & { type: 'set_skipped'; plannedSetId: string; reason: string })
  | (EventBase & { type: 'interruption_started'; reason: string })
  | (EventBase & { type: 'interruption_ended' })
  | (EventBase & {
      type: 'pain_reported';
      plannedSetId?: string;
      location: string;
      intensity: number;
      stop: boolean;
    })
  | (EventBase & { type: 'session_ended' });

export type SessionCommand =
  | { type: 'start_session'; plan: SessionPlan; timeZone: string }
  | { type: 'start_set'; plannedSetId: string }
  | { type: 'end_set'; plannedSetId: string }
  | { type: 'record_result'; plannedSetId: string; result: SetResult }
  | { type: 'undo_result'; targetEventId: string }
  | { type: 'skip_set'; plannedSetId: string; reason: string }
  | { type: 'start_interruption'; reason: string }
  | { type: 'end_interruption' }
  | { type: 'report_pain'; plannedSetId?: string; location: string; intensity: number; stop: boolean }
  | { type: 'end_session' };

export type SetStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface ResultEntry {
  eventId: string;
  at: EpochMs;
  result: SetResult;
  undone: boolean;
}

export interface SetState {
  planned: PlannedSet;
  status: SetStatus;
  startedAt?: EpochMs;
  endedAt?: EpochMs;
  skipReason?: string;
  /** Historique complet des saisies, corrections comprises. */
  entries: ResultEntry[];
}

export interface Interval {
  start: EpochMs;
  end?: EpochMs;
}

export interface RestPeriod extends Interval {
  afterSetId: string;
  targetSeconds: number;
}

export type Phase = 'ready' | 'in_set' | 'resting' | 'interrupted' | 'ended';

export type SessionOutcome = 'in_progress' | 'completed' | 'partial' | 'stopped_for_safety';

export interface SessionState {
  sessionId: string;
  plan: SessionPlan;
  timeZone: string;
  startedAt: EpochMs;
  endedAt?: EpochMs;
  phase: Phase;
  /** Phase à retrouver à la fin d'une interruption. */
  phaseBeforeInterruption?: 'ready' | 'resting';
  currentSetId?: string;
  sets: SetState[];
  rests: RestPeriod[];
  interruptions: (Interval & { reason: string })[];
  pain: PainReport[];
  safetyStop: boolean;
}

export type DecideResult =
  | { ok: true; events: SessionEvent[] }
  | { ok: false; error: DecideError };

export type DecideError =
  | 'session_already_started'
  | 'session_not_started'
  | 'session_ended'
  | 'unknown_set'
  | 'set_not_pending'
  | 'set_not_started'
  | 'not_in_set'
  | 'already_in_set'
  | 'wrong_set'
  | 'not_interrupted'
  | 'cannot_interrupt_now'
  | 'safety_stop'
  | 'unknown_result'
  | 'invalid_value';
