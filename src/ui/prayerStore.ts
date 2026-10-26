// Réglages des prières (stockés localement) et créneaux bloqués dans l'agenda.

import { useEffect, useState } from 'react';
import type { OneOff } from '../engine/availability';
import { fromMin, toMin } from '../engine/planning';
import { DEFAULT_PRAYER, PRAYER_LABELS, PRAYERS, prayerTimes, type DayPrayers, type PrayerSettings } from '../engine/prayer';
import type { Repository } from '../storage/db';
import { deviceTimeZone } from './support';

const KEY = 'prayer.settings';

export async function loadPrayer(repo: Repository): Promise<PrayerSettings> {
  return { ...DEFAULT_PRAYER, ...((await repo.getKv<PrayerSettings>(KEY)) ?? {}) };
}
export async function savePrayer(repo: Repository, s: PrayerSettings): Promise<void> {
  await repo.setKv(KEY, s);
}

export function usePrayer(repo: Repository) {
  const [s, setS] = useState<PrayerSettings | null>(null);
  useEffect(() => {
    loadPrayer(repo).then(setS);
  }, [repo]);
  const save = async (next: PrayerSettings) => {
    await savePrayer(repo, next);
    setS(next);
  };
  return { settings: s, save };
}

export function timesFor(day: string, s: PrayerSettings): DayPrayers {
  return prayerTimes(day, s, deviceTimeZone());
}

/** Les 5 prières d'une date, comme indisponibilités (le planning ne place rien dessus). */
export function prayerBlocks(day: string, s: PrayerSettings | null): OneOff[] {
  if (!s?.enabled) return [];
  const t = timesFor(day, s);
  return PRAYERS.map((p) => ({ id: `priere-${p}-${day}`, date: day, start: t[p], end: fromMin(toMin(t[p]) + s.blockMin), kind: 'autre' as const, label: PRAYER_LABELS[p] }));
}

/** Indisponibilités + prières pour une liste de dates. */
export function withPrayers(oneOffs: OneOff[], days: string[], s: PrayerSettings | null): OneOff[] {
  return [...oneOffs, ...days.flatMap((d) => prayerBlocks(d, s))];
}
