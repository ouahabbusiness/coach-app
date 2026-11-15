// Fusion locale/remote : pure, sans réseau.
import { describe, expect, it } from 'vitest';
import { chooseKv, eventRows, LOCAL_ONLY_KEYS } from '../src/backend/syncCore';
import type { KvRow } from '../src/storage/db';
import type { SessionEvent } from '../src/engine/types';

const kv = (key: string, updatedAt: number, value: unknown = key): KvRow => ({ key, updatedAt, value });

describe('chooseKv', () => {
  it('garde la valeur locale si elle est plus récente', () => {
    const local = [kv('onboarding', 200)];
    const remote = [{ key: 'onboarding', value: 'ancien', updated_at: 100 }];
    const merge = chooseKv(local, remote);
    expect(merge.toRemote.map((r) => r.key)).toEqual(['onboarding']);
    expect(merge.toLocal).toEqual([]);
  });

  it('applique la valeur distante si elle est plus récente', () => {
    const local = [kv('onboarding', 100)];
    const remote = [{ key: 'onboarding', value: 'récent', updated_at: 200 }];
    const merge = chooseKv(local, remote);
    expect(merge.toRemote).toEqual([]);
    expect(merge.toLocal).toEqual([{ key: 'onboarding', value: 'récent', updated_at: 200 }]);
  });

  it('ne pousse rien quand les dates sont égales', () => {
    const merge = chooseKv([kv('a', 100)], [{ key: 'a', value: 'x', updated_at: 100 }]);
    expect(merge.toLocal).toEqual([]);
    expect(merge.toRemote).toEqual([]);
  });

  it('pousse les clés absentes en distant et récupère les clés absentes en local', () => {
    const merge = chooseKv([kv('local-only', 10)], [{ key: 'remote-only', value: {}, updated_at: 20 }]);
    expect(merge.toRemote.map((r) => r.key)).toEqual(['local-only']);
    expect(merge.toLocal.map((r) => r.key)).toEqual(['remote-only']);
  });

  it('ne synchronise jamais la clé API ni l’état de synchro', () => {
    expect(LOCAL_ONLY_KEYS.has('ippo.config')).toBe(true);
    expect(LOCAL_ONLY_KEYS.has('sync.last')).toBe(true);
    const merge = chooseKv([kv('ippo.config', 999), kv('sync.last', 999)], [{ key: 'ippo.config', value: {}, updated_at: 1000 }]);
    expect(merge.toRemote).toEqual([]);
    expect(merge.toLocal).toEqual([]);
  });
});

describe('eventRows', () => {
  it('mappe les événements avec l’utilisateur et le savedAt fourni', () => {
    const event = {
      id: 'e1',
      sessionId: 's1',
      at: 123,
      type: 'session_ended',
    } as unknown as SessionEvent;
    const [row] = eventRows([event], 'u1', () => 456);
    expect(row).toEqual({ id: 'e1', session_id: 's1', at: 123, saved_at: 456, event });
  });
});
