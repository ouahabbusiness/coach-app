// Données de test fictives (base simulée).
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { estimateEnergy, hasActivity } from '../src/engine/activity';
import { adaptSets, adaptationPatterns, jointAdvice } from '../src/engine/joints';
import { adviseRuns, spaceRuns } from '../src/engine/runSchedule';
import { calorieTarget } from '../src/engine/targets';
import { trainingOfProgram, declaredZones } from '../src/ui/profileComplement';
import { planRuns } from '../src/ui/Complement';
import type { PlannedItem } from '../src/engine/planning';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

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

  it('pas qui comprennent tapis et trajets déclarés : ils ne sont pas ajoutés une seconde fois', () => {
    const withSteps = estimateEnergy({ bmr: 1800, weightKg: 79, activity: { steps: 8000, stepsIncludes: ['tapis', 'trajets'], treadmillMin: 60, walkCommuteMin: 30 }, training, treadmillDaysPerWeek: 4, workDaysPerWeek: 5 })!;
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
  it('niveaux d’orientation : perte de force, fourmillements ou blocage = évaluation rapide ; le reste = avis', () => {
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: ['faiblesse'] }]).referral).toMatchObject({ level: 'urgent' });
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: ['blocage'] }]).referral?.text).toMatch(/sans attendre/);
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: ['nuit'] }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'coudes', triggers: [], alerts: [], trend: 'pire' }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'coudes', triggers: [], alerts: [], freq: 'souvent', since: '>6m' }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'coudes', triggers: [], alerts: [], next: 'dure' }]).referral).toMatchObject({ level: 'avis' });
  });
  it('un score de douleur seul n’est jamais une frontière médicale', () => {
    expect(jointAdvice([{ zone: 'epaule', triggers: ['dips'], alerts: [], maxPain: 9 }]).referral).toBeUndefined();
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
    expect(r.advice).toHaveLength(1);
    expect(r.advice[0]!.keep.date).toBe('2026-11-01');
    expect(r.advice[0]!.replace.date).toBe('2026-10-31');
    expect(r.advice[0]!.reason).toMatch(/Pas de rattrapage/);
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

describe('pas : ce qu’ils comprennent, sans omission ni doublon', () => {
  const base = { bmr: 1800, weightKg: 79, training, treadmillDaysPerWeek: 4, workDaysPerWeek: 5 };
  const withTread = { steps: 6000, treadmillMin: 60 };

  it('total qui exclut le tapis : le tapis est ajouté ; total qui l’inclut : non ajouté', () => {
    const excl = estimateEnergy({ ...base, activity: withTread })!;
    const incl = estimateEnergy({ ...base, activity: { ...withTread, stepsIncludes: ['tapis'] } })!;
    expect(excl.maintenance).toBeGreaterThan(incl.maintenance);
    expect(excl.lines.join(' ')).toMatch(/de tapis \(non compris dans tes pas\)/);
    expect(incl.notes.join(' ')).toMatch(/Tapis déjà dans tes pas/);
  });
  it('pas sur tous les jours ou comprenant les courses : la course n’est pas comptée deux fois', () => {
    const jours = estimateEnergy({ ...base, activity: { steps: 8000 } })!;
    const tous = estimateEnergy({ ...base, activity: { steps: 8000, stepsPeriod: 'tous' } })!;
    const courses = estimateEnergy({ ...base, activity: { steps: 8000, stepsIncludes: ['courses'] } })!;
    expect(tous.maintenance).toBeLessThan(jours.maintenance);
    expect(courses.maintenance).toBe(tous.maintenance);
    expect(tous.lines.join(' ')).toMatch(/course : déjà dans tes pas/);
  });
  it('sans précision : l’hypothèse est écrite ; pas estimés : marge d’erreur signalée', () => {
    expect(estimateEnergy({ ...base, activity: { steps: 8000 } })!.notes.join(' ')).toMatch(/Hypothèse/);
    expect(estimateEnergy({ ...base, activity: { steps: 8000, stepsMeasured: false } })!.notes.join(' ')).toMatch(/estimés/);
  });
});

describe('adaptation à la gêne : elle modifie la prescription', () => {
  const set = (variantId: string, blockId: string): { variantId: string; blockId: string; role: string; targetRir: number; lastSetToFailure: boolean; progression?: string } => ({ variantId, blockId, role: 'work', targetRir: 2, lastSetToFailure: true });
  const sets = [set('pullup-strict', 'b1'), set('pullup-strict', 'b1'), set('pullup-strict', 'b1'), set('pullup-strict', 'b1'), set('kb-row-1arm', 'b2'), set('kb-row-1arm', 'b2'), set('kb-row-1arm', 'b2')];

  it('déclencheurs → motifs de variantes ; inconnu → aucun motif', () => {
    expect(adaptationPatterns([{ zone: 'epaule', triggers: ['tractions', 'dips'], alerts: [] }])).toEqual(['pullup|chinup', 'dips']);
    expect(adaptationPatterns([{ zone: 'coudes', triggers: ['inconnu'], alerts: [] }])).toEqual([]);
  });
  it('marge de 3, jamais à l’échec, une série de moins, consigne ; les autres exercices ne bougent pas', () => {
    const out = adaptSets(sets, ['pullup|chinup']);
    expect(out.filter((x) => x.variantId === 'pullup-strict')).toHaveLength(3);
    expect(out.filter((x) => x.variantId === 'kb-row-1arm')).toHaveLength(3);
    for (const x of out.filter((y) => y.variantId === 'pullup-strict')) expect(x).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    expect(out.find((x) => x.variantId === 'pullup-strict')!.progression).toMatch(/Adaptée à ta gêne/);
    expect(out.find((x) => x.variantId === 'kb-row-1arm')).toMatchObject({ targetRir: 2, lastSetToFailure: true });
  });
  it('jamais sous 2 séries ; aucun motif : rien ne change', () => {
    expect(adaptSets([set('dips-weighted', 'b'), set('dips-weighted', 'b')], ['dips'])).toHaveLength(2);
    expect(adaptSets(sets, [])).toBe(sets);
  });
});

describe('deux courses consécutives sans jour libre', () => {
  const run = (day: number, km: number) => ({ day, start: '09:30', durationMin: 15, kind: 'course', km, title: 'c' + day });
  it('sans fatigue : on garde la plus longue ; avec fatigue : la plus courte ; jamais de rattrapage', () => {
    const e = run(5, 1.5);
    const l = run(6, 2.5);
    expect(adviseRuns(e, l, { tired: false, sessionsDone: 1 })).toMatchObject({ keep: l, replace: e });
    expect(adviseRuns(e, l, { tired: true, sessionsDone: 1 })).toMatchObject({ keep: e, replace: l });
    expect(adviseRuns(e, l, { tired: false, sessionsDone: 2 }).reason).toMatch(/2 séances de force déjà faites/);
    expect(adviseRuns(e, l, { tired: false, sessionsDone: 0 }).reason).toMatch(/Pas de rattrapage/);
  });
});

describe('adaptation acceptée : elle apparaît dans la séance lancée et ne touche pas l’historique', () => {
  it('lancement : marge de 3, une série de moins, consigne ; sans adaptation : prescription inchangée', async () => {
    const { CoachDb, Repository } = await import('../src/storage/db');
    const { startSessionFromTemplate } = await import('../src/ui/actions');
    const { project } = await import('../src/engine/session');
    const { JOINT_ADAPT } = await import('../src/ui/profileComplement');
    const tpl = {
      id: 'A',
      title: 'Force haut du corps',
      updatedAt: 0,
      lines: [
        { id: 'l1', variantId: 'pullup-strict', kind: 'reps' as const, role: 'work' as const, sets: 4, targetReps: 7, repRange: [7, 10] as [number, number], targetRir: 2, restSeconds: 150 },
        { id: 'l2', variantId: 'kb-row-1arm', kind: 'reps' as const, role: 'work' as const, sets: 3, targetReps: 10, repRange: [10, 15] as [number, number], targetRir: 2, loadKg: 12, restSeconds: 75 },
      ],
    };
    const repo = new Repository(new CoachDb('adapt-1'));
    const plain = project(await repo.sessionEvents(await startSessionFromTemplate(repo, tpl)))!;
    expect(plain.sets.filter((s) => s.planned.variantId === 'pullup-strict')).toHaveLength(4);

    await repo.setKv(JOINT_ADAPT, { patterns: ['pullup|chinup'], at: 1 });
    const st = project(await repo.sessionEvents(await startSessionFromTemplate(repo, tpl)))!;
    const pulls = st.sets.filter((s) => s.planned.variantId === 'pullup-strict');
    expect(pulls).toHaveLength(3);
    expect(pulls[0]!.planned).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    expect(pulls[0]!.planned.progression).toMatch(/Adaptée à ta gêne/);
    expect(st.sets.filter((s) => s.planned.variantId === 'kb-row-1arm')).toHaveLength(3);
    // les séances déjà enregistrées ne sont pas modifiées
    expect(plain.sets.filter((s) => s.planned.variantId === 'pullup-strict')).toHaveLength(4);
  });
});
