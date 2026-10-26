// Heures de prière calculées sur l'appareil (bibliothèque adhan, calcul astronomique, aucune requête réseau).
// Méthode par défaut : Ligue islamique mondiale ; un réglage ± minutes par prière permet de coller à l'app de la mosquée.

import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const PRAYER_LABELS: Record<PrayerName | 'sunrise', string> = { fajr: 'Fajr', sunrise: 'Lever', dhuhr: 'Dohr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

export type Method = 'MuslimWorldLeague' | 'Egyptian' | 'Karachi' | 'UmmAlQura' | 'Kuwait' | 'Qatar' | 'MoonsightingCommittee' | 'Turkey';

export interface PrayerSettings {
  enabled: boolean;
  lat: number;
  lon: number;
  place: string;
  method: Method;
  hanafi?: boolean;
  /** Ajustement en minutes par prière (ex. { fajr: 1 }). */
  adjust: Partial<Record<PrayerName | 'sunrise', number>>;
  /** Temps bloqué pour chaque prière (minutes). */
  blockMin: number;
  /** Se lever pour Fajr : la routine du matin démarre à Fajr. */
  wakeAtFajr: boolean;
}

/** Alost (Aalst), Belgique. */
export const DEFAULT_PRAYER: PrayerSettings = { enabled: false, lat: 50.9378, lon: 4.0403, place: 'Alost', method: 'MuslimWorldLeague', adjust: {}, blockMin: 15, wakeAtFajr: true };

export type DayPrayers = Record<PrayerName | 'sunrise', string>;

const hhmm = (d: Date, timeZone: string) => new Intl.DateTimeFormat('fr-BE', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

/** Heures du jour (AAAA-MM-JJ) dans le fuseau donné. */
export function prayerTimes(day: string, s: PrayerSettings, timeZone: string): DayPrayers {
  const [y, m, d] = day.split('-').map(Number);
  const params = CalculationMethod[s.method]();
  if (s.hanafi) params.madhab = Madhab.Hanafi;
  const p = new PrayerTimes(new Coordinates(s.lat, s.lon), new Date(y!, m! - 1, d!), params);
  const shift = (t: Date, k: PrayerName | 'sunrise') => hhmm(new Date(t.getTime() + (s.adjust[k] ?? 0) * 60_000), timeZone);
  return { fajr: shift(p.fajr, 'fajr'), sunrise: shift(p.sunrise, 'sunrise'), dhuhr: shift(p.dhuhr, 'dhuhr'), asr: shift(p.asr, 'asr'), maghrib: shift(p.maghrib, 'maghrib'), isha: shift(p.isha, 'isha') };
}

/** Prochaine prière après l'heure donnée (HH:MM), ou undefined après Isha. */
export function nextPrayer(times: DayPrayers, now: string): { name: PrayerName; time: string } | undefined {
  const name = PRAYERS.find((n) => times[n] > now);
  return name ? { name, time: times[name] } : undefined;
}
