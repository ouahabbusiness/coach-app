// Ippo — tests du contexte, du prompt, du mode démo et de la protection de la clé API.
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CoachDb, Repository } from '../src/storage/db';
import type { SessionEvent, SessionPlan } from '../src/engine/types';
import { buildCoachContext } from '../src/ippo/context';
import { buildChatTurns, IPPO_SYSTEM, contextPayload } from '../src/ippo/prompt';
import { demoAnswer, welcomeMessage } from '../src/ippo/demo';
import type { IppoMessage } from '../src/ippo/types';
import { localDay } from '../src/engine/derive';
import { deviceTimeZone } from '../src/ui/support';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

let dbn = 0;
const freshRepo = (name?: string) => new Repository(new CoachDb(name ?? `ippo-test-${++dbn}`));

function plan(): SessionPlan {
  const set = (id: string, role: 'warmup' | 'work') => ({
    id,
    exerciseId: 'pullup',
    variantId: 'pullup-weighted',
    blockId: 'b1',
    blockType: 'straight' as const,
    role,
    kind: 'reps' as const,
    targetReps: 6,
    restSeconds: 150,
    loadKg: 20,
  });
  return {
    id: 's1',
    title: 'Force haut du corps',
    source: 'manual',
    sets: [set('p0', 'warmup'), set('p1', 'work'), set('p2', 'work')],
  };
}

function sessionEvents(now: number): SessionEvent[] {
  const base = { sessionId: 's1' };
  return [
    { ...base, id: 'e1', at: now - 3_600_000, type: 'session_started', plan: plan(), timeZone: 'Europe/Brussels' },
    { ...base, id: 'e2', at: now - 3_000_000, type: 'set_started', plannedSetId: 'p1' },
    { ...base, id: 'e3', at: now - 2_900_000, type: 'set_ended', plannedSetId: 'p1' },
    { ...base, id: 'e4', at: now - 2_800_000, type: 'set_result_recorded', plannedSetId: 'p1', result: { reps: 6, loadKg: 20, rir: 2 } },
    { ...base, id: 'e5', at: now - 2_000_000, type: 'set_started', plannedSetId: 'p2' },
    { ...base, id: 'e6', at: now - 1_900_000, type: 'set_ended', plannedSetId: 'p2' },
    { ...base, id: 'e7', at: now - 1_800_000, type: 'set_result_recorded', plannedSetId: 'p2', result: { reps: 5, loadKg: 20 } },
    { ...base, id: 'e8', at: now - 1_700_000, type: 'session_ended' },
  ];
}

async function seeded() {
  const repo = freshRepo();
  const now = Date.now();
  const tz = deviceTimeZone();
  const today = localDay(now, tz);
  const day = (back: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
  };

  await repo.setKv('onboarding', {
    version: 1,
    step: 0,
    updatedAt: now,
    completedAt: now,
    answers: {
      devices: {},
      body: {
        age: { value: 28, status: 'déclaré', at: now },
        heightCm: { value: 184, status: 'déclaré', at: now },
        weightKg: { value: 79.5, status: 'déclaré', at: now },
        waistCm: { value: 85, status: 'mesuré', at: now },
        formulaSex: 'homme',
      },
      history: { pullupsMax: { value: 12, status: 'déclaré' }, pushupsMax: { value: 30, status: 'déclaré' } },
      safety: { pains: 'épaule droite sensible au développé' },
      goal: { main: 'muscle', secondary: ['street_workout'], description: 'Prendre du haut du corps', why: 'Être fier devant le miroir' },
      equipment: { items: ['barre', 'anneaux'] },
      food: { restrictions: 'pas de lactose' },
      schedule: { workDays: [0, 1, 2, 3, 4] },
      sleep: { preferredSlots: ['midi'], sessionsPerWeek: 5 },
      coaching: { tone: 'ferme' },
    },
  });
  await repo.setKv('goals', [
    { version: 1, at: now - 86_400_000, reason: 'objectif initial', main: 'muscle', secondary: ['street_workout'], description: 'Prendre du haut du corps', why: 'Être fier devant le miroir' },
  ]);
  await repo.setKv('weight.log', [0, 2, 4, 9, 11, 13].map((back, i) => ({
    id: `w${i}`,
    day: day(back),
    kg: 79.8 - i * 0.08,
    status: 'mesuré',
    fasting: true,
    at: now - back * 86_400_000,
  })));
  await repo.setKv('program.current', {
    id: 'prog',
    startWeek: '2026-11-09',
    at: now,
    answers: {},
    program: {
      title: 'Bloc force 4 semaines',
      weeks: 4,
      templates: [
        { title: 'Haut A', lines: [1, 2, 3] },
        { title: 'Bas B', lines: [1, 2] },
      ],
      rules: ['2 à 3 min de repos sur les séries lourdes'],
    },
  });
  await repo.setKv(`intake.${today}`, { kcal: 2100, documentedProtein: 140, complete: true });
  await repo.setKv(`daily.${today}`, { sleepH: 7.5, steps: 8200 });
  await repo.setKv(`daily.${day(1)}`, { sleepH: 6.5, steps: 6100 });
  await repo.append(sessionEvents(now));
  return { repo, now, today };
}

describe('contexte Ippo', () => {
  it('lit les données réelles et n’invente rien', async () => {
    const { repo, now, today } = await seeded();
    const ctx = await buildCoachContext(repo, now);
    expect(ctx.day).toBe(today);
    expect(ctx.profile.age).toBe(28);
    expect(ctx.profile.heightCm).toBe(184);
    expect(ctx.profile.weightKg).toBeCloseTo(79.8, 1);
    expect(ctx.profile.weightSource).toBe('pesée');
    expect(ctx.goal?.main).toBe('Développement musculaire');
    expect(ctx.goal?.secondary).toEqual(['Progresser en street workout']);
    expect(ctx.program?.title).toBe('Bloc force 4 semaines');
    expect(ctx.sessions.length).toBe(1);
    expect(ctx.sessions[0]?.workSets).toBe(2);
    expect(ctx.sessions[0]?.doneSets).toBe(2);
    expect(ctx.sessions[0]?.durationMin).toBe(32);
    expect(ctx.nutrition.todayKcal).toBe(2100);
    expect(ctx.nutrition.todayProteinG).toBe(140);
    expect(ctx.nutrition.todayComplete).toBe(true);
    expect(ctx.weight.trend).not.toBe('données insuffisantes');
    expect(ctx.days.find((d) => d.day === today)?.sleepH).toBe(7.5);
    expect(ctx.safety.pains).toContain('épaule');
  });

  it('une donnée absente vaut null et figure dans les manques', async () => {
    const repo = freshRepo();
    const ctx = await buildCoachContext(repo, Date.now());
    expect(ctx.profile.age).toBeNull();
    expect(ctx.profile.weightKg).toBeNull();
    expect(ctx.goal).toBeNull();
    expect(ctx.program).toBeNull();
    expect(ctx.sessions).toEqual([]);
    expect(ctx.nutrition.todayKcal).toBeNull();
    expect(ctx.gaps).toContain('poids non renseigné');
    expect(ctx.gaps).toContain('aucun programme validé');
    expect(ctx.gaps).toContain('aucune séance enregistrée');
  });
});

describe('prompt Ippo', () => {
  it('contient les garde-fous et le contexte, sans clé API', async () => {
    const { repo, now } = await seeded();
    const ctx = await buildCoachContext(repo, now);
    const history: IppoMessage[] = [{ id: 'm1', role: 'user', content: 'Salut', at: now }];
    const turns = buildChatTurns(ctx, 'Analyse ma semaine', history);
    expect(turns[0]?.role).toBe('system');
    expect(turns[0]?.content).toContain(IPPO_SYSTEM);
    expect(turns[0]?.content).toContain('CONTEXTE');
    expect(turns[0]?.content).toContain('épaule droite');
    expect(turns.at(-1)).toEqual({ role: 'user', content: 'Analyse ma semaine' });
    expect(turns.map((t) => t.content).join(' ')).not.toMatch(/sk-[a-z0-9]/i);
  });

  it('sérialise null pour une donnée inconnue, jamais 0', async () => {
    const repo = freshRepo();
    const ctx = await buildCoachContext(repo, Date.now());
    const payload = contextPayload(ctx);
    expect(payload).toContain('"age":null');
    expect(payload).toContain('"weightKg":null');
    expect(payload).not.toContain('"age":0');
  });
});

describe('mode démo', () => {
  it('annonce la démo et reste prudent sur la douleur', async () => {
    const { repo, now } = await seeded();
    const ctx = await buildCoachContext(repo, now);
    const answer = demoAnswer('J’ai mal à l’épaule, je m’entraîne ?', ctx);
    expect(answer.toLowerCase()).toContain('mode démo');
    expect(answer.toLowerCase()).toContain('professionnel de santé');
    expect(answer).not.toContain('diagnostic :');
  });

  it('le message d’accueil reprend les données réelles', async () => {
    const { repo, now } = await seeded();
    const ctx = await buildCoachContext(repo, now);
    const hello = welcomeMessage(ctx);
    expect(hello).toContain('Ippo');
    expect(hello).toContain('kg');
  });
});

describe('clé API locale', () => {
  it('n’est jamais exportée et n’est jamais importée', async () => {
    const repo = freshRepo();
    await repo.setKv('ippo.config', { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'sk-secret-1234567890' });
    const dump = await repo.exportAll();
    const row = dump.kv.find((r) => r.key === 'ippo.config');
    expect(row).toBeTruthy();
    expect((row?.value as { apiKey: string }).apiKey).toBe('');

    await repo.setKv('ippo.config', { baseUrl: 'https://x', model: 'm', apiKey: 'sk-local-1234567890' });
    await repo.importAll({
      format: 'coach-app-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      events: [],
      kv: [{ key: 'ippo.config', value: { baseUrl: 'https://y', model: 'm2', apiKey: 'sk-other-1234567890' }, updatedAt: Date.now() + 10_000 }],
    });
    const kept = await repo.getKv<{ apiKey: string }>('ippo.config');
    expect(kept?.apiKey).toBe('sk-local-1234567890');
  });
});
