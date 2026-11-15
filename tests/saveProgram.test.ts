// Enregistrement d'un programme généré : modèles + planning + programme courant.
import 'fake-indexeddb/auto';
// @ts-ignore -- module Node disponible pendant les tests (types Node non installés)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CoachDb, Repository } from '../src/storage/db';
import { buildProgram, type ProgramAnswers } from '../src/engine/programBuilder';
import { saveProgram, type SavedProgramRow } from '../src/ui/saveProgram';
import { loadTemplates } from '../src/ui/templates';
import { loadPlanning } from '../src/ui/Planning';
import { localDay } from '../src/engine/derive';
import { weekStart } from '../src/engine/challenge';
import { shiftWeek } from '../src/engine/planning';
import { deviceTimeZone } from '../src/ui/support';
import { loadRecurring } from '../src/ui/agenda';
import { saveOwned } from '../src/ui/equipment';
import { DEFAULT_OWNED } from '../src/engine/gear';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const boxingAnswers: ProgramAnswers = {
  pains: [],
  priority: 'muscle',
  days: 3,
  minutes: 45,
  slot: 'midi',
  sleepH: 7.5,
  quitReason: 'temps',
  style: 'boxe',
  boxingPerWeek: 2,
  boxingDays: [1, 3],
  boxingPlace: 'club',
};

const answers: ProgramAnswers = {
  pains: [],
  priority: 'muscle',
  days: 3,
  minutes: 45,
  slot: 'midi',
  sleepH: 7.5,
  quitReason: 'temps',
};

describe('saveProgram', () => {
  it('installe le programme, ses modèles et le planning de la semaine suivante', async () => {
    const repo = new Repository(new CoachDb(`save-program-${Date.now()}`));
    const program = buildProgram(answers, [5, 6, 12], [6, 12], []);
    const result = await saveProgram(repo, program, answers);

    const saved = await repo.getKv<SavedProgramRow>('program.current');
    expect(saved?.id).toBe(result.id);
    expect(saved?.program.title).toBe(program.title);

    const templates = await loadTemplates(repo);
    const prog = templates.filter((t) => t.id.startsWith('prog-'));
    expect(prog.length).toBe(program.templates.length);
    expect(prog.every((t) => t.lines.length > 0)).toBe(true);

    const planning = await loadPlanning(repo);
    expect(planning.length).toBeGreaterThan(0);
    expect(planning.every((i) => i.programId === result.id)).toBe(true);

    const today = localDay(Date.now(), deviceTimeZone());
    expect(result.startWeek).toBe(shiftWeek(weekStart(today), 1));
  });
});

describe('boxe dans le programme', () => {
  it('ajoute la boxe comme engagement récurrent et une règle de récupération', async () => {
    const repo = new Repository(new CoachDb(`save-boxing-${Date.now()}`));
    const program = buildProgram(boxingAnswers, [5, 6, 12], [6, 12], []);
    await saveProgram(repo, program, boxingAnswers);

    const recurring = await loadRecurring(repo);
    const boxe = recurring.find((e) => e.id === 'boxe');
    expect(boxe?.days).toEqual([1, 3]);
    expect(boxe?.label).toBe('Boxe (club)');

    const saved = await repo.getKv<SavedProgramRow>('program.current');
    expect(saved?.program.rules[0]).toContain('Boxe 2×/semaine');
    expect(saved?.program.rules[0]).toContain('48 h');
  });
});

describe('camp fessiers évités + boxe maison', () => {
  it('remplace la séance jambes, ajoute le conditionnement et les règles', async () => {
    const repo = new Repository(new CoachDb(`save-camp-${Date.now()}`));
    await saveOwned(repo, [...DEFAULT_OWNED, 'corde à sauter', 'sac de frappe']);
    const campAnswers: ProgramAnswers = {
      pains: [],
      priority: 'seche',
      style: 'boxe',
      boxingPerWeek: 2,
      boxingDays: [1, 3],
      boxingPlace: 'maison',
      flatGlutes: true,
      weeks: 8,
      days: 3,
      minutes: 60,
      rope: true,
      sleepH: 7.5,
      quitReason: 'motivation',
    };
    const program = buildProgram(campAnswers, [5, 6, 12], [6, 12], []);
    await saveProgram(repo, program, campAnswers);

    const templates = await loadTemplates(repo);
    const legs = templates.find((t) => t.id === 'prog-B');
    expect(legs?.lines.map((l) => l.variantId)).toEqual(['sissy-squat-bw', 'nordic-curl-bw', 'hollow-hold']);
    expect(legs?.lines.some((l) => /squat-goblet|kb-rdl|kb-swing|split-squat|glute-bridge/.test(l.variantId))).toBe(false);

    const cond = templates.find((t) => t.id === 'camp-cond');
    expect(cond?.lines.map((l) => l.variantId)).toContain('jump-rope-basic');

    const planning = await loadPlanning(repo);
    expect(planning.some((i) => i.title === 'Conditionnement boxe')).toBe(true);
    expect(planning.filter((i) => i.kind === 'seance').length).toBeGreaterThan(20);

    const saved = await repo.getKv<SavedProgramRow>('program.current');
    expect(saved?.program.weeks).toBe(8);
    expect(saved?.program.rules.join(' ')).toContain('Fessiers');
    expect(saved?.program.rules.join(' ')).toContain('Déficit léger');
    expect(saved?.program.rules.join(' ')).toContain('Boxe maison');
  });
});
