// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { advance, pacesFrom, stepsFor, type GuideState } from '../src/engine/guided';

describe('course guidée', () => {
  it('« fractionné 6 × 400 m » → échauffement, 6 efforts, 5 récups, retour au calme', () => {
    const s = stepsFor({ title: 'Course · fractionné 6 × 400 m', detail: 'récup 90 s trot' }, {});
    expect(s.filter((x) => x.kind === 'effort')).toHaveLength(6);
    expect(s.filter((x) => x.kind === 'recup')).toHaveLength(5);
    expect(s[0]).toMatchObject({ kind: 'echauffement', seconds: 600, effort: 'facile, tu peux parler' });
    expect(s[1]).toMatchObject({ meters: 400, effort: '8/10, vite mais contrôlé' });
  });

  it('allures tirées de l’historique : meilleure 5 km en 25 min → facile 6:00, rapide 4:40', () => {
    const p = pacesFrom([{ id: 'a', day: '2026-11-01', km: 5, minutes: 25, at: 0 }]);
    expect(p).toEqual({ easy: 360, fast: 280 });
    expect(stepsFor({ title: 'Course · endurance 5 km', km: 5 }, p)[0]).toMatchObject({ meters: 5000, pace: 360 });
  });

  it('avance d’étape en étape (durée puis distance)', () => {
    const steps = stepsFor({ title: 'Course · fractionné 2 × 400 m' }, {});
    let st: GuideState = { index: 0, startM: 0, startS: 0 };
    expect(advance(steps, st, 1500, 599).started).toBeUndefined();
    const r1 = advance(steps, st, 1500, 600);
    expect(r1.started?.kind).toBe('effort');
    st = r1.state;
    expect(advance(steps, st, 1890, 680).started).toBeUndefined();
    const r2 = advance(steps, st, 1900, 690);
    expect(r2.started?.kind).toBe('recup');
  });
});
