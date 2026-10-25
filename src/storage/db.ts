// Stockage local (IndexedDB via Dexie). Source de vérité : le journal d'événements.
// La table `sessions` n'est qu'un index recalculable à partir du journal.

import Dexie, { type Table } from 'dexie';
import { project } from '../engine/session';
import { sessionOutcome } from '../engine/derive';
import type { SessionEvent, SessionOutcome } from '../engine/types';

export interface StoredEvent {
  seq?: number;
  id: string;
  sessionId: string;
  at: number;
  /** Instant d'écriture locale, distinct de l'instant de l'action. */
  savedAt: number;
  event: SessionEvent;
}

export interface SessionSummaryRow {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  outcome: SessionOutcome;
}

export interface KvRow {
  key: string;
  value: unknown;
  updatedAt: number;
}

export class CoachDb extends Dexie {
  events!: Table<StoredEvent, number>;
  sessions!: Table<SessionSummaryRow, string>;
  kv!: Table<KvRow, string>;

  constructor(name = 'coach-app') {
    super(name);
    this.version(1).stores({
      events: '++seq, &id, sessionId',
      sessions: 'id, startedAt, outcome',
      kv: 'key',
    });
  }
}

export const EXPORT_FORMAT = 'coach-app-export';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  events: SessionEvent[];
  kv: KvRow[];
}

export class Repository {
  constructor(private db: CoachDb) {}

  /**
   * Ajoute des événements de façon atomique. Un événement déjà connu (même id) est ignoré :
   * rejouer un lot ne crée jamais de doublon.
   */
  async append(events: SessionEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    return this.db.transaction('rw', this.db.events, this.db.sessions, async () => {
      let added = 0;
      const touched = new Set<string>();
      for (const event of events) {
        const exists = await this.db.events.where('id').equals(event.id).count();
        if (exists) continue;
        await this.db.events.add({ id: event.id, sessionId: event.sessionId, at: event.at, savedAt: Date.now(), event });
        touched.add(event.sessionId);
        added++;
      }
      for (const sessionId of touched) await this.refreshSummary(sessionId);
      return added;
    });
  }

  async sessionEvents(sessionId: string): Promise<SessionEvent[]> {
    const rows = await this.db.events.where('sessionId').equals(sessionId).sortBy('seq');
    return rows.map((r) => r.event);
  }

  async openSession(): Promise<SessionSummaryRow | undefined> {
    const open = await this.db.sessions.where('outcome').equals('in_progress').toArray();
    return open.sort((a, b) => b.startedAt - a.startedAt)[0];
  }

  async listSessions(): Promise<SessionSummaryRow[]> {
    return (await this.db.sessions.orderBy('startedAt').reverse().toArray());
  }

  async allSessionEvents(): Promise<Map<string, SessionEvent[]>> {
    const rows = await this.db.events.orderBy('seq').toArray();
    const map = new Map<string, SessionEvent[]>();
    for (const r of rows) {
      const list = map.get(r.sessionId) ?? [];
      list.push(r.event);
      map.set(r.sessionId, list);
    }
    return map;
  }

  async getKv<T>(key: string): Promise<T | undefined> {
    return (await this.db.kv.get(key))?.value as T | undefined;
  }

  async setKv(key: string, value: unknown): Promise<void> {
    await this.db.kv.put({ key, value, updatedAt: Date.now() });
  }

  async exportAll(): Promise<ExportFile> {
    const rows = await this.db.events.orderBy('seq').toArray();
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      events: rows.map((r) => r.event),
      kv: await this.db.kv.toArray(),
    };
  }

  /** Importe un export. Refuse tout fichier dont le format n'est pas reconnu. */
  async importAll(data: unknown): Promise<{ events: number }> {
    if (!isExportFile(data)) throw new Error('Fichier non reconnu : ce n’est pas un export de cette application.');
    if (data.version > EXPORT_VERSION) throw new Error('Export créé par une version plus récente de l’application.');
    const added = await this.append(data.events);
    await this.db.transaction('rw', this.db.kv, async () => {
      for (const row of data.kv) {
        const existing = await this.db.kv.get(row.key);
        if (!existing || existing.updatedAt < row.updatedAt) await this.db.kv.put(row);
      }
    });
    return { events: added };
  }

  /** Recalcule tous les index depuis le journal (après migration ou correction). */
  async rebuildSummaries(): Promise<void> {
    const ids = new Set((await this.db.events.toArray()).map((r) => r.sessionId));
    await this.db.transaction('rw', this.db.events, this.db.sessions, async () => {
      await this.db.sessions.clear();
      for (const id of ids) await this.refreshSummary(id);
    });
  }

  private async refreshSummary(sessionId: string) {
    const st = project(await this.sessionEvents(sessionId));
    if (!st) return;
    await this.db.sessions.put({
      id: sessionId,
      title: st.plan.title,
      startedAt: st.startedAt,
      endedAt: st.endedAt,
      outcome: sessionOutcome(st),
    });
  }
}

function isExportFile(d: unknown): d is ExportFile {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  return (
    o.format === EXPORT_FORMAT &&
    typeof o.version === 'number' &&
    Array.isArray(o.events) &&
    Array.isArray(o.kv) &&
    o.events.every((e) => typeof e === 'object' && e !== null && typeof (e as SessionEvent).id === 'string' && typeof (e as SessionEvent).sessionId === 'string')
  );
}
