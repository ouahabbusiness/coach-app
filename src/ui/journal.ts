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
  // Identifiant déterministe (plan + variante) : rejouer le même lancement ne crée pas de doublon.
  const entries = decisions.map((d) => ({ ...d, id: programVersion ? `${programVersion}:${d.variantId}` : newId(), at: Date.now(), context, programVersion }));
  const all = await loadJournal(repo);
  const ids = new Set(entries.map((e) => e.id));
  // On garde les 500 dernières décisions (largement assez pour relire un bloc).
  await repo.setKv(KEY, [...all.filter((e) => !ids.has(e.id)), ...entries].slice(-500));
  return entries;
}
