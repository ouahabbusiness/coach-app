// Décors simples en SVG (salle, extérieur) avec une icône d'exercice. Aucun personnage.

import type { LucideIcon } from 'lucide-react';
import { Dumbbell, Footprints, PersonStanding, Timer, Weight } from 'lucide-react';
import type { Exercise } from '../catalog/exercises';

export const CATEGORY_ICON: Record<Exercise['category'], LucideIcon> = {
  street_workout: PersonStanding,
  kettlebell: Weight,
  jambes: Footprints,
  gainage: Timer,
};

export function Scene({ kind, icon: Icon = Dumbbell, iconSize = 28 }: { kind: 'gym' | 'outdoor'; icon?: LucideIcon; iconSize?: number }) {
  return (
    <div className={`scene scene-${kind}`}>
      <svg className="scene-bg" viewBox="0 0 300 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {kind === 'gym' ? (
          <>
            <rect width="300" height="220" fill="#cfe0d8" />
            <rect x="0" y="160" width="300" height="60" fill="#b9cbc2" />
            <rect x="20" y="30" width="10" height="130" fill="#a9bbb2" />
            <rect x="110" y="30" width="10" height="130" fill="#a9bbb2" />
            <rect x="20" y="30" width="100" height="8" fill="#97aaa1" />
            <rect x="230" y="60" width="12" height="100" fill="#a9bbb2" />
            <circle cx="236" cy="90" r="22" fill="#8a9c94" />
            <circle cx="236" cy="132" r="22" fill="#8a9c94" />
          </>
        ) : (
          <>
            <rect width="300" height="220" fill="#bfe0ef" />
            <circle cx="250" cy="40" r="18" fill="#f6efcf" />
            <path d="M0 150 Q80 120 160 145 T300 135 L300 220 L0 220 Z" fill="#a7cf9f" />
            <path d="M0 175 Q120 160 300 178 L300 220 L0 220 Z" fill="#8dbd86" />
          </>
        )}
      </svg>
      <span className="scene-icon" aria-hidden="true">
        <Icon size={iconSize} strokeWidth={1.8} />
      </span>
    </div>
  );
}
