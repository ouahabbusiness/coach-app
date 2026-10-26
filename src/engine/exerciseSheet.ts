// Fiche d'exercice : tout ce qu'il faut pour exécuter une ligne de programme, dérivé du catalogue + de la prescription.
// Consignes et conditions d'arrêt rédigées par l'assistant, non relues par un professionnel (affiché).

import { EXERCISES, findVariant } from '../catalog/exercises';
import { MUSCLE_MAP } from './volume';

export interface SheetRx {
  repRange?: [number, number];
  targetReps?: number;
  targetRir?: number;
  restSeconds?: number;
  loadKg?: number;
  lastSetToFailure?: boolean;
  targetSeconds?: number;
}

export interface ExerciseSheet {
  variantId: string;
  name: string;
  exercise: string;
  level: number;
  levels: number;
  equipment: string[];
  cues: string[];
  errors: string[];
  effort: string;
  rest: string;
  stop: string[];
  alternatives: { variantId: string; name: string; why: string }[];
  progression: string;
  reviewed: boolean;
}

const fmtRest = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`);

export function exerciseSheet(variantId: string, rx: SheetRx = {}): ExerciseSheet | undefined {
  const f = findVariant(variantId);
  if (!f) return undefined;
  const { exercise, variant } = f;
  const loaded = variant.equipment.some((e) => /lest|kettlebell/i.test(e));
  const weighted = variant.equipment.some((e) => /lest/i.test(e));
  const rir = rx.targetRir ?? 2;
  const timed = variant.kind === 'hold';

  const effort = timed
    ? `Tenir ${rx.targetSeconds ?? '—'} s en gardant la position parfaite ; garde ${rir === 1 ? 'environ 5' : 'environ 10'} s en réserve.`
    : `${rx.repRange ? `${rx.repRange[0]}–${rx.repRange[1]} rép.` : `${rx.targetReps ?? '—'} rép.`}${rx.loadKg ? ` à ${rx.loadKg} kg` : ''}, en t’arrêtant avec ${rir} rép. en réserve (RIR ${rir}).` +
      (rx.lastSetToFailure ? ' Dernière série : jusqu’à l’échec propre (technique intacte), sans lest.' : '');

  const rest = rx.restSeconds ? `${fmtRest(rx.restSeconds)} entre les séries. Plus court = séance différente (non comparable).` : 'Repos libre : note-le, il compte pour comparer.';

  const stop = [
    'Douleur vive ou articulaire → arrête la série et note-la. Douleur thoracique, malaise, essoufflement anormal → arrêt + 112.',
    timed ? 'La position se dégrade (bassin, dos) → fin de la série.' : `Plus que ${rir} rép. propres en réserve → la série est finie, même si tu pourrais forcer.`,
    ...(variant.commonErrors[0] ? [`Technique qui casse (${variant.commonErrors[0].toLowerCase()}) → fin de la série.`] : []),
    ...(weighted ? ['Avec lest : jamais jusqu’à l’échec (choix prudent de l’app).'] : []),
  ];

  // Alternatives : variante plus accessible du même exercice, puis plus difficile ; sinon même muscle direct.
  const sorted = [...exercise.variants].sort((a, b) => a.level - b.level);
  const alternatives: ExerciseSheet['alternatives'] = [];
  const easier = sorted.filter((v) => v.level < variant.level).pop();
  const harder = sorted.find((v) => v.level > variant.level);
  if (easier) alternatives.push({ variantId: easier.id, name: easier.name, why: 'plus accessible (fatigue, gêne, matériel absent)' });
  if (harder) alternatives.push({ variantId: harder.id, name: harder.name, why: 'plus difficile (quand la progression l’indique)' });
  if (!easier) {
    const mine = MUSCLE_MAP[variantId]?.direct ?? [];
    const same = EXERCISES.filter((e) => e.id !== exercise.id)
      .flatMap((e) => e.variants)
      .filter((v) => (MUSCLE_MAP[v.id]?.direct ?? []).some((m) => mine.includes(m)))
      .sort((a, b) => a.level - b.level);
    const other = same.find((v) => v.level <= variant.level) ?? same[0];
    if (other) alternatives.push({ variantId: other.id, name: other.name, why: `même muscle principal (${(MUSCLE_MAP[other.id]?.direct ?? []).filter((m) => mine.includes(m)).join(', ')})` });
  }

  const progression = timed
    ? 'Toutes les séries tenues avec la réserve demandée sur 2 séances comparables → +5 à 10 s. Sinon on garde.'
    : loaded
      ? `Double progression : quand toutes les séries atteignent le haut de la plage${rx.repRange ? ` (${rx.repRange[1]})` : ''} avec au moins ${rir} rép. en réserve, la charge monte au palier réel de ton matériel et les rép. repartent du bas. Saut > 10 % → une série d’essai d’abord. Sous la plage 2 fois → baisse proposée, à valider.`
      : `Rép. d’abord jusqu’au haut de la plage${rx.repRange ? ` (${rx.repRange[1]})` : ''} avec ${rir} en réserve ; ensuite variante plus difficile${harder ? ` (${harder.name})` : ''} ou lest. Séance partielle ou non comparable → pas de progression.`;

  return {
    variantId,
    name: variant.name,
    exercise: exercise.name,
    level: sorted.indexOf(variant) + 1,
    levels: sorted.length,
    equipment: variant.equipment,
    cues: variant.cues,
    errors: variant.commonErrors,
    effort,
    rest,
    stop,
    alternatives,
    progression,
    reviewed: exercise.reviewStatus === 'relu_professionnel',
  };
}
