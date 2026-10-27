// Course simulée (données fictives) : ligne droite, un point par seconde.
import { describe, expect, it } from 'vitest';
import { analyzeInitiation, type RunPoint } from '../src/engine/runInitiation';

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
const M_PER_DEG = 111_195; // mètres par degré de latitude (approx.)

/** Profil de vitesse (m/s) seconde par seconde → points GPS. */
function track(speeds: number[], acc = 5): RunPoint[] {
  let lat = 50.94;
  return speeds.map((v, s) => {
    if (s) lat += v / M_PER_DEG;
    return [lat, 4.04, T0 + s * 1000, acc];
  });
}
const repeat = (v: number, n: number) => Array<number>(n).fill(v);
const marks = [T0, T0 + 300_000, T0 + 1_500_000];

describe('course d’initiation', () => {
  it('course continue et confortable : allure de référence, pas de marche, +10 % ensuite', () => {
    const speeds = [...repeat(1.6, 300), ...repeat(2.8, 1200), ...repeat(1.5, 300)];
    const r = analyzeInitiation({ segments: [track(speeds)], marks, rejected: 0, elapsedS: 1800, declared: { hrAvg: 152, hrMax: 168, rpe: 5, talk: 'phrases' } });
    expect(r.walkBreaks).toBe(0);
    expect(r.easyPace).toBeGreaterThan(350);
    expect(r.easyPace).toBeLessThan(365); // 1000 / 2,8 ≈ 357 s/km
    expect(r.easyStatus).toBe('référence');
    expect(r.gpsQuality).toBe('bonne');
    expect(r.next.title).toContain('22 min');
    expect(r.metrics.find((m) => m.label === 'FC moyenne')).toMatchObject({ value: '152 bpm', source: 'déclaré (montre)' });
  });

  it('passages en marche et ralentissement : détectés, course-marche proposée, référence à confirmer', () => {
    const run = [...repeat(3.2, 240), ...repeat(1.2, 90), ...repeat(2.6, 240), ...repeat(1.2, 90), ...repeat(2.4, 240), ...repeat(1.2, 90), ...repeat(2.3, 210)];
    const r = analyzeInitiation({ segments: [track([...repeat(1.6, 300), ...run, ...repeat(1.5, 300)])], marks, rejected: 0, elapsedS: 1800, declared: { rpe: 8, talk: 'mots' } });
    expect(r.walkBreaks).toBe(3);
    expect(r.driftPct).toBeGreaterThan(8);
    expect(r.easyStatus).toBe('à confirmer');
    expect(r.next.title).toContain('Course-marche');
    expect(r.findings.join(' ')).toContain('FC non renseignée');
  });

  it('GPS médiocre : signalé, la référence n’est pas validée ; douleur : pas de progression', () => {
    const speeds = [...repeat(1.6, 300), ...repeat(2.8, 1200), ...repeat(1.5, 300)];
    const r = analyzeInitiation({ segments: [track(speeds, 25)], marks, rejected: 600, elapsedS: 1800, declared: { rpe: 5, talk: 'phrases', pain: 'genou droit' } });
    expect(r.gpsQuality).toBe('faible');
    expect(r.easyStatus).toBe('à confirmer');
    expect(r.next.title).toContain('sans progression');
  });

  it('valeurs non renseignées affichées comme inconnues, jamais inventées', () => {
    const r = analyzeInitiation({ segments: [track(repeat(2.5, 200))], marks, rejected: 0, elapsedS: 200, declared: {} });
    expect(r.metrics.find((m) => m.label === 'FC max')).toMatchObject({ value: 'non renseignée', source: 'inconnu' });
    expect(r.findings.join(' ')).toContain('incomplète');
  });
});
