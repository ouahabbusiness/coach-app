// Matériel : ce que tu possèdes, et ce qui changerait le plus ta progression si tu l'achetais.
// La note est calculée pour toi (objectifs, zones, ce qui te bloque aujourd'hui), avec sa raison.
// Prix = ordres de grandeur indicatifs (neuf, entrée de gamme), jamais un lien ni une marque.

import { availableLoads } from './progression';
import type { Pain, Priority, Zone } from './programBuilder';

export interface GearContext {
  owned: string[];
  pieces: number[];
  kettlebells: number[];
  priority?: Priority;
  fatZones: Zone[];
  muscleZones: Zone[];
  pains: Pain[];
  runsPerWeek?: number;
}

export interface Gear {
  id: string;
  name: string;
  /** Matériel du catalogue d'exercices que cet accessoire apporte. */
  provides: string[];
  muscles: string[];
  unlocks: string[];
  price: [number, number];
  portable?: boolean;
  /** Effet sur les charges : pièces de lest ou kettlebell ajoutées. */
  addsPieces?: number[];
  addsKettlebell?: number;
  rate: (c: GearContext) => { score: number; why: string };
}

const has = (c: GearContext, ...z: Zone[]) => z.some((x) => c.fatZones.includes(x) || c.muscleZones.includes(x));
const maxGap = (loads: number[]) => loads.slice(1).reduce((m, l, i) => Math.max(m, l - loads[i]!), 0);

export const GEAR: Gear[] = [
  {
    id: 'disques-fins',
    name: 'Petits disques (2 × 1,25 kg + 2 × 2,5 kg)',
    provides: [],
    muscles: ['dos', 'biceps', 'pectoraux', 'triceps'],
    unlocks: ['Tractions et dips lestés par paliers de 1,25 kg'],
    price: [15, 35],
    addsPieces: [1.25, 1.25, 2.5, 2.5],
    rate: (c) => {
      const gap = maxGap(availableLoads(c.pieces));
      const force = c.priority === 'force' || c.priority === 'hybride';
      return gap >= 4
        ? { score: force ? 9 : 7, why: `Aujourd’hui ton lest saute jusqu’à ${gap} kg d’un coup (ex. 12 → 16 kg). Avec des petits disques, tu montes chaque semaine au lieu de stagner.` }
        : { score: 4, why: 'Tes paliers de lest sont déjà fins.' };
    },
  },
  {
    id: 'kb-lourde',
    name: 'Kettlebell 16 kg (ou 20 kg)',
    provides: ['kettlebell'],
    muscles: ['fessiers', 'ischios', 'quadriceps', 'dos'],
    unlocks: ['Goblet squat, swing, soulevé de terre et pont fessier plus lourds'],
    price: [35, 60],
    addsKettlebell: 16,
    rate: (c) => {
      const top = Math.max(0, ...c.kettlebells);
      if (top >= 16) return { score: 2, why: 'Tu as déjà une kettlebell lourde.' };
      const lower = has(c, 'cuisses', 'fessiers', 'hanches');
      return { score: lower ? 10 : c.priority === 'seche' || c.priority === 'muscle' ? 8 : 6, why: `Ton bas du corps plafonne à ${top} kg : au-delà, les répétitions montent mais le muscle progresse moins.${lower ? ' Directement lié à tes cuisses et fessiers.' : ''}` };
    },
  },
  {
    id: 'banc',
    name: 'Banc ou box stable',
    provides: ['banc', 'support stable (banc, table)'],
    muscles: ['fessiers', 'quadriceps', 'triceps'],
    unlocks: ['Squat bulgare', 'Hip thrust (pont fessier surélevé)', 'Dips sur banc', 'Pompes inclinées'],
    price: [30, 80],
    rate: (c) => {
      const lower = has(c, 'cuisses', 'fessiers', 'hanches');
      if (c.pains.includes('genoux')) return { score: 4, why: 'Avec tes genoux, le squat bulgare n’est pas proposé : intérêt réduit.' };
      return { score: lower ? 9 : 6, why: lower ? 'Le squat bulgare et le hip thrust sont parmi les meilleurs exercices pour fessiers et cuisses à la maison.' : 'Débloque le squat bulgare : jambes unilatérales sans charge lourde.' };
    },
  },
  {
    id: 'anneaux',
    name: 'Anneaux de gymnastique',
    provides: ['barre basse'],
    muscles: ['dos', 'biceps', 'épaules', 'pectoraux'],
    unlocks: ['Rowing australien (tirage horizontal)', 'Tirage partout en séjour (arbre, portique)'],
    price: [20, 40],
    portable: true,
    rate: (c) => ({ score: c.owned.includes('barre basse') ? 3 : 7, why: 'Seul tirage horizontal possible chez toi, et il tient dans un sac : tu gardes le dos en séjour.' }),
  },
  {
    id: 'corde',
    name: 'Corde à sauter',
    provides: ['corde à sauter'],
    muscles: ['mollets', 'cardio'],
    unlocks: ['Cardio intense en 10 min, même en séjour'],
    price: [8, 20],
    portable: true,
    rate: (c) => ({ score: c.priority === 'seche' || has(c, 'ventre', 'cuisses', 'hanches') ? 7 : 5, why: 'Brûle beaucoup en peu de temps et prépare les mollets à la course. Pas de perte localisée : c’est le gras global qui baisse.' }),
  },
  {
    id: 'roue',
    name: 'Roue abdominale',
    provides: ['roue abdominale'],
    muscles: ['abdominaux', 'gainage'],
    unlocks: ['Roll-out : gainage très exigeant'],
    price: [10, 25],
    portable: true,
    rate: (c) => (c.pains.includes('dos') ? { score: 2, why: 'Déconseillée avec ton dos sensible.' } : { score: has(c, 'ventre') ? 6 : 4, why: 'Renforce le ventre en profondeur ; le gras du ventre, lui, part avec le déficit.' }),
  },
  {
    id: 'mini-bandes',
    name: 'Mini-bandes (élastiques de hanches)',
    provides: ['mini-bande'],
    muscles: ['fessiers (moyen fessier)'],
    unlocks: ['Activation des fessiers avant les jambes', 'Marche latérale'],
    price: [8, 15],
    portable: true,
    rate: (c) => ({ score: has(c, 'fessiers', 'hanches') ? 6 : 3, why: 'Petit prix, utile en échauffement pour mieux sentir les fessiers.' }),
  },
  {
    id: 'rouleau',
    name: 'Rouleau de massage',
    provides: ['rouleau'],
    muscles: ['récupération'],
    unlocks: ['Auto-massage après la course et les jambes'],
    price: [12, 30],
    rate: (c) => ({ score: (c.runsPerWeek ?? 0) >= 3 ? 5 : 3, why: 'Confort de récupération ; l’effet sur la performance reste modeste.' }),
  },
];

export type Verdict = 'Game changer' | 'Utile' | 'Bonus';
export const verdict = (score: number): Verdict => (score >= 8 ? 'Game changer' : score >= 5 ? 'Utile' : 'Bonus');

/** Recommandations triées : ce que tu n'as pas encore, de l'impact le plus fort au plus faible. */
export function recommendGear(c: GearContext, ownedGear: string[]): { gear: Gear; score: number; why: string; verdict: Verdict }[] {
  return GEAR.filter((g) => !ownedGear.includes(g.id))
    .map((g) => {
      const r = g.rate(c);
      return { gear: g, score: r.score, why: r.why, verdict: verdict(r.score) };
    })
    .sort((a, b) => b.score - a.score);
}

/** Matériel de base déclaré par Hmidou le 26/10/2026. */
export const DEFAULT_OWNED = ['barre fixe', 'barres parallèles', 'kettlebell', 'ceinture de lest', 'élastique', 'tapis'];
