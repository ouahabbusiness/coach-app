// Contrôle avant séance (5 questions + signal d'alerte). Règles de conception prudentes, pas un diagnostic.
// Ordre de priorité : sécurité > maladie > douleur > récupération > temps. Le mode « militaire » n'annule jamais ces règles.

export type PainState = 'aucune' | 'nouvelle' | 'aggravée';

export interface ReadinessInput {
  sleepBad: boolean;
  fatigue: boolean;
  pain: PainState;
  ill: boolean;
  shortTime: boolean;
  /** Douleur thoracique, malaise, perte de connaissance, essoufflement anormal important. */
  redFlag: boolean;
}

export interface ReadinessDecision {
  decision: 'normale' | 'adaptée' | 'reporter' | 'arrêt';
  /** Pas d'échec aujourd'hui (même si prévu sur la dernière série). */
  noFailure: boolean;
  /** Retirer une série aux exercices SECONDAIRES seulement (jamais jusqu'à zéro) ; les principaux s'ajustent en séance. */
  trimSecondary: boolean;
  /** Version courte : priorités gardées, assistance retirée en partant de la fin. */
  shorten: boolean;
  reason: string;
}

export function readiness(i: ReadinessInput): ReadinessDecision {
  const base = { noFailure: false, trimSecondary: false, shorten: false };
  if (i.redFlag) return { ...base, decision: 'arrêt', reason: 'Signal d’alerte : arrête l’effort. En cas de douleur thoracique, malaise ou essoufflement anormal : appelle le 112.' };
  if (i.ill) return { ...base, decision: 'reporter', reason: 'Malade : pas d’entraînement aujourd’hui, aucune pénalité, rien à rattraper en double.' };
  const out = { ...base, decision: 'normale' as ReadinessDecision['decision'], reason: 'Feu vert : séance prévue.' };
  const notes: string[] = [];
  if (i.pain !== 'aucune') {
    out.decision = 'adaptée';
    out.noFailure = true;
    notes.push(`Douleur ${i.pain} : évite le mouvement qui fait mal (bouton douleur en séance), pas d’échec. Si elle persiste, consulte un professionnel.`);
  }
  if (i.sleepBad && i.fatigue) {
    out.decision = 'adaptée';
    out.noFailure = true;
    out.trimSecondary = true;
    notes.push('Mauvaise nuit + fatigue : échauffement d’abord ; les exercices secondaires perdent une série, les principaux s’ajustent selon tes premières séries. Pas d’échec.');
  } else if (i.sleepBad || i.fatigue) {
    out.noFailure = true;
    notes.push(`${i.sleepBad ? 'Mauvaise nuit' : 'Fatigue'} : séance normale, mais pas d’échec aujourd’hui.`);
  }
  if (i.shortTime) {
    out.decision = 'adaptée';
    out.shorten = true;
    notes.push('Peu de temps : on garde les mouvements prioritaires, l’assistance saute.');
  }
  if (notes.length) out.reason = notes.join(' ');
  return out;
}
