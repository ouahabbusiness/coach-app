// Tolérance d'un exercice quand l'épaule ou les coudes sont gênants. Jamais « adapté parce que non cité » ni « toléré parce qu'aucune
// douleur n'a été saisie » : une réponse explicite « aucune gêne » n'est pas la même chose qu'une information manquante.
//  - déclencheur : tu as déclaré qu'il déclenche la gêne ;
//  - gêne signalée : douleur signalée sur ses séries, ou gêne que TU as rattachée à ce mouvement ;
//  - mouvement non identifié : une gêne a été signalée sans dire quel mouvement : elle n'est attribuée à AUCUN mouvement en particulier,
//    et aucun mouvement de cette séance n'est confirmé toléré ;
//  - toléré : « aucune gêne » répondu après la séance ET « rien » le lendemain, sans douleur signalée avant ou pendant ;
//  - tolérance inconnue : tout le reste, y compris « réalisé une fois sans gêne déclarée » (information utile, pas une confirmation).

export type Tolerance = 'declencheur' | 'signalee' | 'non_localisee' | 'toleree' | 'inconnue';

export const TOLERANCE_LABELS: Record<Tolerance, string> = {
  declencheur: 'déclencheur connu',
  signalee: 'gêne signalée sur ce mouvement',
  non_localisee: 'gêne signalée, mouvement non identifié',
  toleree: 'toléré : aucune gêne après la séance ni le lendemain',
  inconnue: 'tolérance inconnue',
};

/** Mouvements qui chargent l'épaule ou le coude. */
export const UPPER_LOADED = /pullup|chinup|dips|pushup|pike|press|row/;
export const isUpperLoaded = (variantId: string) => UPPER_LOADED.test(variantId);

/** Retour après la séance puis le lendemain, tel que tu l'as répondu. */
export interface JointFeedback {
  during?: 'aucune' | 'legere' | 'marquee';
  duringAt?: number;
  next?: 'rien' | 'legere' | 'dure';
  nextAt?: number;
  /** Mouvements que TU as désignés comme concernés par une gêne marquée ou qui dure (identifiants de variantes). */
  moves?: string[];
  /** Vrai dès que tu as répondu à « sur quel mouvement ? » (y compris « je ne sais pas » : moves vide). */
  movesAnswered?: boolean;
}

export interface ToleranceContext {
  /** Expressions de variantes déclarées comme déclencheurs (voir joints.adaptationPatterns). */
  triggerPatterns: string[];
  /** Confirmées : « aucune gêne » après la séance ET « rien » le lendemain. */
  confirmed: ReadonlySet<string>;
  /** Gêne rattachée à ce mouvement (douleur sur ses séries, ou mouvement que tu as désigné). */
  flagged: ReadonlySet<string>;
  /** Gêne signalée sans mouvement identifié (réponse globale ou douleur avant séance) : jamais attribuée à un exercice précis. */
  unlocated: ReadonlySet<string>;
  /** Dernière date (AAAA-MM-JJ) où le mouvement a été réalisé sans gêne déclarée, retour éventuellement incomplet. */
  realised: ReadonlyMap<string, string>;
}

export const emptyToleranceContext = (): ToleranceContext => ({ triggerPatterns: [], confirmed: new Set(), flagged: new Set(), unlocated: new Set(), realised: new Map() });

/** Undefined si le mouvement ne sollicite pas l'épaule ni le coude (jambes, abdominaux). */
export function toleranceOf(variantId: string, ctx: ToleranceContext): Tolerance | undefined {
  if (!isUpperLoaded(variantId)) return undefined;
  if (ctx.triggerPatterns.some((p) => new RegExp(p).test(variantId))) return 'declencheur';
  if (ctx.flagged.has(variantId)) return 'signalee';
  if (ctx.unlocated.has(variantId)) return 'non_localisee';
  if (ctx.confirmed.has(variantId)) return 'toleree';
  return 'inconnue';
}

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Libellé précis : « réalisé le 27/10 sans gêne déclarée, retour à compléter » plutôt que de faire disparaître « tolérance inconnue ». */
export function toleranceDetail(variantId: string, ctx: ToleranceContext): string | undefined {
  const t = toleranceOf(variantId, ctx);
  if (!t) return undefined;
  if (t === 'inconnue' && ctx.realised.has(variantId)) return `réalisé le ${dm(ctx.realised.get(variantId)!)} sans gêne déclarée · retour après séance et lendemain à compléter`;
  return TOLERANCE_LABELS[t];
}

interface SessionLite {
  sessionId: string;
  startedAt: number;
  timeZone?: string;
  pain: { plannedSetId?: string }[];
  sets: { planned: { id: string; variantId: string; role: string }; status: string }[];
}

/**
 * Statut de chaque mouvement d'après sa séance la plus récente (28 jours). Ne confirme que sur réponses explicites.
 *  - douleur signalée sur une série : rattachée au mouvement de cette série (sans série précisée : non identifiée) ;
 *  - gêne marquée ou qui dure : rattachée aux mouvements que tu désignes ; sans désignation, NON identifiée ;
 *  - douleur nouvelle ou aggravée au contrôle avant séance : non identifiée, et la séance ne peut rien confirmer ;
 *  - une absence de réponse n'est jamais une absence de symptôme.
 * `dayOf` donne la date locale d'une séance (AAAA-MM-JJ) ; `readinessPain` : réponse « douleur » du contrôle avant séance.
 */
export function toleranceHistory(
  states: SessionLite[],
  feedback: Record<string, JointFeedback | undefined>,
  now: number,
  dayOf: (at: number, tz?: string) => string,
  days = 28,
  readinessPain: Record<string, string | undefined> = {},
): Pick<ToleranceContext, 'confirmed' | 'flagged' | 'unlocated' | 'realised'> {
  const confirmed = new Set<string>();
  const flagged = new Set<string>();
  const unlocated = new Set<string>();
  const realised = new Map<string, string>();
  const recent = states.filter((s) => now - s.startedAt <= days * 86_400_000).sort((a, b) => a.startedAt - b.startedAt);
  for (const s of recent) {
    const fb = feedback[s.sessionId];
    const preSession = readinessPain[s.sessionId];
    const preSessionPain = preSession === 'nouvelle' || preSession === 'aggravée';
    const worked = new Map<string, Set<string>>();
    for (const x of s.sets) if (x.planned.role === 'work' && x.status === 'done') worked.set(x.planned.variantId, (worked.get(x.planned.variantId) ?? new Set()).add(x.planned.id));
    const globalSignal = fb?.during === 'marquee' || fb?.next === 'dure';
    for (const [variant, setIds] of worked) {
      const painOnSets = s.pain.filter((p) => p.plannedSetId && setIds.has(p.plannedSetId)).length > 0;
      const painNoSet = s.pain.some((p) => !p.plannedSetId);
      const named = fb?.moves?.includes(variant) ?? false;
      // Un statut ne change que sur une information explicite : une séance sans réponse ne révoque pas une confirmation
      // (et n'efface pas une gêne signalée) : l'absence de réponse n'est ni un symptôme ni son absence.
      const settle = (to: Set<string>) => {
        confirmed.delete(variant);
        flagged.delete(variant);
        unlocated.delete(variant);
        to.add(variant);
      };
      if (painOnSets || (globalSignal && named)) settle(flagged);
      else if (painNoSet || preSessionPain || (globalSignal && !fb?.moves?.length)) settle(unlocated);
      else if (fb?.during === 'aucune' && fb?.next === 'rien') settle(confirmed);
      else realised.set(variant, dayOf(s.startedAt, s.timeZone));
    }
  }
  return { confirmed, flagged, unlocated, realised };
}
