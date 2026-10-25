// Moteur de séance : journal d'événements horodatés + projection déterministe.
// L'état n'est jamais stocké tel quel : il est toujours recalculé depuis le journal,
// ce qui rend la reprise après fermeture et la resynchronisation sûres.

import type {
  DecideResult,
  EpochMs,
  SessionCommand,
  SessionEvent,
  SessionState,
  SetResult,
  SetState,
} from './types';

export interface DecideContext {
  now: EpochMs;
  newId: () => string;
  /** Requis uniquement pour start_session. */
  sessionId?: string;
}

/** Reconstruit l'état d'une séance. Les événements déjà vus (même id) sont ignorés. */
export function project(events: readonly SessionEvent[]): SessionState | null {
  const seen = new Set<string>();
  let st: SessionState | null = null;
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    st = apply(st, ev);
  }
  return st;
}

function apply(st: SessionState | null, ev: SessionEvent): SessionState | null {
  if (ev.type === 'session_started') {
    if (st) return st;
    return {
      sessionId: ev.sessionId,
      plan: ev.plan,
      timeZone: ev.timeZone,
      startedAt: ev.at,
      phase: 'ready',
      sets: ev.plan.sets.map((planned) => ({ planned, status: 'pending', entries: [] })),
      rests: [],
      interruptions: [],
      pain: [],
      safetyStop: false,
    };
  }
  if (!st) return st;

  switch (ev.type) {
    case 'set_started': {
      closeOpenRest(st, ev.at);
      const set = findSet(st, ev.plannedSetId);
      if (set) {
        set.status = 'in_progress';
        set.startedAt = ev.at;
      }
      st.currentSetId = ev.plannedSetId;
      st.phase = 'in_set';
      return st;
    }
    case 'set_ended': {
      const set = findSet(st, ev.plannedSetId);
      if (set) {
        set.status = 'done';
        set.endedAt = ev.at;
        st.rests.push({ afterSetId: set.planned.id, start: ev.at, targetSeconds: set.planned.restSeconds });
      }
      st.currentSetId = undefined;
      st.phase = 'resting';
      return st;
    }
    case 'set_result_recorded': {
      findSet(st, ev.plannedSetId)?.entries.push({ eventId: ev.id, at: ev.at, result: ev.result, undone: false });
      return st;
    }
    case 'result_undone': {
      for (const set of st.sets) {
        const entry = set.entries.find((e) => e.eventId === ev.targetEventId);
        if (entry) entry.undone = true;
      }
      return st;
    }
    case 'set_skipped': {
      const set = findSet(st, ev.plannedSetId);
      if (set) {
        set.status = 'skipped';
        set.skipReason = ev.reason;
      }
      return st;
    }
    case 'interruption_started': {
      st.phaseBeforeInterruption = st.phase === 'resting' ? 'resting' : 'ready';
      st.interruptions.push({ start: ev.at, reason: ev.reason });
      st.phase = 'interrupted';
      return st;
    }
    case 'interruption_ended': {
      const open = st.interruptions.find((i) => i.end === undefined);
      if (open) open.end = ev.at;
      st.phase = st.phaseBeforeInterruption ?? 'ready';
      st.phaseBeforeInterruption = undefined;
      return st;
    }
    case 'pain_reported': {
      st.pain.push({
        eventId: ev.id,
        at: ev.at,
        plannedSetId: ev.plannedSetId,
        location: ev.location,
        intensity: ev.intensity,
        stop: ev.stop,
      });
      if (ev.stop) st.safetyStop = true;
      return st;
    }
    case 'session_ended': {
      closeOpenRest(st, ev.at);
      st.endedAt = ev.at;
      st.phase = 'ended';
      return st;
    }
  }
}

function closeOpenRest(st: SessionState, at: EpochMs) {
  const last = st.rests[st.rests.length - 1];
  if (last && last.end === undefined) last.end = at;
}

function findSet(st: SessionState, id: string): SetState | undefined {
  return st.sets.find((s) => s.planned.id === id);
}

/**
 * Valide une commande contre l'état courant et produit les événements à ajouter.
 * Une commande invalide (double appui, état incohérent) ne produit rien.
 */
export function decide(st: SessionState | null, cmd: SessionCommand, ctx: DecideContext): DecideResult {
  const ev = <T extends Omit<SessionEvent, 'id' | 'sessionId' | 'at'>>(body: T) =>
    ({ ...body, id: ctx.newId(), sessionId: st?.sessionId ?? ctx.sessionId!, at: ctx.now }) as unknown as SessionEvent;
  const ok = (...events: SessionEvent[]): DecideResult => ({ ok: true, events });
  const fail = (error: Extract<DecideResult, { ok: false }>['error']): DecideResult => ({ ok: false, error });

  if (cmd.type === 'start_session') {
    if (st) return fail('session_already_started');
    if (!ctx.sessionId) return fail('invalid_value');
    return ok(ev({ type: 'session_started', plan: cmd.plan, timeZone: cmd.timeZone }));
  }
  if (!st) return fail('session_not_started');

  // Les corrections de résultat restent possibles après la fin : elles sont tracées.
  if (cmd.type === 'record_result') {
    const set = findSet(st, cmd.plannedSetId);
    if (!set) return fail('unknown_set');
    if (set.status !== 'in_progress' && set.status !== 'done') return fail('set_not_started');
    if (!isValidResult(cmd.result)) return fail('invalid_value');
    return ok(ev({ type: 'set_result_recorded', plannedSetId: cmd.plannedSetId, result: cmd.result }));
  }
  if (cmd.type === 'undo_result') {
    const entry = st.sets.flatMap((s) => s.entries).find((e) => e.eventId === cmd.targetEventId);
    if (!entry || entry.undone) return fail('unknown_result');
    return ok(ev({ type: 'result_undone', targetEventId: cmd.targetEventId }));
  }

  if (st.phase === 'ended') return fail('session_ended');

  switch (cmd.type) {
    case 'start_set': {
      const set = findSet(st, cmd.plannedSetId);
      if (!set) return fail('unknown_set');
      if (st.safetyStop) return fail('safety_stop');
      if (st.phase === 'in_set') return fail('already_in_set');
      if (st.phase === 'interrupted') return fail('cannot_interrupt_now');
      if (set.status !== 'pending') return fail('set_not_pending');
      return ok(ev({ type: 'set_started', plannedSetId: cmd.plannedSetId }));
    }
    case 'end_set': {
      if (st.phase !== 'in_set') return fail('not_in_set');
      if (st.currentSetId !== cmd.plannedSetId) return fail('wrong_set');
      return ok(ev({ type: 'set_ended', plannedSetId: cmd.plannedSetId }));
    }
    case 'skip_set': {
      const set = findSet(st, cmd.plannedSetId);
      if (!set) return fail('unknown_set');
      if (set.status !== 'pending') return fail('set_not_pending');
      return ok(ev({ type: 'set_skipped', plannedSetId: cmd.plannedSetId, reason: cmd.reason }));
    }
    case 'start_interruption': {
      if (st.phase !== 'ready' && st.phase !== 'resting') return fail('cannot_interrupt_now');
      return ok(ev({ type: 'interruption_started', reason: cmd.reason }));
    }
    case 'end_interruption': {
      if (st.phase !== 'interrupted') return fail('not_interrupted');
      return ok(ev({ type: 'interruption_ended' }));
    }
    case 'report_pain': {
      if (!Number.isFinite(cmd.intensity) || cmd.intensity < 0 || cmd.intensity > 10) return fail('invalid_value');
      const events: SessionEvent[] = [];
      // Un arrêt pour douleur clôt la série en cours au même instant.
      if (cmd.stop && st.phase === 'in_set' && st.currentSetId) {
        events.push(ev({ type: 'set_ended', plannedSetId: st.currentSetId }));
      }
      events.push(
        ev({ type: 'pain_reported', plannedSetId: cmd.plannedSetId, location: cmd.location, intensity: cmd.intensity, stop: cmd.stop }),
      );
      return ok(...events);
    }
    case 'end_session': {
      const events: SessionEvent[] = [];
      if (st.phase === 'in_set' && st.currentSetId) events.push(ev({ type: 'set_ended', plannedSetId: st.currentSetId }));
      if (st.phase === 'interrupted') events.push(ev({ type: 'interruption_ended' }));
      events.push(ev({ type: 'session_ended' }));
      return ok(...events);
    }
  }
}

function isValidResult(r: SetResult): boolean {
  const nonNeg = (v: number | undefined, max: number) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= max);
  return (
    nonNeg(r.reps, 1000) &&
    nonNeg(r.seconds, 24 * 3600) &&
    nonNeg(r.loadKg, 500) &&
    nonNeg(r.rir, 10) &&
    (r.reps === undefined || Number.isInteger(r.reps))
  );
}
