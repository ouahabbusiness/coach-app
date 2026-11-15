// Réinitialisation complète : cloud (si connecté) puis appareil. Action destructive, confirmée par l'UI.

import type { Repository } from '../storage/db';
import { getSupabase } from './supabase';

export interface ResetResult {
  remote: boolean;
  local: { events: number; sessions: number; kv: number };
}

/** Efface les séances, réglages, messages Ippo et le profil. Ne touche pas au quota journalier. */
export async function resetEverything(repo: Repository): Promise<ResetResult> {
  const sb = getSupabase();
  let remote = false;

  if (sb) {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session) {
      const userId = session.user.id;
      for (const table of ['ippo_messages', 'kv_docs', 'session_events'] as const) {
        const { error } = await sb.from(table).delete().eq('user_id', userId);
        if (error) throw new Error(`Suppression cloud (${table}) : ${error.message}`);
      }
      remote = true;
    }
  }

  const local = await repo.deleteAll();
  return { remote, local };
}
