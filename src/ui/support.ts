// Utilitaires d'interface : identifiants, formatage, temps courant.

import { useEffect, useState } from 'react';
import type { SessionOutcome } from '../engine/types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Repli pour les contextes non sécurisés (http sur le réseau local).
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels';
  } catch {
    return 'Europe/Brussels';
  }
}

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function fmtDateTime(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-BE', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

export const OUTCOME_LABEL: Record<SessionOutcome, string> = {
  in_progress: 'En cours',
  completed: 'Réalisée',
  partial: 'Partielle',
  stopped_for_safety: 'Arrêtée (sécurité)',
};

/** Heure courante rafraîchie à intervalle régulier. L'affichage est recalculé depuis
 *  les horodatages : un retard de rafraîchissement ne fausse jamais une durée. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}

/** Garde l'écran allumé pendant la séance si le navigateur le permet. */
export function useWakeLock(active: boolean): 'active' | 'unsupported' | 'inactive' {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [state, setState] = useState<'active' | 'inactive'>('inactive');
  useEffect(() => {
    if (!supported || !active) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) await lock.release();
        else {
          setState('active');
          lock.addEventListener('release', () => setState('inactive'));
        }
      } catch {
        setState('inactive');
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [active, supported]);
  return supported ? state : 'unsupported';
}
