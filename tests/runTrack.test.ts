// Données de test fictives (tracé synthétique, pas une vraie course).
import { describe, expect, it } from 'vitest';
import { addPoint, cue, haversine, stats, type GpsPoint, type Segment } from '../src/engine/runTrack';

// ~1 m ≈ 0,000009 degré de latitude.
const DEG_PER_M = 1 / 111195;
const pt = (m: number, s: number, acc = 5): GpsPoint => ({ lat: 50.94 + m * DEG_PER_M, lon: 4.04, t: s * 1000, acc });

describe('suivi GPS', () => {
  it('haversine ≈ 1000 m pour 1 km de latitude', () => {
    expect(Math.round(haversine(pt(0, 0), pt(1000, 0)))).toBe(1000);
  });

  it('points imprécis ou impossibles ignorés', () => {
    let s: Segment = { points: [] };
    s = addPoint(s, pt(0, 0));
    s = addPoint(s, pt(10, 4, 80)); // précision 80 m
    s = addPoint(s, pt(500, 10)); // 50 m/s
    s = addPoint(s, pt(15, 5));
    expect(s.points).toHaveLength(2);
  });

  it('2 km à 5:00/km : distance, allure moyenne et temps par km', () => {
    let s: Segment = { points: [] };
    for (let m = 0; m <= 2010; m += 10) s = addPoint(s, pt(m, m * 0.3));
    const st = stats([s]);
    expect(Math.abs(st.meters - 2010)).toBeLessThan(3);
    expect(st.avgPace).toBe(300);
    expect(st.currentPace).toBe(300);
    expect(st.splits).toEqual([300, 300]);
  });

  it('une pause ne compte ni distance ni temps entre deux segments', () => {
    const a: Segment = { points: [pt(0, 0), pt(500, 150)] };
    const b: Segment = { points: [pt(500, 600), pt(1000, 750)] };
    const st = stats([a, b]);
    expect(Math.round(st.meters)).toBe(1000);
    expect(st.movingMs).toBe(300_000);
  });

  it('annonces : demi-tour à mi-distance, km passés, objectif atteint', () => {
    expect(cue(2400, 2510, 5, true)).toBe('Demi-tour');
    expect(cue(990, 1005)).toBe('1 kilomètre');
    expect(cue(4990, 5001, 5)).toBe('Objectif atteint');
  });
});
