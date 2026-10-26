// Imprévus du planning : options proposées et versions adaptées d'une séance.
// Règles produit, pas des prescriptions : aucune limite physiologique n'est inventée.
// Une séance adaptée est toujours marquée comme telle, jamais équivalente à la séance complète.

import type { SetKind, SetRole } from './types';
import type { Strictness } from './programBuilder';

export type DisruptionReason =
  | 'retard'
  | 'mauvaise_nuit'
  | 'maladie'
  | 'douleur'
  | 'deplacement'
  | 'lieu_indisponible'
  | 'materiel_manquant';

export const REASON_LABELS: Record<DisruptionReason, string> = {
  retard: 'Retard / moins de temps',
  mauvaise_nuit: 'Mauvaise nuit',
  maladie: 'Malade',
  douleur: 'Douleur',
  deplacement: 'Déplacement',
  lieu_indisponible: 'Parc ou salle indisponible',
  materiel_manquant: 'Matériel manquant',
};

export type OptionId = 'garder' | 'raccourcir' | 'alleger' | 'sans_materiel' | 'reporter' | 'remplacer_marche' | 'annuler';

export interface DisruptionOption {
  id: OptionId;
  label: string;
  detail: string;
}

/** Une ligne de séance (compatible avec les modèles de l'interface). */
export interface PlanLine {
  variantId: string;
  kind: SetKind;
  role: SetRole;
  sets: number;
  targetReps?: number;
  targetSeconds?: number;
  restSeconds: number;
}

const OPT: Record<OptionId, DisruptionOption> = {
  garder: { id: 'garder', label: 'Garder la séance telle quelle', detail: 'Ton choix : rien ne change.' },
  raccourcir: { id: 'raccourcir', label: 'Raccourcir', detail: 'Tient dans le temps disponible : séries retirées en partant de la fin, premiers exercices gardés en priorité. Notée « adaptée ».' },
  alleger: { id: 'alleger', label: 'Alléger', detail: 'Environ un tiers de séries de travail en moins, échauffement gardé. Notée « adaptée ».' },
  sans_materiel: { id: 'sans_materiel', label: 'Garder les exercices faisables', detail: 'Retire les exercices qui demandent du matériel indisponible. Notée « adaptée ».' },
  reporter: { id: 'reporter', label: 'Reporter', detail: 'Choisir un autre créneau ; les conséquences sont affichées avant confirmation.' },
  remplacer_marche: { id: 'remplacer_marche', label: 'Remplacer par une marche', detail: 'La séance est retirée, une marche prend sa place.' },
  annuler: { id: 'annuler', label: 'Annuler cette séance', detail: 'Aucune pénalité, rien à rattraper en double.' },
};

/**
 * Options proposées selon l'imprévu. Malade ou douleur : on ne propose jamais de « forcer en plus léger ».
 * La rigueur choisie avec le coach retire des options (jamais pour maladie ou douleur) :
 *  - strict : pas de report ;
 *  - militaire : ni report, ni annulation, ni marche à la place d'une séance : on adapte le jour même.
 */
export function disruptionOptions(reason: DisruptionReason, strictness: Strictness = 'souple'): DisruptionOption[] {
  const ids: Record<DisruptionReason, OptionId[]> = {
    retard: ['raccourcir', 'reporter', 'annuler'],
    mauvaise_nuit: ['garder', 'alleger', 'remplacer_marche', 'reporter', 'annuler'],
    maladie: ['annuler', 'reporter'],
    douleur: ['annuler', 'reporter'],
    deplacement: ['sans_materiel', 'reporter', 'remplacer_marche', 'annuler'],
    lieu_indisponible: ['sans_materiel', 'reporter', 'annuler'],
    materiel_manquant: ['sans_materiel', 'reporter', 'annuler'],
  };
  const health = reason === 'maladie' || reason === 'douleur';
  const banned: OptionId[] = health || strictness === 'souple' ? [] : strictness === 'strict' ? ['reporter'] : ['reporter', 'annuler', 'remplacer_marche'];
  return ids[reason].filter((id) => !banned.includes(id)).map((id) => OPT[id]);
}

/** Pour une course en mode militaire, il ne reste que la marche : jamais une case vide. */
export function nonWorkoutOptions(reason: DisruptionReason, strictness: Strictness = 'souple'): DisruptionOption[] {
  const list = disruptionOptions(reason, strictness).filter((o) => !['raccourcir', 'alleger', 'sans_materiel'].includes(o.id));
  return list.length ? list : [OPT.remplacer_marche];
}

export const STRICT_LABEL: Record<Strictness, string> = { souple: 'Souple', strict: 'Strict : pas de report', militaire: 'Militaire : on adapte, on ne lâche pas' };

/** Message d'accompagnement, sans diagnostic. */
export function reasonNotice(reason: DisruptionReason): string | undefined {
  if (reason === 'maladie') return 'Aucune séance n’est imposée quand tu es malade. Reprends quand tu te sens rétabli ; demande un avis médical si besoin.';
  if (reason === 'douleur') return 'L’app ne pose pas de diagnostic. Si la douleur persiste, revient à l’effort ou t’inquiète, consulte un médecin ou un kiné.';
  if (reason === 'mauvaise_nuit') return 'L’app ne sait pas mesurer ta fatigue : c’est ton ressenti qui décide.';
  return undefined;
}

/** Hypothèse de durée d'une série à répétitions, utilisée seulement pour estimer (règle produit). */
export const ESTIMATED_REP_SET_SECONDS = 45;

/** Durée estimée (minutes) : séries + repos entre séries. Toujours affichée comme une estimation. */
export function estimateMinutes(lines: PlanLine[]): number {
  let sec = 0;
  for (const l of lines) {
    const work = l.kind === 'hold' ? l.targetSeconds ?? 30 : ESTIMATED_REP_SET_SECONDS;
    sec += l.sets * work + Math.max(0, l.sets - 1) * l.restSeconds;
  }
  // Repos entre exercices : même valeur que le repos de l'exercice précédent.
  for (let i = 0; i < lines.length - 1; i++) sec += lines[i]!.restSeconds;
  return Math.ceil(sec / 60);
}

export interface Adapted<T extends PlanLine> {
  lines: T[];
  estimatedMin: number;
  /** Ce qui a été retiré, pour l'afficher clairement. */
  removed: string[];
}

/**
 * Raccourcit pour tenir dans `availableMin` en retirant des séries de travail, en partant du dernier exercice.
 * L'échauffement et au moins une série par exercice sont gardés ; si ça ne suffit pas, les derniers exercices sont retirés.
 */
export function shorten<T extends PlanLine>(lines: T[], availableMin: number, nameOf: (variantId: string) => string): Adapted<T> {
  const work = lines.map((l, origin) => ({ line: { ...l }, origin }));
  let guard = 1000;
  while (estimateMinutes(work.map((w) => w.line)) > availableMin && guard-- > 0) {
    const idx = [...work.keys()].reverse().find((i) => work[i]!.line.role !== 'warmup' && work[i]!.line.sets > 1);
    if (idx !== undefined) {
      work[idx]!.line.sets -= 1;
      continue;
    }
    const last = [...work.keys()].reverse().find((i) => work[i]!.line.role !== 'warmup');
    if (last === undefined || work.length <= 1) break;
    work.splice(last, 1);
  }
  const removed: string[] = [];
  lines.forEach((l, origin) => {
    const kept = work.find((w) => w.origin === origin);
    if (!kept) removed.push(nameOf(l.variantId));
    else if (kept.line.sets < l.sets) {
      const n = l.sets - kept.line.sets;
      removed.push(`${nameOf(l.variantId)} : ${n} série${n > 1 ? 's' : ''} en moins`);
    }
  });
  const out = work.map((w) => w.line);
  return { lines: out, estimatedMin: estimateMinutes(out), removed };
}

/** Allège : environ un tiers de séries de travail en moins (au moins une série gardée). */
export function lighten<T extends PlanLine>(lines: T[], nameOf: (variantId: string) => string): Adapted<T> {
  const removed: string[] = [];
  const out = lines.map((l) => {
    if (l.role === 'warmup') return { ...l };
    const sets = Math.max(1, Math.ceil((l.sets * 2) / 3));
    if (sets < l.sets) removed.push(`${nameOf(l.variantId)} : ${l.sets - sets} série${l.sets - sets > 1 ? 's' : ''} en moins`);
    return { ...l, sets };
  });
  return { lines: out, estimatedMin: estimateMinutes(out), removed };
}

/** Garde les exercices dont tout le matériel est disponible (aucun remplacement inventé). */
export function keepFeasible<T extends PlanLine>(
  lines: T[],
  equipmentOf: (variantId: string) => string[],
  available: string[],
  nameOf: (variantId: string) => string,
): Adapted<T> {
  const removed: string[] = [];
  const out = lines.filter((l) => {
    const ok = equipmentOf(l.variantId).every((e) => available.includes(e));
    if (!ok) removed.push(nameOf(l.variantId));
    return ok;
  });
  return { lines: out, estimatedMin: estimateMinutes(out), removed };
}
