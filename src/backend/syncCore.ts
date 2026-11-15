// Fusion locale/remote, sans réseau : testable et sans dépendance à Supabase.
// Règles : un événement est identifié par son UUID (idempotence) ; un réglage suit
// le last-write-wins sur `updatedAt` (ms). Une clé secrète locale n'est jamais synchronisée.

import type { KvRow } from '../storage/db';
import type { SessionEvent } from '../engine/types';

/** Clés qui ne doivent jamais quitter l'appareil (secret ou état purement local). */
export const LOCAL_ONLY_KEYS = new Set(['ippo.config', 'sync.last']);

export interface RemoteKvRow {
  key: string;
  value: unknown;
  updated_at: number;
}

export interface RemoteEventRow {
  id: string;
  session_id: string;
  at: number;
  saved_at: number;
  event: SessionEvent;
}

export interface KvMerge {
  /** Valeurs distantes plus récentes à appliquer en local. */
  toLocal: RemoteKvRow[];
  /** Valeurs locales à pousser (absentes ou plus récentes en local). */
  toRemote: KvRow[];
}

/** Compare les réglages locaux et distants. À égalité, on ne pousse pas (évite le bruit). */
export function chooseKv(local: KvRow[], remote: RemoteKvRow[]): KvMerge {
  const remoteByKey = new Map(remote.filter((r) => !LOCAL_ONLY_KEYS.has(r.key)).map((r) => [r.key, r]));
  const toLocal: RemoteKvRow[] = [];
  const toRemote: KvRow[] = [];

  for (const l of local) {
    if (LOCAL_ONLY_KEYS.has(l.key)) continue;
    const r = remoteByKey.get(l.key);
    if (!r) toRemote.push(l);
    else if (l.updatedAt > r.updated_at) toRemote.push(l);
    else if (r.updated_at > l.updatedAt) toLocal.push(r);
    remoteByKey.delete(l.key);
  }
  for (const r of remoteByKey.values()) toLocal.push(r);

  return { toLocal, toRemote };
}

/** Lignes à insérer côté serveur pour un lot d'événements locaux. */
export function eventRows(events: SessionEvent[], userId: string, savedAt: (id: string) => number): RemoteEventRow[] {
  return events.map((event) => ({
    id: event.id,
    session_id: event.sessionId,
    at: event.at,
    saved_at: savedAt(event.id),
    event,
  }));
}
