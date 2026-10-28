// Décision de progression, exercice par exercice, avec sa trace complète.
// Les seuils sont des CHOIX DE CONCEPTION ajustables, pas des lois scientifiques. Principes :
//  - seules les séances COMPARABLES comptent (même prescription, ni allégée par le coach, ni interrompue, ni malade) ;
//  - une séance partielle ne valide jamais une progression ; une série retirée par le coach n'est pas un échec ;
//  - progression si toutes les séries prévues atteignent le haut de la plage avec l'effort prévu ;
//  - effort non noté : confirmation sur 2 séances comparables ; effort excessif : pas de hausse ;
//  - saut de charge important (> 10 % de la résistance totale, poids du corps compris pour le lest) :
//    TRANSITION = une série d'essai à la nouvelle charge, confirmée par les résultats avant de tout basculer ;
//  - deux séances comparables sous la plage : ANALYSE + proposition de baisse à valider, jamais une baisse automatique ;
//  - douleur : sécurité d'abord, aucune progression.

import type { SetResult } from './types';
import { loadUp } from './progression';
import { loadDown } from './progression';

export interface Rx {
  lo: number;
  hi: number;
  /** Répétitions en réserve visées. */
  rir: number;
  loadKg?: number;
  /** Cible actuelle dans la plage. */
  target: number;
}

/** Une séance passée sur cette variante. */
export interface Sample {
  /** Séries de travail réalisées (résultats saisis). */
  results: SetResult[];
  /** Séries demandées (hors séries retirées par le coach). */
  planned: number;
  /** Faux si allégée par le coach, interrompue, prescription différente… */
  comparable: boolean;
  why?: string;
}

export type Action = 'augmenter' | 'maintenir' | 'réduire' | 'observer' | 'transition';

export interface Decision {
  action: Action;
  variantId: string;
  before: { loadKg?: number; target: number };
  after: { loadKg?: number; target: number };
  /** Série(s) d'essai à une charge plus haute (transition). */
  transition?: { loadKg: number; sets: number; target: number };
  /** Proposition à valider par l'utilisateur (non appliquée tant qu'elle n'est pas validée). */
  proposal?: boolean;
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
const maxLoad = (rs: SetResult[]) => rs.reduce<number | undefined>((m, r) => (r.loadKg !== undefined ? Math.max(m ?? 0, r.loadKg) : m), undefined);
const minLoad = (rs: SetResult[]) => rs.reduce<number | undefined>((m, r) => (r.loadKg !== undefined ? Math.min(m ?? Infinity, r.loadKg) : m), undefined);

export interface DecideOpts {
  pain?: boolean;
  /** Poids du corps : la résistance réelle des tractions/dips lestés = poids du corps + lest. */
  bodyweightKg?: number;
  addedLoad?: boolean;
  /** Mouvement dont la tolérance n'est pas confirmée alors qu'une gêne est déclarée (décidé par l'appelant, d'après l'état du mouvement) : les répétitions montent, pas la charge. */
  guarded?: boolean;
  /** Évolution d'une douleur signalée à la dernière séance, d'après TES réponses : encore présente, disparue (rien le lendemain) ou non renseignée. */
  painState?: 'presente' | 'resolue' | 'inconnue';
  /** Seuil de saut « important » en part de la résistance totale (choix de conception). */
  bigJumpRatio?: number;
}

function decideCore(variantId: string, rx: Rx, samples: Sample[], loads: number[], opts: DecideOpts = {}): Decision {
  const last = samples[0];
  // Charge réellement faite à la dernière séance (ex. +12 kg) : c'est elle qui est maintenue, pas la charge de départ du modèle (ex. +5 kg).
  const held = last ? maxLoad(last.results) : undefined;
  // « Avant » = ce que tu faisais réellement ; une proposition en attente de validation retombe sur cette charge, jamais sur celle du modèle.
  const base = { variantId, before: { loadKg: held ?? rx.loadKg, target: rx.target } };
  const keep = (extra: Partial<Decision> & Pick<Decision, 'rule' | 'reason'>): Decision => {
    const d: Decision = {
      ...base,
      action: 'maintenir',
      after: { loadKg: held ?? rx.loadKg, target: rx.target },
      done: false,
      targetReached: false,
      progressionAllowed: false,
      observations: [],
      missing: [],
      reevaluate: 'prochaine séance comparable',
      ...extra,
    };
    return !extra.after && held !== undefined && held !== rx.loadKg ? { ...d, reason: `${d.reason} Charge reprise de ta dernière séance (${fmt(held)} kg) : une référence, pas une obligation ; une baisse validée ou une adaptation plus récente prime.`, observations: [...d.observations, `charge reprise : ${fmt(held)} kg`] } : d;
  };

  if (!last || last.results.length === 0) return keep({ action: 'observer', rule: 'aucune donnée', reason: 'Pas encore de séance comparable : on calibre.', missing: ['résultats de la première séance'] });
  if (opts.pain) {
    const at = held !== undefined ? ` à ${fmt(held)} kg` : '';
    const ref = held !== undefined ? `${fmt(held)} kg = ta dernière charge, pas une charge validée. ` : '';
    const state = opts.painState ?? 'inconnue';
    const [rule, reason, missing] =
      state === 'presente'
        ? ['sécurité', `Douleur signalée${at}, encore présente le lendemain : mouvement À REVOIR avant d’être prescrit. ${ref}Ne le fais pas tant que la douleur est là ; une douleur vive ou qui persiste justifie un avis (médecin, kiné).`, [] as string[]]
        : state === 'resolue'
          ? ['sécurité', `Douleur signalée${at}, plus rien le lendemain : pas de hausse. ${ref}Reprise proposée puisque la gêne a disparu ; à confirmer pendant la séance.`, [] as string[]]
          : ['sécurité', `Douleur signalée${at}, évolution non renseignée : réponds au retour du lendemain avant de décider. ${ref}Pas de hausse.`, ['retour du lendemain sur la douleur']];
    return keep({ done: true, rule, reason, missing, observations: ['douleur signalée', `douleur : ${state}`], after: { loadKg: held ?? rx.loadKg, target: rx.target } });
  }
  if (!last.comparable) return keep({ action: 'observer', done: true, rule: 'séance non comparable', reason: `Séance non comparable (${last.why ?? 'conditions différentes'}) : elle ne compte ni comme progrès ni comme échec.` });

  const reps = last.results.map((r) => r.reps);
  if (reps.some((r) => r === undefined)) return keep({ done: true, rule: 'données incomplètes', reason: 'Répétitions manquantes : aucune réussite n’est supposée.', missing: ['répétitions de chaque série'] });
  const repsN = reps as number[];
  const load = maxLoad(last.results) ?? rx.loadKg;
  const obs = [`${repsN.join(' / ')} rép.${load ? ` (max ${fmt(load)} kg)` : ''}`, `plage ${rx.lo}–${rx.hi}, réserve visée ${rx.rir}`];
  const rirs = last.results.map((r) => r.rir);
  const effortKnown = rirs.every((r) => r !== undefined);
  if (effortKnown) obs.push(`réserve ${rirs.join(' / ')}`);
  const partial = last.results.length < last.planned;

  // Transition en cours : séries à deux charges → on juge la série d'essai (charge la plus haute).
  const lo = minLoad(last.results);
  if (load !== undefined && lo !== undefined && load > lo) {
    const test = last.results.filter((r) => r.loadKg === load);
    const ok = test.every((r) => (r.reps ?? 0) >= rx.lo && (r.rir === undefined ? false : r.rir >= Math.max(1, rx.rir - 1)));
    // Bascule progressive : un seul essai réussi ne suffit pas. Étape suivante = la moitié des séries à la nouvelle
    // charge ; toutes les séries n'y passent que lorsque au moins la moitié l'a tenue dans une même séance.
    const half = Math.ceil(last.planned / 2);
    if (ok && test.length < half) {
      return {
        ...base,
        action: 'transition',
        after: { loadKg: lo, target: rx.hi },
        transition: { loadKg: load, sets: half, target: rx.lo },
        done: true,
        targetReached: false,
        progressionAllowed: false,
        observations: [...obs, `essai à ${fmt(load)} kg réussi (${test.length} série)`],
        rule: 'transition : étape suivante',
        missing: [],
        reason: `Essai à ${fmt(load)} kg réussi (${test.map((r) => r.reps).join(' / ')} rép.) : un seul essai ne valide pas la charge. Prochaine séance : ${half} série(s) à ${fmt(load)} kg, les autres à ${fmt(lo)} kg.`,
        reevaluate: 'après ces séries',
      };
    }
    if (ok) return { ...base, action: 'augmenter', after: { loadKg: load, target: rx.lo }, done: true, targetReached: true, progressionAllowed: true, observations: [...obs, `${test.length} séries à ${fmt(load)} kg réussies`], rule: 'transition confirmée', missing: [], reason: `${test.length} séries tenues à ${fmt(load)} kg (${test.map((r) => r.reps).join(' / ')} rép.) : toutes les séries passent à ${fmt(load)} kg.`, reevaluate: 'prochaine séance' };
    return keep({ done: true, observations: [...obs, `essai à ${fmt(load)} kg non confirmé`], after: { loadKg: lo, target: rx.hi }, rule: 'transition non confirmée', reason: `L’essai à ${fmt(load)} kg n’est pas encore solide (réserve inconnue ou sous ${rx.lo} rép.) : retour à ${fmt(lo)} kg, nouvel essai plus tard.`, missing: test.some((r) => r.rir === undefined) ? ['réserve de la série d’essai'] : [] });
  }

  const min = Math.min(...repsN);
  const targetReached = !partial && min >= rx.target;
  const common = { done: true, targetReached, observations: obs };

  if (partial) return keep({ ...common, after: { loadKg: load, target: rx.target }, rule: 'séance partielle', reason: `${last.results.length}/${last.planned} séries faites : pas de progression validée sur une séance partielle.` });

  if (min < rx.lo) {
    const prev = samples.slice(1).find((s) => s.comparable && s.results.length);
    const prevLow = prev && prev.results.length >= prev.planned && Math.min(...prev.results.map((r) => r.reps ?? 0)) < rx.lo && maxLoad(prev.results) === load;
    if (prevLow && load !== undefined && load > 0) {
      const down = loadDown(load, loads);
      return keep({ ...common, action: 'réduire', proposal: true, after: { loadKg: down, target: rx.lo }, rule: 'analyse : sous la plage 2 séances comparables', reason: `Deux séances comparables sous ${rx.lo} rép. à ${fmt(load)} kg. Avant de baisser : sommeil, repos réellement pris, alimentation, variante ? Proposition : ${fmt(down)} kg (à valider).`, missing: ['ta validation'] });
    }
    return keep({ ...common, rule: 'séance isolée sous la plage', reason: 'Une séance moins bonne ne change rien : vérifie sommeil, repos pris, variante.', missing: ['sommeil', 'repos réellement pris'] });
  }

  if (min < rx.hi) {
    const target = Math.min(rx.hi, min + 1);
    return { ...base, ...common, action: 'maintenir', after: { loadKg: load, target }, progressionAllowed: false, rule: 'double progression : répétitions d’abord', reason: `Même charge, vise ${target} rép. sur toutes les séries.`, missing: [], reevaluate: 'prochaine séance' };
  }

  if (effortKnown && rirs.some((r) => (r as number) < rx.rir)) return keep({ ...common, after: { loadKg: load, target: rx.hi }, rule: 'cible atteinte avec trop d’effort', reason: 'Haut de plage atteint, mais plus dur que prévu : on consolide avant de monter.' });

  if (!effortKnown) {
    const prev = samples.slice(1).find((s) => s.comparable && s.results.length);
    const confirmed = prev && prev.results.length >= prev.planned && Math.min(...prev.results.map((r) => r.reps ?? 0)) >= rx.hi && maxLoad(prev.results) === load;
    if (!confirmed) return keep({ ...common, after: { loadKg: load, target: rx.hi }, rule: 'confirmation sur 2 séances', reason: 'Haut de plage atteint, effort non noté : à confirmer à la prochaine séance comparable.', missing: ['réserve (RIR)'] });
    obs.push('confirmé sur 2 séances comparables');
  }

  // Progression autorisée : plus petit incrément réalisable.
  const from = load ?? 0;
  const up = from === 0 ? loads.find((l) => l > 0) : loadUp(from, loads);
  if (up === undefined) {
    return keep({ ...common, progressionAllowed: true, after: { loadKg: load, target: rx.hi }, rule: from === 0 ? 'haut de plage au poids du corps' : 'matériel au maximum', reason: from === 0 ? 'Plage maîtrisée au poids du corps : variante plus difficile à valider avec le coach.' : `Haut de plage à ${fmt(from)} kg, ta charge maximale : il faut plus lourd (matériel conseillé).` });
  }
  const total = (opts.addedLoad && opts.bodyweightKg ? opts.bodyweightKg : 0) + from;
  const ratio = total > 0 ? (up - from) / total : 1;
  if (ratio > (opts.bigJumpRatio ?? 0.1)) {
    return {
      ...base,
      ...common,
      action: 'transition',
      progressionAllowed: false,
      after: { loadKg: load, target: rx.hi },
      transition: { loadKg: up, sets: 1, target: rx.lo },
      rule: 'transition de charge',
      reason: `Palier suivant ${fmt(up)} kg = +${Math.round(ratio * 100)} % de résistance : 1re série d’essai à ${fmt(up)} kg (vise ${rx.lo} rép., réserve ≥ ${Math.max(1, rx.rir - 1)}), les autres à ${fmt(from)} kg.`,
      missing: [],
      reevaluate: 'après la série d’essai',
    };
  }
  return { ...base, ...common, action: 'augmenter', progressionAllowed: true, after: { loadKg: up, target: rx.lo }, rule: 'double progression', reason: `Haut de plage avec l’effort prévu : ${fmt(from)} → ${fmt(up)} kg, retour à ${rx.lo} rép.`, missing: [], reevaluate: 'prochaine séance' };
}

/** Mouvements qui chargent l'épaule ou le coude (tractions, dips, pompes, développés). */
export const JOINT_LOADED = /pullup|chinup|dips|pushup|pike|press/;

export function decide(variantId: string, rx: Rx, samples: Sample[], loads: number[], opts: DecideOpts = {}): Decision {
  const d = decideCore(variantId, rx, samples, loads, opts);
  // Une gêne déclarée n'interdit pas le mouvement : elle gèle seulement la montée de charge.
  if (opts.guarded && (d.action === 'augmenter' || d.action === 'transition')) {
    return {
      ...d,
      action: 'maintenir',
      transition: undefined,
      after: { loadKg: maxLoad(samples[0]?.results ?? []) ?? rx.loadKg, target: rx.hi },
      progressionAllowed: false,
      rule: 'gêne déclarée',
      observations: [...d.observations, 'épaule ou coudes déclarés sensibles'],
      reason: 'Haut de plage atteint, mais épaule ou coudes sensibles : on garde la charge et on consolide les répétitions.',
      reevaluate: 'prochaine séance comparable',
    };
  }
  return d;
}
