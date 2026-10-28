import type { PainState } from '../engine/readiness';
import type { PlannedSet } from '../engine/types';

/** Raison de retrait : reconnue comme décision du coach (COACH_REMOVED), jamais comptée comme un abandon. */
export const PAIN_HOLD_REASON = 'retirée par le coach : douleur revenue ou aggravée (contrôle avant séance), mouvement à revoir';

/**
 * Mouvements liés à une douleur signalée à la séance précédente (leur prescription porte « Douleur signalée… ») qu'il ne faut pas
 * lancer si TA réponse du jour est « douleur nouvelle » ou « aggravée ». Ta réponse actuelle prime sur tout retour ancien
 * (même « rien le lendemain »). Avec « aucune douleur » aujourd'hui, seuls les mouvements marqués « À REVOIR » (douleur encore présente
 * au dernier retour) restent retirés ; une réponse absente n'est jamais lue comme « aucune douleur ».
 */
export function painHeldBlocks(sets: Pick<PlannedSet, 'blockId' | 'role' | 'progression'>[], pain: PainState): Set<string> {
  // « À REVOIR » (douleur encore présente d'après tes réponses) : retiré tant qu'un retour plus récent ne le réévalue pas.
  const re = pain === 'aucune' ? /À REVOIR/ : /Douleur signalée/;
  return new Set(sets.filter((s) => s.role === 'work' && re.test(s.progression ?? '')).map((s) => s.blockId));
}
