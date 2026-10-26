// Catalogue initial volontairement court.
// Statut : consignes rédigées par l'assistant, NON relues par un professionnel.
// Aucun média n'est encore disponible : l'interface l'affiche explicitement.

import type { SetKind } from '../engine/types';

export type ReviewStatus = 'non_relu' | 'relu_professionnel';

export interface Media {
  url: string;
  kind: 'image' | 'animation';
  source: string;
  license: string;
  attribution?: string;
  version: string;
  reviewStatus: ReviewStatus;
}

export interface Variant {
  id: string;
  name: string;
  kind: SetKind;
  /** Ordre indicatif de difficulté au sein de l'exercice (1 = plus accessible). */
  level: number;
  equipment: string[];
  unilateral?: boolean;
  cues: string[];
  commonErrors: string[];
  media: Media[];
}

export interface Exercise {
  id: string;
  name: string;
  category: 'street_workout' | 'kettlebell' | 'jambes' | 'gainage';
  variants: Variant[];
  reviewStatus: ReviewStatus;
}

export const CATALOG_VERSION = '0.1.0';

export const EXERCISES: Exercise[] = [
  {
    id: 'pushup',
    name: 'Pompes',
    category: 'street_workout',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'pushup-incline',
        name: 'Pompes inclinées (mains surélevées)',
        kind: 'reps',
        level: 1,
        equipment: ['support stable (banc, table)'],
        cues: ['Corps aligné des épaules aux chevilles', 'Poitrine vers le support, coudes vers l’arrière'],
        commonErrors: ['Bassin qui s’affaisse', 'Amplitude réduite sans le noter'],
        media: [],
      },
      {
        id: 'pushup-standard',
        name: 'Pompes au sol',
        kind: 'reps',
        level: 2,
        equipment: [],
        cues: ['Mains sous les épaules environ', 'Descendre sous contrôle, remonter en bloc'],
        commonErrors: ['Bassin qui s’affaisse', 'Tête qui avance avant la poitrine'],
        media: [],
      },
      {
        id: 'pushup-diamond',
        name: 'Pompes diamant',
        kind: 'reps',
        level: 3,
        equipment: [],
        cues: ['Mains rapprochées sous la poitrine', 'Coudes le long du corps'],
        commonErrors: ['Coudes qui s’ouvrent'],
        media: [],
      },
      {
        id: 'pike-pushup',
        name: 'Pompes piquées (pike)',
        kind: 'reps',
        level: 3,
        equipment: [],
        cues: ['Hanches hautes, corps en V', 'Tête vers l’avant des mains'],
        commonErrors: ['Dos rond', 'Amplitude réduite'],
        media: [],
      },
    ],
  },
  {
    id: 'pull',
    name: 'Tirage à la barre',
    category: 'street_workout',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'row-australian',
        name: 'Rowing australien (barre basse)',
        kind: 'reps',
        level: 1,
        equipment: ['barre basse'],
        cues: ['Corps gainé', 'Tirer la poitrine vers la barre'],
        commonErrors: ['Hanches qui tombent', 'Tirer avec le cou'],
        media: [],
      },
      {
        id: 'pullup-band',
        name: 'Tractions avec élastique',
        kind: 'reps',
        level: 2,
        equipment: ['barre fixe', 'élastique'],
        cues: ['Partir bras tendus', 'Menton au-dessus de la barre sans élan'],
        commonErrors: ['Demi-amplitude', 'Élan des jambes'],
        media: [],
      },
      {
        id: 'pullup-negative',
        name: 'Tractions négatives',
        kind: 'reps',
        level: 2,
        equipment: ['barre fixe'],
        cues: ['Monter en haut (saut ou appui)', 'Descendre lentement jusqu’aux bras tendus'],
        commonErrors: ['Lâcher la descente en fin d’amplitude'],
        media: [],
      },
      {
        id: 'pullup-strict',
        name: 'Tractions strictes',
        kind: 'reps',
        level: 3,
        equipment: ['barre fixe'],
        cues: ['Bras tendus en bas', 'Menton au-dessus de la barre'],
        commonErrors: ['Kipping non voulu', 'Amplitude partielle'],
        media: [],
      },
      {
        id: 'chinup-strict',
        name: 'Tractions supination',
        kind: 'reps',
        level: 3,
        equipment: ['barre fixe'],
        cues: ['Paumes vers soi', 'Menton au-dessus de la barre'],
        commonErrors: ['Élan des jambes'],
        media: [],
      },
      {
        id: 'pullup-weighted',
        name: 'Tractions lestées',
        kind: 'reps',
        level: 4,
        equipment: ['barre fixe', 'ceinture de lest'],
        cues: ['Lest bien calé, sans balancier', 'Amplitude complète comme sans lest'],
        commonErrors: ['Amplitude qui raccourcit avec la charge'],
        media: [],
      },
    ],
  },
  {
    id: 'dips',
    name: 'Dips',
    category: 'street_workout',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'dips-bench',
        name: 'Dips sur banc',
        kind: 'reps',
        level: 1,
        equipment: ['banc'],
        cues: ['Épaules basses, loin des oreilles', 'Descendre dans une amplitude confortable'],
        commonErrors: ['Descendre au-delà de l’amplitude tolérée'],
        media: [],
      },
      {
        id: 'dips-bars',
        name: 'Dips aux barres parallèles',
        kind: 'reps',
        level: 2,
        equipment: ['barres parallèles'],
        cues: ['Corps légèrement penché vers l’avant', 'Remonter bras tendus'],
        commonErrors: ['Épaules qui remontent', 'Amplitude non contrôlée'],
        media: [],
      },
      {
        id: 'dips-weighted',
        name: 'Dips lestés',
        kind: 'reps',
        level: 3,
        equipment: ['barres parallèles', 'ceinture de lest'],
        cues: ['Épaules basses, buste légèrement penché', 'Descendre jusqu’à l’épaule au niveau du coude, sans douleur'],
        commonErrors: ['Descente trop profonde qui tire sur l’épaule'],
        media: [],
      },
    ],
  },
  {
    id: 'squat',
    name: 'Squat',
    category: 'jambes',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'squat-bodyweight',
        name: 'Squat au poids du corps',
        kind: 'reps',
        level: 1,
        equipment: [],
        cues: ['Pieds à plat', 'Genoux dans l’axe des pieds'],
        commonErrors: ['Talons qui décollent'],
        media: [],
      },
      {
        id: 'squat-goblet-kb',
        name: 'Goblet squat kettlebell',
        kind: 'reps',
        level: 2,
        equipment: ['kettlebell'],
        cues: ['Kettlebell contre la poitrine', 'Buste haut'],
        commonErrors: ['Dos qui s’arrondit en bas'],
        media: [],
      },
    ],
  },
  {
    id: 'lunge',
    name: 'Fentes',
    category: 'jambes',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'lunge-reverse',
        name: 'Fentes arrière',
        kind: 'reps',
        level: 1,
        equipment: [],
        unilateral: true,
        cues: ['Grand pas en arrière', 'Genou avant stable'],
        commonErrors: ['Genou avant qui rentre vers l’intérieur'],
        media: [],
      },
      {
        id: 'split-squat-bulgarian',
        name: 'Squat bulgare',
        kind: 'reps',
        level: 2,
        unilateral: true,
        equipment: ['banc'],
        cues: ['Pied arrière posé sur le support', 'Genou avant dans l’axe du pied'],
        commonErrors: ['Genou qui rentre'],
        media: [],
      },
    ],
  },
  {
    id: 'kb-swing',
    name: 'Swing kettlebell',
    category: 'kettlebell',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'kb-swing-2h',
        name: 'Swing à deux mains',
        kind: 'reps',
        level: 1,
        equipment: ['kettlebell'],
        cues: ['Mouvement de charnière de hanche', 'Bras relâchés, la hanche propulse'],
        commonErrors: ['Squatter au lieu de plier les hanches', 'Lever avec les bras'],
        media: [],
      },
    ],
  },
  {
    id: 'plank',
    name: 'Gainage',
    category: 'gainage',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'plank-forearm',
        name: 'Planche sur les avant-bras',
        kind: 'hold',
        level: 1,
        equipment: [],
        cues: ['Corps aligné', 'Respiration continue'],
        commonErrors: ['Bassin trop haut ou trop bas'],
        media: [],
      },
      {
        id: 'hollow-hold',
        name: 'Hollow hold',
        kind: 'hold',
        level: 2,
        equipment: [],
        cues: ['Bas du dos plaqué au sol', 'Bras et jambes tendus selon le niveau'],
        commonErrors: ['Bas du dos qui décolle'],
        media: [],
      },
    ],
  },
  {
    id: 'hanging-core',
    name: 'Abdos suspendu',
    category: 'gainage',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'knee-raise-hanging',
        name: 'Relevés de genoux suspendu',
        kind: 'reps',
        level: 1,
        equipment: ['barre fixe'],
        cues: ['Bassin qui s’enroule', 'Sans balancier'],
        commonErrors: ['Élan'],
        media: [],
      },
      {
        id: 'leg-raise-hanging',
        name: 'Relevés de jambes tendues',
        kind: 'reps',
        level: 2,
        equipment: ['barre fixe'],
        cues: ['Jambes tendues jusqu’à l’horizontale au moins', 'Descente contrôlée'],
        commonErrors: ['Balancier'],
        media: [],
      },
    ],
  },
  {
    id: 'kb-row',
    name: 'Rowing kettlebell',
    category: 'kettlebell',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'kb-row-1arm',
        name: 'Rowing kettlebell un bras',
        kind: 'reps',
        level: 1,
        unilateral: true,
        equipment: ['kettlebell'],
        cues: ['Dos plat, main libre en appui', 'Tirer le coude vers la hanche'],
        commonErrors: ['Rotation du buste'],
        media: [],
      },
    ],
  },
  {
    id: 'kb-press',
    name: 'Développé kettlebell',
    category: 'kettlebell',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'kb-press-1arm',
        name: 'Développé un bras',
        kind: 'reps',
        level: 2,
        unilateral: true,
        equipment: ['kettlebell'],
        cues: ['Fessiers et abdos serrés', 'Bras vertical en haut'],
        commonErrors: ['Cambrure du bas du dos'],
        media: [],
      },
    ],
  },
  {
    id: 'hinge',
    name: 'Charnière de hanche',
    category: 'kettlebell',
    reviewStatus: 'non_relu',
    variants: [
      {
        id: 'kb-rdl',
        name: 'Soulevé de terre jambes semi-tendues kettlebell',
        kind: 'reps',
        level: 1,
        equipment: ['kettlebell'],
        cues: ['Hanches vers l’arrière, dos plat', 'Kettlebell près des jambes'],
        commonErrors: ['Dos rond'],
        media: [],
      },
    ],
  },
];

export function findVariant(variantId: string): { exercise: Exercise; variant: Variant } | undefined {
  for (const exercise of EXERCISES) {
    const variant = exercise.variants.find((v) => v.id === variantId);
    if (variant) return { exercise, variant };
  }
  return undefined;
}
