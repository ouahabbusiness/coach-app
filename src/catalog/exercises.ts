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
];

export function findVariant(variantId: string): { exercise: Exercise; variant: Variant } | undefined {
  for (const exercise of EXERCISES) {
    const variant = exercise.variants.find((v) => v.id === variantId);
    if (variant) return { exercise, variant };
  }
  return undefined;
}
