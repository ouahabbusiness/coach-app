// Tolérance des mouvements, retours explicites, passage sans pénalité et séances de voyage (données de test fictives, base simulée).
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { emptyToleranceContext, isUpperLoaded, toleranceDetail, toleranceHistory, toleranceOf, type JointFeedback, type ToleranceContext } from '../src/engine/tolerance';
import { adaptToEquipment } from '../src/engine/trip';
import { decide, project } from '../src/engine/session';
import { sessionOutcome } from '../src/engine/derive';
import { CoachDb, Repository } from '../src/storage/db';
import { refitTripSessions } from '../src/ui/programMigration';
import { COACH_REMOVED, startSessionFromTemplate } from '../src/ui/actions';
import { loadTolerance } from '../src/ui/toleranceContext';
import { saveFeedback } from '../src/ui/JointFeedback';
import type { PlannedItem } from '../src/engine/planning';
import type { SessionCommand } from '../src/engine/types';
import type { SessionTemplate } from '../src/ui/templates';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const ctx = (over: Partial<ToleranceContext> = {}): ToleranceContext => ({ ...emptyToleranceContext(), triggerPatterns: ['pullup|chinup', 'dips'], ...over });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28, 12);
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

describe('tolérance d’un mouvement : une réponse explicite n’est pas une information manquante', () => {
  it('quatre états ; jambes et abdos non concernés', () => {
    expect(toleranceOf('pullup-strict', ctx())).toBe('declencheur');
    expect(toleranceOf('dips-bench', ctx())).toBe('declencheur');
    expect(toleranceOf('pike-pushup', ctx({ flagged: new Set(['pike-pushup']) }))).toBe('signalee');
    expect(toleranceOf('kb-row-1arm', ctx({ confirmed: new Set(['kb-row-1arm']) }))).toBe('toleree');
    expect(toleranceOf('pushup-diamond', ctx())).toBe('inconnue');
    expect(toleranceOf('lunge-reverse', ctx())).toBeUndefined();
    expect(isUpperLoaded('hollow-hold')).toBe(false);
  });

  const session = (id: string, daysAgo: number, variantId: string, pain = false) => ({
    sessionId: id,
    startedAt: NOW - daysAgo * DAY,
    pain: pain ? [{ plannedSetId: `${id}-s` }] : [],
    sets: [{ planned: { id: `${id}-s`, variantId, role: 'work' }, status: 'done' }],
  });
  const hist = (sessions: ReturnType<typeof session>[], fb: Record<string, JointFeedback> = {}) => toleranceHistory(sessions, fb, NOW, dayOf);

  it('réalisé sans gêne déclarée, sans retour : « tolérance inconnue » ne disparaît pas, la date est indiquée', () => {
    const h = hist([session('s1', 1, 'pike-pushup')]);
    expect(h.confirmed.size).toBe(0);
    expect(h.realised.get('pike-pushup')).toBe('2026-10-27');
    const c = ctx(h);
    expect(toleranceOf('pike-pushup', c)).toBe('inconnue');
    expect(toleranceDetail('pike-pushup', c)).toMatch(/réalisé le 27\/10 sans gêne déclarée · retour après séance et lendemain à compléter/);
  });
  it('« toléré » seulement avec « aucune gêne » après la séance ET « rien » le lendemain', () => {
    const s = session('s1', 2, 'kb-row-1arm');
    expect(hist([s], { s1: { during: 'aucune' } }).confirmed.size).toBe(0);
    expect(hist([s], { s1: { next: 'rien' } }).confirmed.size).toBe(0);
    expect(hist([s], { s1: { during: 'aucune', next: 'rien' } }).confirmed.has('kb-row-1arm')).toBe(true);
  });
  it('gêne marquée, gêne qui dure ou douleur signalée en séance : « gêne signalée »', () => {
    expect(hist([session('s1', 2, 'pushup-diamond')], { s1: { during: 'marquee' } }).flagged.has('pushup-diamond')).toBe(true);
    expect(hist([session('s1', 2, 'pushup-diamond')], { s1: { during: 'aucune', next: 'dure' } }).flagged.has('pushup-diamond')).toBe(true);
    expect(hist([session('s1', 2, 'pushup-diamond', true)]).flagged.has('pushup-diamond')).toBe(true);
    // une gêne légère n'est ni une confirmation ni un signal : le mouvement reste inconnu
    const h = hist([session('s1', 2, 'pushup-diamond')], { s1: { during: 'legere', next: 'legere' } });
    expect(h.confirmed.size + h.flagged.size).toBe(0);
  });
  it('la séance la plus récente fait foi ; au-delà de 28 jours, plus rien n’est supposé', () => {
    const old = session('old', 10, 'kb-press-1arm');
    const recent = session('recent', 2, 'kb-press-1arm');
    expect(hist([old, recent], { old: { during: 'marquee' }, recent: { during: 'aucune', next: 'rien' } }).confirmed.has('kb-press-1arm')).toBe(true);
    expect(hist([session('vieux', 40, 'kb-press-1arm')], { vieux: { during: 'aucune', next: 'rien' } }).confirmed.size).toBe(0);
  });
  it('enregistrement explicite du retour : après la séance puis le lendemain, sans écraser le premier', async () => {
    const repo = new Repository(new CoachDb('tolerance-feedback'));
    await saveFeedback(repo, 'sX', { during: 'aucune', duringAt: 1 });
    expect(await saveFeedback(repo, 'sX', { next: 'rien', nextAt: 2 })).toEqual({ during: 'aucune', duringAt: 1, next: 'rien', nextAt: 2 });
  });
});

describe('séjour : jamais de remplaçant « déclencheur » ni « gêne signalée », tolérance annoncée', () => {
  const dips = { variantId: 'dips-weighted', kind: 'reps' as const, role: 'work' as const, sets: 3, restSeconds: 150 };
  const opts = { avoid: (id: string) => ['declencheur', 'signalee'].includes(toleranceOf(id, ctx()) ?? ''), note: (id: string) => toleranceDetail(id, ctx()) };
  it('sans règle : dips lestés → dips sur banc (ancien comportement)', () => {
    expect(adaptToEquipment([dips], ['tapis', 'banc']).lines[0]!.variantId).toBe('dips-bench');
  });
  it('avec ta gêne : pas de dips sur banc ; remplaçant annoncé « tolérance inconnue »', () => {
    const a = adaptToEquipment([dips], ['tapis', 'banc'], opts);
    expect(a.lines[0]!.variantId).toBe('pushup-diamond');
    expect(a.removed.join(' ')).toMatch(/\(tolérance inconnue\)/);
  });
  it('seul remplaçant possible = déclencheur : retiré et dit, jamais imposé', () => {
    const a = adaptToEquipment([{ ...dips, variantId: 'dips-bars' }], ['tapis', 'banc'], { avoid: (id) => id === 'dips-bench' || id === 'pushup-diamond' });
    expect(a.lines).toHaveLength(0);
    expect(a.removed.join(' ')).toMatch(/geste déclencheur : à choisir avec toi/);
  });
});

describe('séances de voyage déjà adaptées : refaites une fois, seulement dans le séjour', () => {
  const line = (variantId: string, sets = 3) => ({ id: variantId, variantId, kind: 'reps' as const, role: 'work' as const, sets, restSeconds: 75 });
  const tpl = (id: string, lines: ReturnType<typeof line>[]): SessionTemplate => ({ id, title: id, updatedAt: 0, lines });
  const item = (id: string, weekStart: string, day: number, templateId: string, extra: Partial<PlannedItem> = {}): PlannedItem => ({ id, weekStart, day, start: '18:15', durationMin: 40, kind: 'seance', title: id, templateId, moves: [], adapted: { lines: [], estimatedMin: 1, removed: ['ancien'] }, adjustment: { reason: 'deplacement', decision: 'adaptée', at: 1, note: 'France' }, ...extra });

  it('séjour 3 → 10 : le mardi 3 est refait, le lundi 26 (avant le séjour) ne l’est pas', async () => {
    const repo = new Repository(new CoachDb('tolerance-refit'));
    await repo.setKv('templates', [tpl('prog-A', [line('dips-weighted'), line('lunge-reverse')])]);
    await repo.setKv('agenda.trips', [{ id: 't', from: '2099-11-03', to: '2099-11-10', label: 'France', equipment: ['tapis', 'banc'] }]);
    await repo.setKv('profile.complement', { joints: [{ zone: 'coudes', triggers: ['dips'], alerts: [] }] });
    await repo.setKv('planning.items', [item('lundi-26', '2099-10-26', 0, 'prog-A', { adapted: undefined, adjustment: undefined }), item('mardi-3', '2099-11-02', 1, 'prog-A')]);
    expect(await refitTripSessions(repo)).toBe(1);
    const items = (await repo.getKv<PlannedItem[]>('planning.items'))!;
    expect(items.find((x) => x.id === 'mardi-3')!.adapted!.lines.map((l) => l.variantId)).toEqual(['pushup-diamond', 'lunge-reverse']);
    expect(items.find((x) => x.id === 'mardi-3')!.adapted!.removed.join(' ')).toMatch(/tolérance inconnue/);
    expect(items.find((x) => x.id === 'lundi-26')!.adapted).toBeUndefined();
    expect(await refitTripSessions(repo)).toBe(0);
  });
});

let n = 0;
async function run(repo: Repository, sessionId: string, cmd: SessionCommand) {
  const st = project(await repo.sessionEvents(sessionId));
  const res = decide(st, cmd, { now: Date.now() + n * 1000, newId: () => `t${++n}`, sessionId });
  if (!res.ok) throw new Error(`${cmd.type}: ${res.error}`);
  await repo.append(res.events);
}

const tplC: SessionTemplate = {
  id: 'C',
  title: 'C',
  updatedAt: 0,
  lines: [
    { id: 'a', variantId: 'pike-pushup', kind: 'reps', role: 'work', sets: 3, restSeconds: 75, repRange: [10, 15], targetReps: 10, targetRir: 2 },
    { id: 'b', variantId: 'lunge-reverse', kind: 'reps', role: 'work', sets: 3, restSeconds: 75, repRange: [10, 15], targetReps: 10, targetRir: 2 },
  ],
};

describe('au lancement : prudence tant que le mouvement n’est pas confirmé par tes réponses', () => {
  it('jamais fait : une série de moins et marge de 3 ; fait sans retour : toujours prudent ; confirmé par tes réponses : prescription normale', async () => {
    const repo = new Repository(new CoachDb('tolerance-launch'));
    await repo.setKv('profile.complement', { joints: [{ zone: 'epaule', triggers: ['dips'], alerts: [] }] });
    await repo.setKv('joint.adapt', { patterns: ['dips'], tests: ['dips'], at: 1 });
    const first = await startSessionFromTemplate(repo, tplC);
    const st1 = project(await repo.sessionEvents(first))!;
    const pike = st1.sets.filter((s) => s.planned.variantId === 'pike-pushup');
    expect(pike).toHaveLength(2);
    expect(pike[0]!.planned).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    expect(st1.sets.filter((s) => s.planned.variantId === 'lunge-reverse')).toHaveLength(3); // jambes non concernées
    // il fait les deux séries : « réalisé une fois sans gêne déclarée », mais pas de retour explicite
    for (const s of pike) {
      await run(repo, first, { type: 'start_set', plannedSetId: s.planned.id });
      await run(repo, first, { type: 'end_set', plannedSetId: s.planned.id });
    }
    const second = project(await repo.sessionEvents(await startSessionFromTemplate(repo, tplC)))!;
    expect(second.sets.filter((s) => s.planned.variantId === 'pike-pushup')).toHaveLength(2); // toujours prudent
    expect((await loadTolerance(repo)).ctx.realised.has('pike-pushup')).toBe(true);
    // retour explicite après la séance ET le lendemain : prescription normale
    await saveFeedback(repo, first, { during: 'aucune', duringAt: 1, next: 'rien', nextAt: 2 });
    const third = project(await repo.sessionEvents(await startSessionFromTemplate(repo, tplC)))!;
    expect(third.sets.filter((s) => s.planned.variantId === 'pike-pushup')).toHaveLength(3);
  });
});

describe('passer un mouvement sans pénalité', () => {
  const finish = async (name: string, reasonOfPike: string, doOthers = true) => {
    const repo = new Repository(new CoachDb(name));
    const id = await startSessionFromTemplate(repo, { ...tplC, lines: tplC.lines.map((l) => ({ ...l, sets: 2 })) });
    const st = project(await repo.sessionEvents(id))!;
    for (const s of st.sets) {
      if (s.planned.variantId === 'pike-pushup') await run(repo, id, { type: 'skip_set', plannedSetId: s.planned.id, reason: reasonOfPike });
      else if (doOthers) {
        await run(repo, id, { type: 'start_set', plannedSetId: s.planned.id });
        await run(repo, id, { type: 'end_set', plannedSetId: s.planned.id });
      }
    }
    await run(repo, id, { type: 'end_session' });
    return project(await repo.sessionEvents(id))!;
  };
  it('« Passé : tolérance inconnue » : séance complète, mouvement jamais compté comme réalisé', async () => {
    const st = await finish('skip-safe', 'Passé : tolérance inconnue');
    expect(sessionOutcome(st)).toBe('completed');
    expect(st.sets.filter((s) => s.planned.variantId === 'pike-pushup').every((s) => s.status === 'skipped')).toBe(true);
    expect(COACH_REMOVED.test('Passé : tolérance inconnue')).toBe(true); // exclu des séries demandées : pas un échec
  });
  it('les autres raisons restent « partielles » ; rien de fait = jamais « complète »', async () => {
    expect(sessionOutcome(await finish('skip-time', 'Manque de temps'))).toBe('partial');
    expect(sessionOutcome(await finish('skip-all', 'Passé : tolérance inconnue', false))).toBe('partial');
  });
});

describe('tests : tolérance non confirmée = série sous-maximale, passage possible sans pénalité', () => {
  const tplT: SessionTemplate = { id: 'T', title: 'Re-test', updatedAt: 0, lines: [{ id: 't1', variantId: 'pushup-standard', kind: 'reps', role: 'test', sets: 1, restSeconds: 180, cue: 'Max, poitrine au sol' }] };
  const tplW: SessionTemplate = { id: 'W', title: 'W', updatedAt: 0, lines: [{ id: 'w1', variantId: 'pushup-standard', kind: 'reps', role: 'work', sets: 1, restSeconds: 75, repRange: [10, 15], targetReps: 10, targetRir: 2 }] };
  it('pompes jamais déclarées gênantes mais non confirmées : le maximum n’est pas maintenu ; confirmées par tes réponses : il le redevient', async () => {
    const repo = new Repository(new CoachDb('tolerance-tests'));
    await repo.setKv('profile.complement', { joints: [{ zone: 'epaule', triggers: ['tractions'], alerts: [] }] });
    await repo.setKv('joint.adapt', { patterns: ['pullup|chinup'], tests: ['pullup|chinup'], at: 1 });
    const sub = project(await repo.sessionEvents(await startSessionFromTemplate(repo, tplT)))!.sets[0]!.planned;
    expect(sub).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    expect(sub.cue).toMatch(/passe ce test \(aucune pénalité\)/);
    // une séance de pompes faite, avec retours explicites après la séance et le lendemain
    const id = await startSessionFromTemplate(repo, tplW);
    const set = project(await repo.sessionEvents(id))!.sets[0]!;
    await run(repo, id, { type: 'start_set', plannedSetId: set.planned.id });
    await run(repo, id, { type: 'end_set', plannedSetId: set.planned.id });
    await saveFeedback(repo, id, { during: 'aucune', next: 'rien' });
    const max = project(await repo.sessionEvents(await startSessionFromTemplate(repo, tplT)))!.sets[0]!.planned;
    expect(max.cue).toBe('Max, poitrine au sol');
    expect(max.targetRir).toBeUndefined();
  });
});
