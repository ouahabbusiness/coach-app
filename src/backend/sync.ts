// Synchronisation manuelle local ⇄ Supabase.
// Ordre : tirer les événements manquants → fusionner les réglages → pousser le reste.
// Idempotent : un événement déjà connu (même UUID) est ignoré des deux côtés.

import type { Repository } from '../storage/db';
import type { SessionEvent } from '../engine/types';
import { getSupabase } from './supabase';
import { chooseKv, eventRows, LOCAL_ONLY_KEYS, type RemoteEventRow, type RemoteKvRow } from './syncCore';

const PAGE = 500;

export interface SyncResult {
  at: number;
  pulledEvents: number;
  pushedEvents: number;
  pulledKv: number;
  pushedKv: number;
}

export interface SyncState extends SyncResult {
  userEmail?: string;
}

export async function syncAll(repo: Repository): Promise<SyncResult> {
  const sb = getSupabase();
  if (!sb) throw new Error('Backend non configuré.');
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error('Connecte-toi pour synchroniser.');
  const userId = session.user.id;

  const local = await repo.exportAll();
  const localIds = new Set(local.events.map((e) => e.id));

  // 1. Événements distants absents en local (pagination PostgREST).
  const remoteEvents: RemoteEventRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('session_events')
      .select('id,session_id,at,saved_at,event')
      .order('inserted_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Lecture des séances : ${error.message}`);
    if (!data || data.length === 0) break;
    remoteEvents.push(...(data as RemoteEventRow[]));
    if (data.length < PAGE) break;
  }
  const missing: SessionEvent[] = remoteEvents.filter((r) => !localIds.has(r.id)).map((r) => r.event);
  const pulledEvents = missing.length ? await repo.append(missing) : 0;

  // 2. Réglages : fusion last-write-wins (les clés locales secrètes sont exclues).
  const { data: kvData, error: kvError } = await sb.from('kv_docs').select('key,value,updated_at');
  if (kvError) throw new Error(`Lecture des réglages : ${kvError.message}`);
  const merge = chooseKv(local.kv, (kvData ?? []) as RemoteKvRow[]);
  for (const row of merge.toLocal) await repo.setKv(row.key, row.value);
  const pulledKv = merge.toLocal.length;

  // 3. Pousser les événements locaux (les doublons sont ignorés par la base).
  const rows = eventRows(local.events, userId, () => Date.now());
  let pushedEvents = 0;
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    const { data, error } = await sb
      .from('session_events')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`Envoi des séances : ${error.message}`);
    pushedEvents += data?.length ?? 0;
  }

  // 4. Pousser les réglages locaux absents ou plus récents.
  const kvRows = merge.toRemote
    .filter((r) => !LOCAL_ONLY_KEYS.has(r.key))
    .map((r) => ({ user_id: userId, key: r.key, value: r.value, updated_at: r.updatedAt }));
  let pushedKv = 0;
  for (let i = 0; i < kvRows.length; i += PAGE) {
    const chunk = kvRows.slice(i, i + PAGE);
    const { data, error } = await sb
      .from('kv_docs')
      .upsert(chunk, { onConflict: 'user_id,key' })
      .select('key');
    if (error) throw new Error(`Envoi des réglages : ${error.message}`);
    pushedKv += data?.length ?? 0;
  }

  const result: SyncResult = { at: Date.now(), pulledEvents, pushedEvents, pulledKv, pushedKv };
  await repo.setKv('sync.last', result);
  return result;
}
