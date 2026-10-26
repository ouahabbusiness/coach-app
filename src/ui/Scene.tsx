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
            <rect width="300" height="220" style={{ fill: 'var(--surface-2)' }} />
            <rect x="0" y="160" width="300" height="60" style={{ fill: 'var(--border)' }} />
            <rect x="20" y="30" width="8" height="130" style={{ fill: 'var(--border)' }} />
            <rect x="110" y="30" width="8" height="130" style={{ fill: 'var(--border)' }} />
            <rect x="20" y="30" width="98" height="6" style={{ fill: 'var(--border)' }} />
            <circle cx="236" cy="96" r="20" style={{ fill: 'var(--border)' }} />
            <circle cx="236" cy="134" r="20" style={{ fill: 'var(--border)' }} />
          </>
        ) : (
          <>
            <rect width="300" height="220" style={{ fill: 'var(--surface-2)' }} />
            <circle cx="250" cy="44" r="16" style={{ fill: 'var(--accent-soft)' }} />
            <path d="M0 150 Q80 120 160 145 T300 135 L300 220 L0 220 Z" style={{ fill: 'var(--border)' }} />
          </>
        )}
      </svg>
      <span className="scene-icon" aria-hidden="true">
        <Icon size={iconSize} strokeWidth={1.8} />
      </span>
    </div>
  );
}
