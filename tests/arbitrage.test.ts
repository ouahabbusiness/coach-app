// Arbitrage des prescriptions et liaison symptômes → prochaine séance (données de test fictives, base simulée).
// Une seule prescription finale, avec toutes les raisons pertinentes ; aucune règle ne fait disparaître une contrainte de symptôme.
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { toleranceHistory, toleranceOf, type JointFeedback } from '../src/engine/tolerance';
import { DELOAD } from '../src/engine/stagnation';
import { decide, project } from '../src/engine/session';
import { CoachDb, Repository } from '../src/storage/db';
import { jointGuard, startSessionFromTemplate } from '../src/ui/actions';
import { saveFeedback } from '../src/ui/JointFeedback';
import { refreshTripAdaptation } from '../src/ui/programMigration';
import { loadTolerance } from '../src/ui/toleranceContext';
import type { PlannedItem } from '../src/engine/planning';
import type { SessionCommand } from '../src/engine/types';
import type { SessionTemplate } from '../src/ui/templates';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28, 12);
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const session = (id: string, variantId: string, over: { pain?: { plannedSetId?: string }[] } = {}) => ({
  sessionId: id,
  startedAt: NOW - 2 * DAY,
  pain: over.pain ?? [],
  sets: [{ planned: { id: `${id}-s`, variantId, role: 'work' }, status: 'done' }],
});
const hist = (sessions: ReturnType<typeof session>[], fb: Record<string, JointFeedback> = {}, readinessPain: Record<string, string> = {}) => toleranceHistory(sessions, fb, NOW, dayOf, 28, readinessPain);
const ctxOf = (h: ReturnType<typeof hist>) => ({ triggerPatterns: [], ...h });

describe('une gêne globale n’est jamais attribuée à chaque exercice', () => {
  const two = [{ ...session('s1', 'kb-row-1arm'), sets: [{ planned: { id: 'a', variantId: 'kb-row-1arm', role: 'work' }, status: 'done' }, { planned: { id: 'b', variantId: 'pushup-diamond', role: 'work' }, status: 'done' }] }];

  it('gêne marquée sans mouvement désigné : « non identifié » pour tous, aucun « signalé », aucun « toléré »', () => {
    const h = hist(two, { s1: { during: 'marquee' } });
    expect(toleranceOf('kb-row-1arm', ctxOf(h))).toBe('non_localisee');
    expect(toleranceOf('pushup-diamond', ctxOf(h))).toBe('non_localisee');
    expect(h.flagged.size + h.confirmed.size).toBe(0);
    // « je ne sais pas » répondu explicitement : même statut
    expect(toleranceOf('pushup-diamond', ctxOf(hist(two, { s1: { during: 'marquee', moves: [], movesAnswered: true } })))).toBe('non_localisee');
  });
  it('mouvement désigné : seul celui-ci est « signalé » ; l’autre n’est pas confirmé pour autant', () => {
    const h = hist(two, { s1: { next: 'dure', moves: ['pushup-diamond'], movesAnswered: true } });
    expect(toleranceOf('pushup-diamond', ctxOf(h))).toBe('signalee');
    expect(toleranceOf('kb-row-1arm', ctxOf(h))).toBe('inconnue');
  });
  it('« aucune gêne » + « rien » : confirme (réponse négative universelle) ; sans réponse : rien n’est supposé, ni symptôme ni absence', () => {
    expect(toleranceOf('kb-row-1arm', ctxOf(hist(two, { s1: { during: 'aucune', next: 'rien' } })))).toBe('toleree');
    expect(toleranceOf('kb-row-1arm', ctxOf(hist(two)))).toBe('inconnue');
  });
  it('contrôle avant séance : douleur nouvelle ou aggravée = non identifiée et rien n’est confirmé ; absence de réponse = aucun effet', () => {
    const fb = { s1: { during: 'aucune' as const, next: 'rien' as const } };
    expect(toleranceOf('kb-row-1arm', ctxOf(hist(two, fb, { s1: 'nouvelle' })))).toBe('non_localisee');
    expect(toleranceOf('kb-row-1arm', ctxOf(hist(two, fb, { s1: 'aggravée' })))).toBe('non_localisee');
    expect(toleranceOf('kb-row-1arm', ctxOf(hist(two, fb, { s1: 'aucune' })))).toBe('toleree');
    expect(toleranceOf('kb-row-1arm', ctxOf(hist(two, fb, {})))).toBe('toleree');
  });
  it('une séance sans réponse ne révoque pas une confirmation et n’efface pas une gêne signalée', () => {
    const older = { ...session('old', 'kb-row-1arm'), startedAt: NOW - 6 * DAY };
    const newer = { ...session('new', 'kb-row-1arm'), startedAt: NOW - DAY };
    expect(toleranceOf('kb-row-1arm', ctxOf(hist([older, newer], { old: { during: 'aucune', next: 'rien' } })))).toBe('toleree');
    expect(toleranceOf('kb-row-1arm', ctxOf(hist([older, newer], { old: { next: 'dure', moves: ['kb-row-1arm'], movesAnswered: true } })))).toBe('signalee');
  });
});

let n = 0;
async function run(repo: Repository, sessionId: string, cmd: SessionCommand) {
  const st = project(await repo.sessionEvents(sessionId));
  const res = decide(st, cmd, { now: Date.now() + n * 1000, newId: () => `a${++n}`, sessionId });
  if (!res.ok) throw new Error(`${cmd.type}: ${res.error}`);
  await repo.append(res.events);
}
async function perform(repo: Repository, id: string, variantId: string, reps: number, rir: number) {
  for (const s of project(await repo.sessionEvents(id))!.sets.filter((x) => x.planned.variantId === variantId)) {
    await run(repo, id, { type: 'start_set', plannedSetId: s.planned.id });
    await run(repo, id, { type: 'end_set', plannedSetId: s.planned.id });
    await run(repo, id, { type: 'record_result', plannedSetId: s.planned.id, result: { reps, rir, loadKg: s.planned.loadKg } });
  }
}

const row = { id: 'r', variantId: 'kb-row-1arm', kind: 'reps' as const, role: 'work' as const, sets: 3, restSeconds: 75, repRange: [10, 15] as [number, number], targetReps: 10, targetRir: 2, loadKg: 6 };
const dips = { id: 'd', variantId: 'dips-weighted', kind: 'reps' as const, role: 'work' as const, sets: 3, restSeconds: 150, repRange: [5, 8] as [number, number], targetReps: 5, targetRir: 2, loadKg: 5 };
const tplA: SessionTemplate = { id: 'prog-A', title: 'A', updatedAt: 0, lines: [row, dips] };

const summary = async (repo: Repository, id: string) =>
  project(await repo.sessionEvents(id))!.sets.map((s) => `${s.planned.variantId}|${s.planned.loadKg ?? '-'}|RIR${s.planned.targetRir ?? '-'}|${s.planned.progression ?? ''}`);

async function seed(repo: Repository) {
  await repo.setKv('profile.complement', { joints: [{ zone: 'epaule', triggers: ['tractions', 'dips'], alerts: [] }] });
  await repo.setKv('joint.adapt', { patterns: ['pullup|chinup', 'dips'], tests: ['pullup|chinup', 'dips'], at: 1 });
  await repo.setKv('agenda.trips', [{ id: 't', from: '2099-11-03', to: '2099-11-10', label: 'France', equipment: ['tapis', 'banc'] }]);
}

describe('le gel dépend de l’état du mouvement, pas de son nom', () => {
  it('rowing : gelé tant que la tolérance n’est pas confirmée, libre une fois confirmée ; aucune gêne déclarée : jamais gelé', async () => {
    const repo = new Repository(new CoachDb('arbitrage-guard'));
    expect(await jointGuard(repo, 'kb-row-1arm')).toBe(false); // aucune gêne déclarée
    await seed(repo);
    expect(await jointGuard(repo, 'kb-row-1arm')).toBe(true); // déclarée, tolérance inconnue
    expect(await jointGuard(repo, 'lunge-reverse')).toBe(false); // jambes : non concernées
    const id = await startSessionFromTemplate(repo, { ...tplA, lines: [row] });
    await perform(repo, id, 'kb-row-1arm', 12, 3);
    await run(repo, id, { type: 'end_session' });
    await saveFeedback(repo, id, { during: 'aucune', next: 'rien' });
    expect(await jointGuard(repo, 'kb-row-1arm')).toBe(false); // confirmée par tes deux réponses
    await saveFeedback(repo, id, { next: 'dure', moves: [], movesAnswered: true });
    expect(await jointGuard(repo, 'kb-row-1arm')).toBe(true); // gêne non identifiée : gelé de nouveau
  });
});

describe('séjour : l’adaptation est recalculée au lancement d’après les symptômes et le matériel actuels', () => {
  const item = (adapted: PlannedItem['adapted'], adjustment: PlannedItem['adjustment']): PlannedItem => ({ id: 'i', weekStart: '2099-11-02', day: 1, start: '18:15', durationMin: 40, kind: 'seance', title: 'A', templateId: 'prog-A', moves: [], adapted, adjustment });
  it('adaptation de séjour périmée (dips sur banc) → remplacée ; version courte : conservée telle quelle', async () => {
    const repo = new Repository(new CoachDb('arbitrage-trip'));
    await seed(repo);
    const stale = { lines: [{ ...dips, variantId: 'dips-bench', id: 'x' }], estimatedMin: 5, removed: ['Dips lestés → Dips sur banc'] };
    const fresh = await refreshTripAdaptation(repo, item(stale as never, { reason: 'deplacement', decision: 'adaptée', at: 1, note: 'France' }), tplA);
    expect(fresh!.lines.map((l) => l.variantId)).toEqual(['pushup-diamond']);
    expect(fresh!.removed.join(' ')).toMatch(/Rowing kettlebell un bras : retiré \(matériel absent\)/);
    expect(fresh!.removed.join(' ')).toMatch(/\(tolérance inconnue\)/);
    // une adaptation qui n'est pas celle d'un séjour (version courte) n'est pas recalculée
    const short = { lines: [{ ...row, id: 'y' }], estimatedMin: 9, removed: [] };
    expect(await refreshTripAdaptation(repo, item(short as never, { reason: 'retard', decision: 'adaptée', at: 1 }), tplA)).toBe(short);
  });
});

describe('parcours complet : réussite → gêne le lendemain → phase allégée → matériel différent → prescription finale → redémarrage', () => {
  it('une seule prescription finale, toutes les raisons visibles, identique après redémarrage', async () => {
    const NAME = 'arbitrage-e2e';
    const repo = new Repository(new CoachDb(NAME));
    await seed(repo);

    // S0 : rowing adapté au départ (tolérance inconnue), puis réponses explicites : aucune gêne après la séance et le lendemain.
    const s0 = await startSessionFromTemplate(repo, { ...tplA, lines: [row] });
    expect(project(await repo.sessionEvents(s0))!.sets).toHaveLength(2); // prudence de départ : une série de moins
    await perform(repo, s0, 'kb-row-1arm', 12, 3);
    await run(repo, s0, { type: 'end_session' });
    await saveFeedback(repo, s0, { during: 'aucune', next: 'rien' });

    // S1 : tolérance confirmée → prescription normale ; haut de plage à 2 en réserve (réussite autorisant une hausse).
    const s1 = await startSessionFromTemplate(repo, { ...tplA, lines: [row] });
    const sets1 = project(await repo.sessionEvents(s1))!.sets;
    expect(sets1).toHaveLength(3);
    expect(sets1[0]!.planned).toMatchObject({ targetRir: 2, loadKg: 6 });
    await perform(repo, s1, 'kb-row-1arm', 15, 2);
    await run(repo, s1, { type: 'end_session' });

    // La hausse est bien autorisée à ce stade.
    const up = await startSessionFromTemplate(repo, { ...tplA, lines: [row] });
    expect(project(await repo.sessionEvents(up))!.sets.some((s) => (s.planned.loadKg ?? 0) > 6)).toBe(true);

    // Gêne le lendemain, mouvement non identifié.
    await saveFeedback(repo, s1, { next: 'dure', nextAt: 5 });
    expect((await loadTolerance(repo)).ctx.unlocated.has('kb-row-1arm')).toBe(true);

    // Lancement suivant : plus de hausse, prudence, raison lisible.
    const afterSymptom = await startSessionFromTemplate(repo, { ...tplA, lines: [row] });
    const sym = project(await repo.sessionEvents(afterSymptom))!.sets;
    expect(sym.every((s) => (s.planned.loadKg ?? 6) === 6)).toBe(true);
    expect(sym[0]!.planned).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    expect(sym).toHaveLength(2);
    expect(sym[0]!.planned.progression).toMatch(/Adaptée à ta gêne/);

    // Phase allégée validée : elle se COMBINE avec les contraintes de symptômes, elle ne les écrase pas.
    await repo.setKv(DELOAD, { from: '2000-01-01', to: '2099-12-31', reason: 'test', status: 'active' });
    const deload = await startSessionFromTemplate(repo, { ...tplA, lines: [row] });
    const dl = project(await repo.sessionEvents(deload))!.sets;
    expect(dl).toHaveLength(2); // 60 % de 3 séries, et la contrainte de gêne ne retire pas sous 2
    expect(dl[0]!.planned).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    expect(dl[0]!.planned.progression).toMatch(/Phase allégée/);
    expect(dl[0]!.planned.progression).toMatch(/Adaptée à ta gêne/);

    // Matériel différent (séjour : tapis + banc) : recalcul d'après les symptômes actuels, puis phase allégée + gêne.
    const planned: PlannedItem = { id: 'i', weekStart: '2099-11-02', day: 1, start: '18:15', durationMin: 40, kind: 'seance', title: 'A', templateId: 'prog-A', moves: [], adapted: { lines: [], estimatedMin: 1, removed: [] }, adjustment: { reason: 'deplacement', decision: 'adaptée', at: 1, note: 'France' } };
    const adapted = (await refreshTripAdaptation(repo, planned, tplA))!;
    const trip = await startSessionFromTemplate(repo, { ...tplA, lines: adapted.lines as SessionTemplate['lines'] });
    const final = project(await repo.sessionEvents(trip))!.sets;
    expect(final.map((s) => s.planned.variantId)).toEqual(['pushup-diamond', 'pushup-diamond']);
    expect(final.some((s) => /dips-bench/.test(s.planned.variantId))).toBe(false);
    expect(final[0]!.planned).toMatchObject({ targetRir: 3, lastSetToFailure: false });
    expect(final[0]!.planned.progression).toMatch(/Phase allégée.*Adaptée à ta gêne/);

    // Redémarrage : mêmes données, mêmes prescriptions.
    const before = [await summary(repo, afterSymptom), await summary(repo, deload), await summary(repo, trip)];
    const restarted = new Repository(new CoachDb(NAME));
    const again = await startSessionFromTemplate(restarted, { ...tplA, lines: [row] });
    expect(await summary(restarted, again)).toEqual(before[1]);
    expect((await loadTolerance(restarted)).ctx.unlocated.has('kb-row-1arm')).toBe(true);
    expect([await summary(restarted, afterSymptom), await summary(restarted, deload), await summary(restarted, trip)]).toEqual(before);
  });
});
