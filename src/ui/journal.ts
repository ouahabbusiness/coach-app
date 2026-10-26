// Journal des décisions du coach : chaque changement est sauvegardé AVANT d'être annoncé.
// Format : décision, élément, avant/après, observations, règle, manques, justification, réévaluation, version.

import type { Decision } from '../engine/decide';
import type { Repository } from '../storage/db';
import { newId } from './support';

const KEY = 'decisions.log';

export interface JournalEntry extends Decision {
  id: string;
  at: number;
  /** Séance (lancement) ou bilan qui a produit la décision. */
  context: string;
  programVersion?: string;
}

export async function loadJournal(repo: Repository): Promise<JournalEntry[]> {
  return (await repo.getKv<JournalEntry[]>(KEY)) ?? [];
}

export async function appendJournal(repo: Repository, decisions: Decision[], context: string, programVersion?: string): Promise<JournalEntry[]> {
  const entries = decisions.map((d) => ({ ...d, id: newId(), at: Date.now(), context, programVersion }));
  const all = await loadJournal(repo);
  // On garde les 500 dernières décisions (largement assez pour relire un bloc).
  await repo.setKv(KEY, [...all, ...entries].slice(-500));
  return entries;
}
