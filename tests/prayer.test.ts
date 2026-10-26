import { describe, expect, it } from 'vitest';
import { DEFAULT_PRAYER, nextPrayer, prayerTimes } from '../src/engine/prayer';

describe('heures de prière', () => {
  it('Alost, 26/10/2026, Ligue islamique mondiale : à 1–2 min de SunnApp (Fajr 05:36, Dohr 12:28)', () => {
    const t = prayerTimes('2026-10-26', DEFAULT_PRAYER, 'Europe/Brussels');
    expect(t.fajr).toBe('05:35');
    expect(t.dhuhr).toBe('12:29');
    expect(t.sunrise).toBe('07:25');
  });

  it('ajustement ± minutes pour coller à l’app de la mosquée', () => {
    const t = prayerTimes('2026-10-26', { ...DEFAULT_PRAYER, adjust: { fajr: 1, dhuhr: -1, sunrise: 2 } }, 'Europe/Brussels');
    expect([t.fajr, t.dhuhr, t.sunrise]).toEqual(['05:36', '12:28', '07:27']);
  });

  it('prochaine prière', () => {
    const t = prayerTimes('2026-10-26', DEFAULT_PRAYER, 'Europe/Brussels');
    expect(nextPrayer(t, '13:00')?.name).toBe('asr');
    expect(nextPrayer(t, '23:00')).toBeUndefined();
  });
});
