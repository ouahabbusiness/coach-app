// Travail hors programme (EMOM, séries libres) : enregistré comme TRAVAIL EFFECTUÉ, jamais converti en maximum.
// On distingue le volume brut, l'effort connu et ce qui reste incertain.
// Les règles de la prochaine décision sont des choix de conception prudents, pas des lois.

import { loadUp } from './progression';

export type Grip = 'pronation' | 'supination' | 'neutre';

export interface FreeBlock {
  id: string;
  day: string;
  at: number;
  format: 'emom' | 'series';
  variantId: string;
  grip?: Grip;
  /** Amplitude complète, sans élan. */
  strict?: boolean;
  assistance?: string;
  loadKg?: number;
  /** EMOM : répétitions visées par minute. */
  targetPerRound?: number;
  /** Répétitions réellement faites par minute (EMOM) ou par série ; null = non noté. */
  rounds: (number | null)[];
  /** Temps moyen pour faire les répétitions d'une minute (s) → repos réel restant. */
  secondsPerRound?: number;
  /** Difficulté ressentie 1–10 au début et à la fin. */
  difficultyStart?: number;
  difficultyEnd?: number;
  pain?: string;
  bodyWeightKg?: number;
  note?: string;
}

export interface FreeSummary {
  totalReps: number;
  roundsDone: number;
  roundsTotal: number;
  roundsUnknown: number;
  /** Charge × répétitions (kg), si lest. */
  tonnage?: number;
  restSeconds?: number;
  /** Ce qui reste incertain, à afficher tel quel. */
  uncertain: string[];
}

export function summarize(b: FreeBlock): FreeSummary {
  const known = b.rounds.filter((r): r is number => r !== null);
  const totalReps = known.reduce((a, r) => a + r, 0);
  const target = b.targetPerRound;
  const uncertain: string[] = [];
  if (b.format === 'emom') uncertain.push(`${b.rounds.length} passages ≠ ${b.rounds.length} séries équivalentes pour le muscle : l’effort réel de chaque minute est inconnu.`);
  if (b.difficultyEnd === undefined) uncertain.push('Difficulté de fin non notée.');
  if (b.strict === undefined) uncertain.push('Amplitude (stricte ou non) non précisée.');
  if (known.length < b.rounds.length) uncertain.push(`${b.rounds.length - known.length} minute(s) non renseignée(s).`);
  return {
    totalReps,
    roundsDone: target !== undefined ? known.filter((r) => r >= target).length : known.length,
    roundsTotal: b.rounds.length,
    roundsUnknown: b.rounds.length - known.length,
    tonnage: b.loadKg ? totalReps * b.loadKg : undefined,
    restSeconds: b.format === 'emom' && b.secondsPerRound !== undefined ? Math.max(0, 60 - b.secondsPerRound) : undefined,
    uncertain,
  };
}

export interface FreeDecision {
  action: 'répéter' | 'augmenter le lest' | 'réduire les répétitions' | 'maintenir et observer' | 'sécurité';
  next?: { loadKg?: number; targetPerRound?: number; minutes: number };
  reason: string;
  missing: string[];
}

/**
 * Prochaine fois pour un EMOM comparable (même exercice, même prise, même format).
 * `history` : blocs comparables précédents, le plus récent d'abord (celui du jour inclus en premier).
 * Jamais « 72 rép. faites donc plus la prochaine fois » sans qualité, effort et récupération connus.
 */
export function nextEmom(history: FreeBlock[], loads: number[], recoveredWell?: boolean): FreeDecision {
  const b = history[0];
  if (!b || b.format !== 'emom' || b.targetPerRound === undefined) return { action: 'maintenir et observer', reason: 'Pas assez d’informations sur ce bloc.', missing: ['format EMOM et répétitions visées'] };
  const minutes = b.rounds.length;
  if (b.pain) return { action: 'sécurité', reason: `Douleur signalée (${b.pain}) : pas de progression, le mouvement est réévalué.`, missing: [] };
  const s = summarize(b);
  const missing: string[] = [];
  if (b.difficultyEnd === undefined) missing.push('difficulté de fin');
  if (b.strict === undefined) missing.push('amplitude stricte ?');
  if (recoveredWell === undefined) missing.push('récupération les jours suivants');
  if (s.roundsUnknown) missing.push('répétitions de chaque minute');
  const same = { loadKg: b.loadKg, targetPerRound: b.targetPerRound, minutes };
  if (missing.length) return { action: 'maintenir et observer', next: same, reason: 'Données incomplètes : on refait le même protocole avant de décider.', missing };
  if (s.roundsDone < minutes) {
    return { action: 'réduire les répétitions', next: { ...same, targetPerRound: Math.max(1, b.targetPerRound - 1) }, reason: `${minutes - s.roundsDone} minute(s) sous la cible : même lest, une répétition de moins par minute.`, missing: [] };
  }
  if (recoveredWell === false || (b.difficultyEnd ?? 10) >= 9) return { action: 'répéter', next: same, reason: 'Réussi mais très dur ou récupération difficile : on répète à l’identique.', missing: [] };
  // Reproductibilité : deux réussites comparables d'affilée, fin pas trop dure → plus petit incrément de lest.
  const prev = history[1];
  const prevOk = prev && prev.format === 'emom' && prev.targetPerRound === b.targetPerRound && prev.loadKg === b.loadKg && summarize(prev).roundsDone === prev.rounds.length;
  if (!prevOk) return { action: 'répéter', next: same, reason: 'Première réussite : on vérifie qu’elle se reproduit avant d’augmenter.', missing: [] };
  const up = b.loadKg !== undefined ? loadUp(b.loadKg, loads) : undefined;
  if (up === undefined) return { action: 'répéter', next: same, reason: 'Plus d’incrément de lest disponible : garde le protocole ou passe en séries classiques.', missing: [] };
  return { action: 'augmenter le lest', next: { ...same, loadKg: up }, reason: `Réussi deux fois à l’identique, fin ${b.difficultyEnd}/10 : ${b.loadKg} → ${up} kg, mêmes répétitions.`, missing: [] };
}
