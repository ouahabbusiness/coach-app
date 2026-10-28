// Données de test fictives (base simulée).
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { estimateEnergy, hasActivity, usableActivity, walkKcalPerMin } from '../src/engine/activity';
import { adaptSets, adaptationPatterns, jointAdvice, normalizeJoint, testPatterns, toggleSymptom, JOINT_ALERT_CHOICES } from '../src/engine/joints';
import { adviseRuns, spaceRuns } from '../src/engine/runSchedule';
import { calorieTarget } from '../src/engine/targets';
import { trainingOfProgram, declaredZones } from '../src/ui/profileComplement';
import { correctReasons, planRuns } from '../src/ui/Complement';
import type { PlannedItem } from '../src/engine/planning';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const training = { strengthMinPerWeek: 134, runKmPerWeek: 5.5 };

describe('dépense : vie quotidienne, tapis, musculation et course, chacun compté une fois', () => {
  const v2 = (a: object) => ({ v: 2 as const, ...a });
  it('sans activité renseignée (ou ancien format) : aucune estimation inventée', () => {
    expect(hasActivity({})).toBe(false);
    expect(hasActivity({ sitHours: '6-9' })).toBe(false); // ancien format sans version
    expect(usableActivity({ steps: 10500 } as never)).toBeUndefined();
    expect(estimateEnergy({ bmr: 1800, weightKg: 79, activity: v2({}), training })).toBeUndefined();
    const t = calorieTarget({ sex: 'homme', age: 26, heightCm: 184, weightKg: 79, sessionsPerWeek: 6, training });
    expect(t.value?.basis).toBe('séances');
    expect(t.why.join(' ')).toMatch(/grossier/);
  });

  it('je bouge peu hors tapis : base basse + tapis réel + musculation + course, détaillés', () => {
    const e = estimateEnergy({ bmr: 1815, weightKg: 79, activity: v2({ steps: 500, stepsMeasured: false, treadmill: { daysPerWeek: 4, minutes: 100, speedKmh: 5 } }), training })!;
    const txt = e.lines.join(' | ');
    expect(txt).toMatch(/500 pas\/jour hors tapis et hors course \(estimés\) → base × 1,2/);
    expect(txt).toMatch(/tapis : 4 j × 100 min par semaine à 5 km\/h/);
    expect(txt).toMatch(/moyenne sur la semaine, pas par séance/);
    expect(txt).toMatch(/la course n’est pas dans les pas/);
    // 1815 × 1,2 = 2178 ; tapis ≈ 188 ; musculation ≈ 76 ; course ≈ 56
    expect(e.maintenance).toBeGreaterThan(2400);
    expect(e.maintenance).toBeLessThan(2600);
    expect(e.notes.join(' ')).toMatch(/estimés/);
  });

  it('marcher et courir ne sont pas interchangeables : la marche suit la vitesse et l’inclinaison', () => {
    expect(walkKcalPerMin(79, 6)).toBeGreaterThan(walkKcalPerMin(79, 4));
    expect(walkKcalPerMin(79, 5, 5)).toBeGreaterThan(walkKcalPerMin(79, 5, 0));
  });

  it('tapis non renseigné : non compté et dit ; vitesse absente : 4,5 km/h supposés et dits', () => {
    const none = estimateEnergy({ bmr: 1800, weightKg: 79, activity: v2({ steps: 3000 }), training })!;
    expect(none.notes.join(' ')).toMatch(/Tapis non renseigné/);
    const noSpeed = estimateEnergy({ bmr: 1800, weightKg: 79, activity: v2({ steps: 3000, treadmill: { daysPerWeek: 3, minutes: 60 } }), training })!;
    expect(noSpeed.notes.join(' ')).toMatch(/4,5 km\/h supposés/);
    expect(noSpeed.maintenance).toBeGreaterThan(none.maintenance);
  });

  it('assis longtemps sans pas renseignés : base selon les heures assises', () => {
    const e = estimateEnergy({ bmr: 1815, weightKg: 79, activity: v2({ sitHours: '9-12' }), training })!;
    expect(e.lines.join(' ')).toMatch(/assis 9 à 12 h/);
    const legacy = calorieTarget({ sex: 'homme', age: 26, heightCm: 184, weightKg: 79, sessionsPerWeek: 6 }).value!.maintenance;
    expect(legacy).toBe(3150);
    expect(e.maintenance).toBeLessThan(legacy - 500);
  });

  it('la cible utilise l’estimation quand l’activité est connue, et garde les protéines à 1,8 g/kg', () => {
    const t = calorieTarget({ sex: 'homme', age: 26, heightCm: 184, weightKg: 79, sessionsPerWeek: 6, strategy: 'maintien', activity: v2({ sitHours: '9-12' }), training });
    expect(t.value?.basis).toBe('activité');
    expect(t.value!.kcal).toBeLessThan(3000);
    expect(t.value?.proteinG).toBe(142);
  });
});

describe('gêne articulaire : adaptation selon le déclencheur, orientation sans diagnostic', () => {
  it('aucune réponse inquiétante : pas d’orientation, une adaptation par mouvement déclencheur', () => {
    const a = jointAdvice([{ zone: 'epaule', triggers: ['dips'], alerts: [], maxPain: 3, freq: 'rare', since: '1-6m', next: 'rien' }]);
    expect(a.referral).toBeUndefined();
    expect(a.items[0]!.text).toMatch(/Dips/);
    expect(a.items[0]!.text).toMatch(/pas forcément plus doux/);
  });
  it('déclencheur inconnu : aucun remplacement automatique', () => {
    const a = jointAdvice([{ zone: 'coudes', triggers: ['inconnu'], alerts: [] }]);
    expect(a.items[0]!.text).toMatch(/inconnu/);
  });
  it('évaluation rapide : bras bloqué, déformation, douleur très forte, fourmillements persistants, ou début brutal récent encore présent', () => {
    for (const al of ['blocage', 'deformation', 'tres_forte', 'engourdissement'] as const) {
      expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [al] }]).referral).toMatchObject({ level: 'urgent' });
    }
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: ['blocage'] }]).referral?.text).toMatch(/sans attendre/);
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], onset: 'evenement', current: 'present', since: '<1m' }]).referral).toMatchObject({ level: 'urgent' });
  });
  it('« apparu d’un coup » : un début brutal ancien n’est pas un symptôme nouveau ; non précisé = à clarifier, ni urgence affirmée ni tout va bien', () => {
    const old = jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], onset: 'evenement', current: 'present', since: '1-6m' }]);
    expect(old.referral).toMatchObject({ level: 'avis' });
    const legacy = jointAdvice([{ zone: 'epaule', triggers: ['tractions'], alerts: ['soudain'] }]);
    expect(legacy.clarifyOnset).toEqual(['epaule']);
    expect(legacy.referral).toMatchObject({ level: 'avis' });
    expect(legacy.hold).toMatch(/ne vérifie pas ta force avec une série lourde ni un test maximal/);
    // précisé : plus rien à clarifier
    const done = jointAdvice([{ zone: 'epaule', triggers: [], alerts: ['soudain'], onset: 'progressif', current: 'ancien' }]);
    expect(done.clarifyOnset).toEqual([]);
    expect(normalizeJoint({ zone: 'epaule', triggers: [], alerts: ['soudain'] }).alerts).toEqual([]);
  });
  it('perte de force, dérobement, douleur limitante, nuit, ça empire, gêne qui dure ou revient = avis, sans attendre une baisse de performance', () => {
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], symptoms: ['perte_force'] }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], symptoms: ['derobement'] }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], symptoms: ['douleur_limitante'] }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: ['nuit'] }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'coudes', triggers: [], alerts: [], trend: 'pire' }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'coudes', triggers: [], alerts: [], next: 'dure' }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'coudes', triggers: [], alerts: [], freq: 'parfois', since: '1-6m' }]).referral).toMatchObject({ level: 'avis' });
    expect(jointAdvice([{ zone: 'epaule', side: 'gauche', triggers: [], alerts: [], symptoms: ['perte_force'] }]).referral?.text).toMatch(/épaule gauche/);
  });
  it('douleur ancienne qui s’améliore : ne permet pas à elle seule d’écarter un problème de force', () => {
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], onset: 'progressif', current: 'ancien', trend: 'mieux', symptoms: ['perte_force'] }]).referral).toMatchObject({ level: 'avis' });
  });
  it('le début n’a supprimé aucun autre critère d’alerte : chacun reste proposé et garde son niveau', () => {
    expect(JOINT_ALERT_CHOICES).toEqual(['engourdissement', 'blocage', 'deformation', 'tres_forte', 'nuit']);
    for (const al of JOINT_ALERT_CHOICES) {
      const lvl = jointAdvice([{ zone: 'epaule', triggers: [], alerts: [al] }]).referral?.level;
      expect(lvl).toBe(al === 'nuit' ? 'avis' : 'urgent');
    }
  });
  it('simple fatigue en fin de série, gêne rare et ancienne ou score seul : pas d’orientation', () => {
    expect(jointAdvice([{ zone: 'epaule', triggers: ['dips'], alerts: [], symptoms: ['fatigue_fin'], freq: 'rare', since: '1-6m', maxPain: 9 }]).referral).toBeUndefined();
  });
  it('ancienne réponse « perte de force ou instabilité » : jamais convertie en « moins de force », à clarifier', () => {
    const n = normalizeJoint({ zone: 'epaule', triggers: [], alerts: ['faiblesse', 'nuit'] });
    expect(n.symptoms).toEqual([]);
    expect(n.alerts).toEqual(['nuit']);
    expect(n.clarify).toBe(true);
    const a = jointAdvice([{ zone: 'epaule', triggers: ['tractions'], alerts: ['faiblesse'] }]);
    expect(a.clarify).toEqual(['epaule']);
    expect(a.referral).toBeUndefined();
    // une fois précisée, plus rien à clarifier
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], symptoms: ['inconnu'] }]).clarify).toEqual([]);
    expect(jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], symptoms: ['derobement'] }]).referral).toMatchObject({ level: 'avis' });
  });
  it('réponses précises : elles coexistent ; « je ne sais pas distinguer » est exclusif', () => {
    let l = toggleSymptom([], 'derobement');
    l = toggleSymptom(l, 'douleur_limitante');
    expect(l).toEqual(['derobement', 'douleur_limitante']);
    expect(toggleSymptom(l, 'derobement')).toEqual(['douleur_limitante']);
    expect(toggleSymptom(l, 'inconnu')).toEqual(['inconnu']);
    expect(toggleSymptom(['inconnu'], 'perte_force')).toEqual(['perte_force']);
    const a = jointAdvice([{ zone: 'epaule', side: 'gauche', triggers: [], alerts: [], symptoms: ['derobement', 'douleur_limitante'] }]);
    expect(a.referral?.text).toMatch(/ça se dérobe/);
    expect(a.referral?.text).toMatch(/tu t’arrêtes à cause de la douleur/);
    // incertitude : ni affirmation de symptôme, ni « tout va bien » inventé
    const u = jointAdvice([{ zone: 'epaule', triggers: [], alerts: [], symptoms: ['inconnu'] }]);
    expect(u.referral).toBeUndefined();
    expect(u.clarify).toEqual([]);
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
    // séance lancée à la main (sans lien avec le planning) : elle compte quand même
    expect(r.advice[0]!.reason).toMatch(/aucune séance de force/);
    const r2 = planRuns(items, [], '2026-10-28', { sessionDays: ['2026-10-27'] });
    expect(r2.advice[0]!.reason).toMatch(/1 séance de force déjà faite/);
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

describe('correction datée d’une justification fausse', () => {
  const mk = (note: string, extra = {}): PlannedItem => ({ id: 'x', weekStart: '2026-10-26', day: 5, start: '09:30', durationMin: 30, kind: 'marche', title: 'Marche facile', moves: [], adjustment: { reason: 'deplacement', decision: 'remplacée', at: 1, note }, ...extra });
  it('séance bien faite dans la semaine : correction ajoutée, note d’origine conservée', () => {
    const r = correctReasons([mk('remplace « c » : aucune séance de force encore faite cette semaine, x')], ['2026-10-27'], 5, '2026-10-28');
    expect(r.corrected).toBe(1);
    const adj = r.items[0]!.adjustment!;
    expect(adj.note).toMatch(/aucune séance de force encore faite/);
    expect(adj.corrections![0]!.text).toMatch(/Correction du 28\/10 : la séance de force du 27\/10 était bien comptée/);
    expect(adj.corrections![0]!.text).toMatch(/décision .* reste inchangée/);
  });
  it('une seule correction, et rien si aucune séance n’a eu lieu', () => {
    const once = correctReasons([mk('aucune séance de force encore faite cette semaine')], ['2026-10-27'], 5, '2026-10-28').items;
    expect(correctReasons(once, ['2026-10-27'], 6, '2026-10-29').corrected).toBe(0);
    expect(correctReasons([mk('aucune séance de force encore faite cette semaine')], [], 5, '2026-10-28').corrected).toBe(0);
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
  it('tests maximaux : jamais maintenus sur un mouvement symptomatique, sous-maximaux à 3 en réserve', () => {
    const t = (variantId: string) => ({ variantId, blockId: variantId, role: 'test', targetRir: undefined as number | undefined, lastSetToFailure: undefined as boolean | undefined, cue: 'Max strict' as string | undefined, progression: undefined as string | undefined });
    const out = adaptSets([t('pullup-strict'), t('dips-bars'), t('pushup-standard')], [], ['pullup|chinup']);
    expect(out[0]).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    expect(out[0]!.cue).toMatch(/Pas de test maximal/);
    expect(out[1]).toEqual(t('dips-bars'));
    // geste connu : ses tests ; geste inconnu : tout le haut du corps par prudence ; rien déclaré : rien
    expect(testPatterns([{ zone: 'epaule', triggers: ['dips'], alerts: [] }])).toEqual(['dips']);
    expect(testPatterns([{ zone: 'epaule', triggers: ['inconnu'], alerts: [] }])[0]).toMatch(/pullup.*dips.*pushup/);
    expect(testPatterns([])).toEqual([]);
  });
  it('jamais sous 2 séries ; aucun motif : rien ne change', () => {
    expect(adaptSets([set('dips-weighted', 'b'), set('dips-weighted', 'b')], ['dips'])).toHaveLength(2);
    expect(adaptSets(sets, [], [])).toBe(sets);
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

describe('sortie de course prévue', () => {
  it('la prochaine course du planning fixe la distance ; annulée ou remplacée : ignorée', async () => {
    const { plannedRunKm } = await import('../src/ui/runPlan');
    const mk = (id: string, day: number, km: number, extra: Partial<PlannedItem> = {}): PlannedItem => ({ id, weekStart: '2026-11-02', day, start: '12:30', durationMin: 14, kind: 'course', title: 'c', km, moves: [], ...extra });
    const items = [mk('a', 1, 2), mk('b', 3, 2), mk('c', 6, 2.5, { adjustment: { reason: 'deplacement', decision: 'remplacée', at: 1 } })];
    const repo = { getKv: async () => items } as never;
    expect(await plannedRunKm(repo, '2026-11-03')).toBe(2); // mardi
    expect(await plannedRunKm(repo, '2026-11-04')).toBe(2); // jeudi à venir
    expect(await plannedRunKm(repo, '2026-11-06')).toBeUndefined(); // dimanche remplacé
  });
});
