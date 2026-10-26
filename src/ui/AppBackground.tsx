// Fond de l'app : uni par défaut (charte du 26/10/2026), ou image personnelle jour/nuit choisie dans Réglages.

import type { DayPhase } from '../engine/dayPhase';
import { customBackground, useBackgrounds } from './backgrounds';

export function AppBackground({ phase }: { phase: DayPhase }) {
  const { images } = useBackgrounds();
  const custom = customBackground(images, phase);
  if (!custom) return null;
  return (
    <div className="forest" aria-hidden="true" style={{ backgroundImage: `url(${custom})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="forest-scrim" />
    </div>
  );
}
