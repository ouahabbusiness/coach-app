// Volume hebdomadaire par muscle. Choix de conception (à valider, pas une loi) :
//  - une série de TRAVAIL compte 1 pour les muscles directs ; les contributions indirectes sont affichées À PART
//    (pas additionnées en un « équivalent exact ») ;
//  - les séries d'échauffement sont comptées séparément et n'entrent pas dans le volume ;
//  - un EMOM n'est pas converti en séries : il est listé avec son incertitude ;
//  - le repère d'environ 10 séries directes par muscle et par semaine est un REPÈRE, pas un quota à remplir.

export type Muscle = 'dos' | 'pectoraux' | 'épaules' | 'biceps' | 'triceps' | 'quadriceps' | 'fessiers' | 'ischios' | 'abdominaux';

export const MUSCLES: Muscle[] = ['dos', 'pectoraux', 'épaules', 'biceps', 'triceps', 'quadriceps', 'fessiers', 'ischios', 'abdominaux'];

/** Muscles sollicités par variante : directs (cible du mouvement) et indirects (assistance). */
export const MUSCLE_MAP: Record<string, { direct: Muscle[]; indirect: Muscle[] }> = {
  'pullup-strict': { direct: ['dos'], indirect: ['biceps'] },
  'pullup-weighted': { direct: ['dos'], indirect: ['biceps'] },
  'pullup-band': { direct: ['dos'], indirect: ['biceps'] },
  'pullup-negative': { direct: ['dos'], indirect: ['biceps'] },
  'chinup-strict': { direct: ['dos', 'biceps'], indirect: [] },
  'row-australian': { direct: ['dos'], indirect: ['biceps'] },
  'kb-row-1arm': { direct: ['dos'], indirect: ['biceps'] },
  'dips-bars': { direct: ['pectoraux', 'triceps'], indirect: ['épaules'] },
  'dips-weighted': { direct: ['pectoraux', 'triceps'], indirect: ['épaules'] },
  'dips-bench': { direct: ['triceps'], indirect: ['pectoraux', 'épaules'] },
  'pushup-incline': { direct: ['pectoraux'], indirect: ['triceps', 'épaules'] },
  'pushup-standard': { direct: ['pectoraux'], indirect: ['triceps', 'épaules'] },
  'pushup-diamond': { direct: ['triceps', 'pectoraux'], indirect: ['épaules'] },
  'pike-pushup': { direct: ['épaules'], indirect: ['triceps'] },
  'kb-press-1arm': { direct: ['épaules'], indirect: ['triceps'] },
  'squat-bodyweight': { direct: ['quadriceps', 'fessiers'], indirect: [] },
  'squat-goblet-kb': { direct: ['quadriceps', 'fessiers'], indirect: ['abdominaux'] },
  'lunge-reverse': { direct: ['quadriceps', 'fessiers'], indirect: ['ischios'] },
  'split-squat-bulgarian': { direct: ['quadriceps', 'fessiers'], indirect: ['ischios'] },
  'kb-rdl': { direct: ['ischios', 'fessiers'], indirect: ['dos'] },
  'kb-swing-2h': { direct: ['fessiers', 'ischios'], indirect: ['dos'] },
  'glute-bridge-kb': { direct: ['fessiers'], indirect: ['ischios'] },
  'knee-raise-hanging': { direct: ['abdominaux'], indirect: [] },
  'leg-raise-hanging': { direct: ['abdominaux'], indirect: [] },
  'plank-forearm': { direct: ['abdominaux'], indirect: [] },
  'hollow-hold': { direct: ['abdominaux'], indirect: [] },
};

export interface SetCount {
  variantId: string;
  role: 'warmup' | 'work' | 'technique' | 'test';
  /** Série réalisée (sinon : seulement prévue). */
  done: boolean;
}

export interface FreeVolume {
  variantId: string;
  label: string;
}

export interface MuscleVolume {
  muscle: Muscle;
  plannedDirect: number;
  doneDirect: number;
  doneIndirect: number;
  /** Blocs hors programme (EMOM…) qui touchent ce muscle, non convertis en séries. */
  free: string[];
}

export interface WeekVolume {
  muscles: MuscleVolume[];
  warmupSets: number;
  uncertain: string[];
}

export const REFERENCE_SETS = 10;

export function weekVolume(planned: SetCount[], done: SetCount[], free: FreeVolume[]): WeekVolume {
  const row = (m: Muscle): MuscleVolume => ({ muscle: m, plannedDirect: 0, doneDirect: 0, doneIndirect: 0, free: [] });
  const rows = new Map<Muscle, MuscleVolume>(MUSCLES.map((m) => [m, row(m)]));
  const unknown = new Set<string>();
  let warmupSets = 0;
  for (const s of planned) {
    if (s.role !== 'work') continue;
    const map = MUSCLE_MAP[s.variantId];
    if (!map) unknown.add(s.variantId);
    for (const m of map?.direct ?? []) rows.get(m)!.plannedDirect++;
  }
  for (const s of done) {
    if (s.role === 'warmup') {
      warmupSets++;
      continue;
    }
    if (s.role !== 'work') continue;
    const map = MUSCLE_MAP[s.variantId];
    if (!map) unknown.add(s.variantId);
    for (const m of map?.direct ?? []) rows.get(m)!.doneDirect++;
    for (const m of map?.indirect ?? []) rows.get(m)!.doneIndirect++;
  }
  for (const f of free) for (const m of [...(MUSCLE_MAP[f.variantId]?.direct ?? []), ...(MUSCLE_MAP[f.variantId]?.indirect ?? [])]) rows.get(m)!.free.push(f.label);
  const uncertain: string[] = [];
  if (free.length) uncertain.push('Blocs hors programme (EMOM…) listés à part : leur équivalent en séries est inconnu.');
  if (unknown.size) uncertain.push(`Exercice(s) sans correspondance musculaire : ${[...unknown].join(', ')}.`);
  uncertain.push('Indirect = muscle d’assistance, affiché séparément (pas additionné au direct).');
  return { muscles: [...rows.values()], warmupSets, uncertain };
}
