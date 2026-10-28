// Tolérance d'un exercice quand l'épaule ou les coudes sont gênants. Trois états, jamais « adapté parce que non cité » :
//  - déclencheur : tu as déclaré qu'il déclenche la gêne ;
//  - toléré récemment : fait récemment dans une séance sans douleur signalée (une indication, pas une garantie) ;
//  - tolérance inconnue : mouvement qui sollicite épaule ou coudes, jamais déclaré gênant mais pas fait récemment.

export type Tolerance = 'declencheur' | 'toleree' | 'inconnue';

export const TOLERANCE_LABELS: Record<Tolerance, string> = {
  declencheur: 'déclencheur connu',
  toleree: 'fait récemment sans douleur signalée',
  inconnue: 'tolérance inconnue',
};

/** Mouvements qui chargent l'épaule ou le coude. */
export const UPPER_LOADED = /pullup|chinup|dips|pushup|pike|press|row/;
export const isUpperLoaded = (variantId: string) => UPPER_LOADED.test(variantId);

export interface ToleranceContext {
  /** Expressions de variantes déclarées comme déclencheurs (voir joints.adaptationPatterns). */
  triggerPatterns: string[];
  /** Variantes faites récemment dans une séance sans douleur signalée. */
  tolerated: ReadonlySet<string>;
}

/** Undefined si le mouvement ne sollicite pas l'épaule ni le coude (jambes, abdominaux). */
export function toleranceOf(variantId: string, ctx: ToleranceContext): Tolerance | undefined {
  if (!isUpperLoaded(variantId)) return undefined;
  if (ctx.triggerPatterns.some((p) => new RegExp(p).test(variantId))) return 'declencheur';
  return ctx.tolerated.has(variantId) ? 'toleree' : 'inconnue';
}

interface SessionLite {
  startedAt: number;
  pain: unknown[];
  sets: { planned: { variantId: string; role: string }; status: string }[];
}

/** Variantes faites (au moins une série terminée) dans les 28 derniers jours, dans une séance sans douleur signalée. */
export function toleratedVariants(states: SessionLite[], now: number, days = 28): Set<string> {
  const out = new Set<string>();
  for (const s of states) {
    if (s.pain.length > 0 || now - s.startedAt > days * 86_400_000) continue;
    for (const x of s.sets) if (x.planned.role === 'work' && x.status === 'done') out.add(x.planned.variantId);
  }
  return out;
}
