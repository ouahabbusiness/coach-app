// Préférences de suivi : la pesée plein écran et l'affichage des calories peuvent être désactivés
// (suivi moins fréquent ou sans comptage, si la surveillance devient pesante).

import { useEffect, useState } from 'react';
import type { Repository } from '../storage/db';

export interface TrackingPrefs {
  weighGate: boolean;
  showCalories: boolean;
}

const KEY = 'tracking.prefs';
export const DEFAULT_TRACKING: TrackingPrefs = { weighGate: true, showCalories: true };

export function useTracking(repo: Repository) {
  const [p, setP] = useState<TrackingPrefs>(DEFAULT_TRACKING);
  useEffect(() => {
    repo.getKv<TrackingPrefs>(KEY).then((v) => v && setP({ ...DEFAULT_TRACKING, ...v }));
  }, [repo]);
  const save = async (next: TrackingPrefs) => {
    await repo.setKv(KEY, next);
    setP(next);
  };
  return { prefs: p, save };
}
