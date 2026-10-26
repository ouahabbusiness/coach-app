// Preuves en photo : à la demande de l'utilisateur, un objectif du défi n'est compté que s'il a une photo du jour.
// L'app ne peut pas garantir qu'une photo est vraie ; elle refuse seulement les photos d'un autre jour.

import { NOVEMBER_2026, type ChallengeDef } from './challenge';
import { localDay } from './derive';

export interface Proof {
  habitId: string;
  /** Photo réduite (data URL), stockée localement. */
  photo: string;
  /** Date de la photo (fichier), en ms epoch. */
  takenAt: number;
  savedAt: number;
  /** 'gps' : course mesurée par le GPS de l'app (pas de photo). */
  source?: 'photo' | 'gps';
}

export type ProofDay = Record<string, Proof>;

export const proofKey = (day: string) => `proof.${day}`;

/** La photo a-t-elle été prise le jour visé (fuseau de l'appareil) ? */
export function takenOnDay(takenAt: number, day: string, timeZone: string): boolean {
  return Number.isFinite(takenAt) && takenAt > 0 && localDay(takenAt, timeZone) === day;
}

/**
 * Retire des valeurs les objectifs « réussis » sans preuve : ils redeviennent non renseignés.
 * Un échec déclaré (« pas fait », valeur sous l'objectif) n'a pas besoin de preuve.
 */
export function withProofs(
  values: Record<string, boolean | number>,
  proofs: ProofDay | undefined,
  def: ChallengeDef = NOVEMBER_2026,
): Record<string, boolean | number> {
  const out = { ...values };
  for (const h of def.daily) {
    const v = out[h.id];
    const success = h.kind === 'check' ? v === true : typeof v === 'number' && v >= (h.min ?? 0);
    if (success && !proofs?.[h.id]) delete out[h.id];
  }
  for (const g of def.weekly) if (out[g.id] === true && !proofs?.[g.id]) delete out[g.id];
  return out;
}
