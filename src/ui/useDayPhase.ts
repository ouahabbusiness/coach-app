import { useEffect, useState } from 'react';
import { pastBedtime, phaseAt, type DayPhase } from '../engine/dayPhase';
import type { Repository } from '../storage/db';
import { loadOnboarding } from './profileStore';

/** Ambiance selon l'heure : met à jour `data-phase` sur la page chaque minute. `?phase=nuit` force un mode (aperçu). */
export function useDayPhase(repo: Repository) {
  const [sleep, setSleep] = useState<{ bedtime?: string; wake?: string }>({});
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    loadOnboarding(repo).then((o) => setSleep({ bedtime: o.answers.sleep.bedtime, wake: o.answers.sleep.wake }));
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [repo]);

  const minute = now.getHours() * 60 + now.getMinutes();
  const forced = new URLSearchParams(window.location.search).get('phase') as DayPhase | null;
  const phase: DayPhase = forced ?? phaseAt(minute, sleep.bedtime, sleep.wake);

  useEffect(() => {
    document.documentElement.dataset.phase = phase;
  }, [phase]);

  return { phase, bedtime: sleep.bedtime, pastBed: forced === 'nuit' ? !!sleep.bedtime : pastBedtime(minute, sleep.bedtime, sleep.wake), now };
}
