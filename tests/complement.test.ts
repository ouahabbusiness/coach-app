// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { estimateEnergy, hasActivity } from '../src/engine/activity';
import { jointAdvice } from '../src/engine/joints';
import { spaceRuns } from '../src/engine/runSchedule';
import { calorieTarget } from '../src/engine/targets';
import { trainingOfProgram, declaredZones } from '../src/ui/profileComplement';
import { planRuns } from '../src/ui/Complement';
import type { PlannedItem } from '../src/engine/planning';

const training = { strengthMinPerWeek: 134, runKmPerWeek: 5.5 };

describe('dépense : activité de la journée + entraînement, sans double comptage', () => {
  it('sans activité renseignée : aucune estimation inventée', () => {
    expect(hasActivity({})).toBe(false);
    expect(estimateEnergy({ bmr: 1800, weightKg: 79, activity: {}, training })).toBeUndefined();
    const t = calorieTarget({ sex: 'homme', age: 26, heightCm: 184, weightKg: 79, sessionsPerWeek: 6, training });
    expect(t.value?.basis).toBe('séances');
    expect(t.why.join(' ')).toMatch(/grossier/);
  });

  it('assis longtemps : base basse + entraînement ajouté une fois, bien sous le facteur « 6 séances »', () => {
    const e = estimateEnergy({ bmr: 1815, weightKg: 79, activity: { sitHours: '9-12' }, training })!;
    // 1815 × 1,3 + musculation 3×79×(134/60)/7 + course 0,9×79×5,5/7
    expect(e.maintenance).toBeGreaterThan(2300);
    expect(e.maintenance).toBeLessThan(2700);
    expect(e.lines.some((l) => l.includes('musculation'))).toBe(true);
    const legacy = calorieTarget({ sex: 'homme', age: 26, heightCm: 184, weightKg: 79, sessionsPerWeek: 6 }).value!.maintenance;
    expect(legacy).toBe(3150);
    expect(e.maintenance).toBeLessThan(legacy - 500);
  });

  it('les pas contiennent déjà tapis et trajets : ils ne sont pas ajoutés une seconde fois', () => {
    const withSteps = estimateEnergy({ bmr: 1800, weightKg: 79, activity: { steps: 8000, treadmillMin: 60, walkCommuteMin: 30 }, training, treadmillDaysPerWeek: 4, workDaysPerWeek: 5 })!;
    const stepsOnly = estimateEnergy({ bmr: 1800, weightKg: 79, activity: { steps: 8000 }, training })!;
    expect(withSteps.maintenance).toBe(stepsOnly.maintenance);
    const noSteps = estimateEnergy({ bmr: 1800, weightKg: 79, activity: { sitHours: '9-12', treadmillMin: 60 }, training, treadmillDaysPerWeek: 4 })!;
    const noTread = estimateEnergy({ bmr: 1800, weightKg: 79, activity: { sitHours: '9-12' }, training, treadmillDaysPerWeek: 4 })!;
    expect(noSteps.maintenance).toBeGreaterThan(noTread.maintenance);
    expect(noTread.notes.join(' ')).toMatch(/Tapis de marche non renseigné/);
  });

  it('la cible utilise l’estimation quand l’activité est connue, et garde les protéines à 1,8 g/kg', () => {
    const t = calorieTarget({ sex: 'homme', age: 26, heightCm: 184, weightKg: 79, sessionsPerWeek: 6, strategy: 'maintien', activity: { sitHours: '9-12' }, training });
    expect(t.value?.basis).toBe('activité');
    expect(t.value!.kcal).toBeLessThan(3000);
    expect(t.value?.proteinG).toBe(142);
  });
});

describe('gêne articulaire : adaptation selon le déclencheur, orientation sans diagnostic', () => {
  it('aucune réponse inquiétante : pas d’orientation, une adaptation par mouvement déclencheur', () => {
    const a = jointAdvice([{ zone: 'epaule', triggers: ['dips'], alerts: [], maxPain: 3, freq: 'parfois', since: '1-6m', next: 'rien' }]);
    expect(a.referral).toBeUndefined();
    expect(a.items[0]!.text).toMatch(/Dips/);
    expect(a.items[0]!.text).toMatch(/pas forcément plus doux/);
  });
  it('déclencheur inconnu : aucun remplacement automatique', () => {
    const a = jointAdvice([{ zone: 'coudes', triggers: ['inconnu'], alerts: [] }]);
    expect(a.items[0]!.text).toMatch(/inconnu/);
  });
  it('signaux d’alerte, douleur forte, gêne fréquente ou qui dure : orientation vers un professionnel', () => {
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: ['nuit'] }]).referral).toMatch(/avis médical/);
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], maxPain: 7 }]).referral).toBeDefined();
    expect(jointAdvice([{ zone: 'coudes', triggers: [], alerts: [], freq: 'souvent', since: '>6m' }]).referral).toBeDefined();
    expect(jointAdvice([{ zone: 'coudes', triggers: [], alerts: [], next: 'dure' }]).referral).toBeDefined();
  });
  it('zones déjà déclarées proposées, jamais inventées', () => {
    expect(declaredZones(['coudes'], 'Légère à l’épaule')).toEqual(['epaule', 'coudes']);
    expect(declaredZones(undefined, undefined)).toEqual([]);
  });
});

describe('courses espacées', () => {
  const it0 = (day: number, kind: string, extra = {}) => ({ day, start: '09:30', durationMin: 20, kind, ...extra });
  const week = [it0(0, 'seance'), it0(2, 'seance'), it0(3, 'course'), it0(4, 'seance'), it0(5, 'course'), it0(6, 'course')];

  it('deux courses consécutives : la première de la paire va sur un jour libre, à midi', () => {
    const r = spaceRuns(week);
    expect(r.moved).toHaveLength(1);
    expect(r.moved[0]).toMatchObject({ fromDay: 5, toDay: 1 });
    const days = r.items.filter((x) => x.kind === 'course').map((x) => x.day).sort();
    expect(days).toEqual([1, 3, 6]);
    expect(r.items.find((x) => x.day === 1)!.start).toBe('12:30');
    expect(r.unresolved).toHaveLength(0);
  });
  it('pas de jour libre ou course non déplaçable : signalé, rien de forcé', () => {
    const r = spaceRuns(week, { movable: () => false });
    expect(r.moved).toHaveLength(0);
    expect(r.unresolved.length).toBeGreaterThan(0);
  });
  it('déjà espacées : rien ne change', () => {
    expect(spaceRuns([it0(1, 'course'), it0(3, 'course'), it0(6, 'course')]).moved).toHaveLength(0);
  });

  it('planning réel : le passé et les séances démarrées ne bougent pas', () => {
    const mk = (id: string, weekStart: string, day: number, kind: PlannedItem['kind'], extra: Partial<PlannedItem> = {}): PlannedItem => ({ id, weekStart, day, start: '09:30', durationMin: 15, kind, title: id, moves: [], ...extra });
    const items = [
      mk('a-lun', '2026-10-26', 0, 'seance'),
      mk('a-jeu', '2026-10-26', 3, 'course'),
      mk('a-sam', '2026-10-26', 5, 'course'),
      mk('a-dim', '2026-10-26', 6, 'course'),
      mk('b-mer', '2026-11-02', 2, 'seance'),
      mk('b-jeu', '2026-11-02', 3, 'course'),
      mk('b-sam', '2026-11-02', 5, 'course'),
      mk('b-dim', '2026-11-02', 6, 'course'),
    ];
    // Mercredi 28/10 : mardi est passé, donc rien de libre cette semaine ; la semaine suivante est corrigée.
    const r = planRuns(items, [], '2026-10-28');
    expect(r.unresolved.map((u) => u.date)).toContain('2026-10-31');
    expect(r.changes).toEqual([{ id: 'b-sam', title: 'b-sam', weekStart: '2026-11-02', fromDay: 5, toDay: 1, start: '12:30' }]);
  });
});

describe('charge d’entraînement du programme', () => {
  it('minutes de musculation et km de course de la 1re semaine', () => {
    const t = trainingOfProgram({ program: { weekly: [[{ kind: 'seance', durationMin: 46 }, { kind: 'course', durationMin: 11, km: 1.5 }, { kind: 'seance', durationMin: 49 }, { kind: 'course', durationMin: 19, km: 2.5 }]] } });
    expect(t).toEqual({ strengthMinPerWeek: 95, runKmPerWeek: 4 });
    expect(trainingOfProgram(null)).toBeUndefined();
  });
});
