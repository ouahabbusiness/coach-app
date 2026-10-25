// Accès à une séance : lit le journal, applique les commandes, persiste avant d'afficher.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decide, project } from '../engine/session';
import type { DecideResult, SessionCommand, SessionEvent, SessionState } from '../engine/types';
import type { Repository } from '../storage/db';
import { newId } from './support';

export type SendResult = DecideResult | { ok: false; error: 'busy' | 'storage_error' };

export function useSession(repo: Repository, sessionId: string) {
  const [events, setEvents] = useState<SessionEvent[] | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    repo.sessionEvents(sessionId).then((ev) => alive && setEvents(ev));
    return () => {
      alive = false;
    };
  }, [repo, sessionId]);

  const send = useCallback(
    async (cmd: SessionCommand): Promise<SendResult> => {
      // L'instant est capturé au moment de l'appui, avant toute attente.
      const now = Date.now();
      if (busy.current) return { ok: false, error: 'busy' };
      busy.current = true;
      try {
        const current = await repo.sessionEvents(sessionId);
        const res = decide(project(current), cmd, { now, newId, sessionId });
        if (!res.ok) return res;
        try {
          await repo.append(res.events);
        } catch (e) {
          setStorageError(e instanceof Error ? e.message : String(e));
          return { ok: false, error: 'storage_error' };
        }
        setStorageError(null);
        setEvents([...current, ...res.events]);
        return res;
      } finally {
        busy.current = false;
      }
    },
    [repo, sessionId],
  );

  const state: SessionState | null = useMemo(() => (events ? project(events) : null), [events]);
  return { state, loaded: events !== null, send, storageError };
}
