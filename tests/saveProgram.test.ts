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

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

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
