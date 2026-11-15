# -*- coding: utf-8 -*-
import io

p = "tests/saveProgram.test.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace(
    "import { deviceTimeZone } from '../src/ui/support';",
    "import { deviceTimeZone } from '../src/ui/support';\nimport { loadRecurring } from '../src/ui/agenda';",
)
s = s.replace(
    "const answers: ProgramAnswers = {",
    "const boxingAnswers: ProgramAnswers = {",
)
s = s.replace(
    "  quitReason: 'temps',\n};",
    "  quitReason: 'temps',\n};\n\nconst answers: ProgramAnswers = {\n  pains: [],\n  priority: 'muscle',\n  days: 3,\n  minutes: 45,\n  slot: 'midi',\n  sleepH: 7.5,\n  quitReason: 'temps',\n};",
)
s = s.rstrip() + """

describe('boxe dans le programme', () => {
  it('ajoute la boxe comme engagement récurrent et une règle de récupération', async () => {
    const repo = new Repository(new CoachDb(`save-boxing-${Date.now()}`));
    const program = buildProgram(boxingAnswers, [5, 6, 12], [6, 12], []);
    await saveProgram(repo, program, boxingAnswers);

    const recurring = await loadRecurring(repo);
    const boxe = recurring.find((e) => e.id === 'boxe');
    expect(boxe?.days).toEqual([1, 3]);
    expect(boxe?.label).toBe('Boxe');

    const saved = await repo.getKv<SavedProgramRow>('program.current');
    expect(saved?.program.rules[0]).toContain('Boxe 2×/semaine');
    expect(saved?.program.rules[0]).toContain('48 h');
  });
});
"""
io.open(p, "w", encoding="utf-8").write(s)
print("boxing test added")
