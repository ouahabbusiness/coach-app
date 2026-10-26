// Thème « Winter Arc » : ambiance glacée pendant le défi de novembre (automatique) ou forcée dans Réglages.

import { useCallback, useEffect, useState } from 'react';
import { NOVEMBER_2026, dayRange } from '../engine/challenge';
import type { Repository } from '../storage/db';

export type WinterMode = 'auto' | 'on' | 'off';
const KEY = 'settings.winterArc';
const EVENT = 'winter-mode-change';

export interface WinterInfo {
  active: boolean;
  /** Jour du défi (1–30) si on est en novembre, sinon jours restants avant le début. */
  day?: number;
  total: number;
  daysLeft?: number;
}

export function winterInfo(mode: WinterMode, today: string, forced = false): WinterInfo {
  const days = dayRange(NOVEMBER_2026.start, NOVEMBER_2026.end);
  const inChallenge = today >= NOVEMBER_2026.start && today <= NOVEMBER_2026.end;
  const active = forced || mode === 'on' || (mode === 'auto' && inChallenge);
  const info: WinterInfo = { active, total: days.length };
  if (inChallenge) info.day = days.indexOf(today) + 1;
  else if (today < NOVEMBER_2026.start) {
    info.daysLeft = Math.round((Date.parse(`${NOVEMBER_2026.start}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  }
  return info;
}

export function useWinterMode(repo: Repository) {
  const [mode, setModeState] = useState<WinterMode>('auto');
  useEffect(() => {
    repo.getKv<WinterMode>(KEY).then((m) => m && setModeState(m));
    // Synchronise toutes les instances (Réglages ↔ reste de l'app) sans rechargement.
    const onChange = (e: Event) => setModeState((e as CustomEvent<WinterMode>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [repo]);
  const setMode = useCallback(
    async (m: WinterMode) => {
      await repo.setKv(KEY, m);
      setModeState(m);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: m }));
    },
    [repo],
  );
  return { mode, setMode };
}

/** `?theme=winter` force le thème (aperçu). */
export const winterForced = () => new URLSearchParams(window.location.search).get('theme') === 'winter';
