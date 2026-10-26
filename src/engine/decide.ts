// Décision de progression, exercice par exercice (double progression), avec sa trace complète.
// Les seuils ci-dessous sont des CHOIX DE CONCEPTION ajustables, pas des lois scientifiques :
//  - progression autorisée si toutes les séries atteignent le haut de la plage avec l'effort prévu (RIR ≥ cible) ;
//  - effort inconnu (« je ne sais pas ») : on demande une confirmation sur 2 séances comparables ;
//  - cible atteinte avec plus d'effort que prévu : pas de progression ;
//  - sous le bas de la plage : on examine d'abord (une mauvaise séance isolée ne change rien), on réduit si ça se répète ;
//  - douleur : la sécurité passe avant tout, aucune progression.

import type { SetResult } from './types';
import { bigJump, loadDown, loadUp } from './progression';

export interface Rx {
  lo: number;
  hi: number;
  /** Répétitions en réserve visées. */
  rir: number;
  loadKg?: number;
  /** Cible actuelle dans la plage. */
  target: number;
}

export type Action = 'augmenter' | 'maintenir' | 'réduire' | 'observer';

export interface Decision {
  action: Action;
  variantId: string;
  before: { loadKg?: number; target: number };
  after: { loadKg?: number; target: number };
  /** États distincts : séance faite, cible atteinte, progression autorisée. */
  done: boolean;
  targetReached: boolean;
  progressionAllowed: boolean;
  observations: string[];
  rule: string;
  missing: string[];
  reason: string;
  reevaluate: string;
}

const fmt = (n: number) => n.toLocaleString('fr-BE', { maximumFractionDigits: 2 });
const loadOf = (rs: SetResult[]) => rs.reduce<number | undefined>((m, r) => (r.loadKg !== undefined ? Math.max(m ?? 0, r.loadKg) : m), undefined);

/**
 * `sessions` : séries de travail des dernières séances comparables (même variante), la plus récente d'abord.
 * `loads` : charges réalisables avec le matériel (vide = poids du corps).
 */
export function decide(variantId: string, rx: Rx, sessions: SetResult[][], loads: number[], opts: { pain?: boolean } = {}): Decision {
  const base = { variantId, before: { loadKg: rx.loadKg, target: rx.target } };
  const keep = (extra: Partial<Decision> & Pick<Decision, 'rule' | 'reason'>): Decision => ({
    ...base,
    action: 'maintenir',
    after: { loadKg: rx.loadKg, target: rx.target },
    done: false,
    targetReached: false,
    progressionAllowed: false,
    observations: [],
    missing: [],
    reevaluate: 'prochaine séance comparable',
    ...extra,
  });

  const last = sessions[0];
  if (!last || last.length === 0) return keep({ action: 'observer', rule: 'aucune donnée', reason: 'Pas encore de séance comparable : on calibre.', missing: ['résultats de la première séance'] });
  if (opts.pain) return keep({ done: true, rule: 'sécurité', reason: 'Douleur signalée : aucune progression, le mouvement est réévalué.', observations: ['douleur signalée'] });

  const reps = last.map((r) => r.reps);
  if (reps.some((r) => r === undefined)) return keep({ done: true, rule: 'données incomplètes', reason: 'Répétitions manquantes : aucune réussite n’est supposée.', missing: ['répétitions de chaque série'] });
  const min = Math.min(...(reps as number[]));
  const load = loadOf(last) ?? rx.loadKg;
  const obs = [`${reps.join(' / ')} rép.${load ? ` à ${fmt(load)} kg` : ''}`, `plage ${rx.lo}–${rx.hi}, réserve visée ${rx.rir}`];
  const targetReached = min >= rx.target;
  const allTop = min >= rx.hi;
  const rirs = last.map((r) => r.rir);
  const effortKnown = rirs.every((r) => r !== undefined);
  const harder = effortKnown && rirs.some((r) => (r as number) < rx.rir);
  if (effortKnown) obs.push(`réserve ${rirs.join(' / ')}`);

  const common = { done: true, targetReached, observations: obs };

  if (min < rx.lo) {
    const prev = sessions[1];
    const prevLow = prev && prev.length && Math.min(...prev.map((r) => r.reps ?? 0)) < rx.lo && loadOf(prev) === load;
    if (prevLow && load !== undefined && load > 0) {
      const down = loadDown(load, loads);
      return { ...base, ...common, action: 'réduire', after: { loadKg: down, target: rx.lo }, progressionAllowed: false, rule: 'sous la plage 2 séances de suite', reason: `Deux séances sous ${rx.lo} rép. à ${fmt(load)} kg : on redescend à ${fmt(down)} kg.`, missing: [], reevaluate: 'prochaine séance' };
    }
    return keep({ ...common, rule: 'séance isolée sous la plage', reason: 'Une séance moins bonne ne change rien : vérifie sommeil, repos pris, variante.', missing: ['sommeil', 'repos réellement pris'] });
  }

  if (!allTop) {
    const target = Math.min(rx.hi, min + 1);
    return { ...base, ...common, action: 'maintenir', after: { loadKg: load, target }, progressionAllowed: false, rule: 'double progression : répétitions d’abord', reason: `Même charge, vise ${target} rép. sur toutes les séries.`, missing: [], reevaluate: 'prochaine séance' };
  }

  if (harder) return keep({ ...common, after: { loadKg: load, target: rx.hi }, rule: 'cible atteinte avec trop d’effort', reason: 'Haut de plage atteint, mais plus dur que prévu : on consolide avant de monter.' });

  if (!effortKnown) {
    const prev = sessions[1];
    const confirmed = prev && prev.length && Math.min(...prev.map((r) => r.reps ?? 0)) >= rx.hi && loadOf(prev) === load;
    if (!confirmed) return keep({ ...common, after: { loadKg: load, target: rx.hi }, rule: 'confirmation sur 2 séances', reason: 'Haut de plage atteint, effort non noté : à confirmer à la prochaine séance.', missing: ['réserve (RIR)'] });
    obs.push('confirmé sur 2 séances');
  }

  // Progression autorisée : plus petit incrément réalisable.
  if (load === undefined || load === 0) {
    const first = loads.find((l) => l > 0);
    if (first === undefined) return keep({ ...common, progressionAllowed: true, after: { loadKg: undefined, target: rx.hi }, rule: 'haut de plage au poids du corps', reason: 'Plage maîtrisée au poids du corps : variante plus difficile à valider avec le coach.' });
    return { ...base, ...common, action: 'augmenter', progressionAllowed: true, after: { loadKg: first, target: rx.lo }, rule: 'double progression', reason: `Haut de plage maîtrisé : ajoute ${fmt(first)} kg, retour à ${rx.lo} rép.`, missing: [], reevaluate: 'prochaine séance' };
  }
  const up = loadUp(load, loads);
  if (up === undefined) return keep({ ...common, progressionAllowed: true, after: { loadKg: load, target: rx.hi }, rule: 'matériel au maximum', reason: `Haut de plage à ${fmt(load)} kg, ta charge maximale : il faut plus lourd (matériel conseillé).` });
  if (bigJump(load, up) && min < rx.hi + 2) {
    return { ...base, ...common, action: 'maintenir', progressionAllowed: false, after: { loadKg: load, target: rx.hi + 2 }, rule: 'gros saut de charge', reason: `Le palier suivant (${fmt(up)} kg) est un gros saut : d’abord ${rx.hi + 2} rép. à ${fmt(load)} kg.`, missing: [], reevaluate: 'prochaine séance' };
  }
  return { ...base, ...common, action: 'augmenter', progressionAllowed: true, after: { loadKg: up, target: rx.lo }, rule: 'double progression', reason: `Haut de plage avec l’effort prévu : ${fmt(load)} → ${fmt(up)} kg, retour à ${rx.lo} rép.`, missing: [], reevaluate: 'prochaine séance' };
}
