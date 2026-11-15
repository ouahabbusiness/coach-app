// Enregistre un programme généré (modèles + planning + programme courant).
// Même logique que la validation de l'entretien classique, extraite pour être réutilisée
// par le parcours guidé par Ippo.

import { localDay } from '../engine/derive';
import { shiftWeek, type PlannedItem } from '../engine/planning';
import { weekStart } from '../engine/challenge';
import { buildProgram, type Program, type ProgramAnswers } from '../engine/programBuilder';
import { adaptToEquipment } from '../engine/trip';
import type { Repository } from '../storage/db';
import { fitPlanning } from './agenda';
import { loadKettlebells, loadOwned, loadPieces } from './equipment';
import { loadPlanning } from './Planning';
import { loadTemplates, saveTemplates, type SessionTemplate } from './templates';
import { deviceTimeZone, newId } from './support';
import { availableLoads } from '../engine/progression';

export interface SavedProgramRow {
  id: string;
  program: Program;
  answers: ProgramAnswers;
  startWeek: string;
  at: number;
}

export interface SaveProgramResult {
  id: string;
  startWeek: string;
  notes: string[];
}

/** Construit le programme avec le matériel réellement possédé, puis l'installe. */
export async function buildAndSaveProgram(repo: Repository, answers: ProgramAnswers): Promise<SaveProgramResult> {
  const loads = availableLoads(await loadPieces(repo));
  const kbs = await loadKettlebells(repo);
  const program = buildProgram(answers, loads, kbs, []);
  return saveProgram(repo, program, answers);
}

export async function saveProgram(repo: Repository, program: Program, answers: ProgramAnswers): Promise<SaveProgramResult> {
  const today = localDay(Date.now(), deviceTimeZone());
  const id = newId();
  const start = shiftWeek(weekStart(today), 1);

  const owned = await loadOwned(repo);
  const templates = await loadTemplates(repo);
  const tplId = (key: string) => `prog-${key}`;
  const progTemplates: SessionTemplate[] = program.templates.map((t) => ({
    id: tplId(t.key),
    title: t.title,
    updatedAt: Date.now(),
    lines: adaptToEquipment(t.lines, owned).lines.map((l) => ({ ...l, id: newId() })),
  }));
  await saveTemplates(repo, [...templates.filter((t) => !t.id.startsWith('prog-')), ...progTemplates]);

  const items = await loadPlanning(repo);
  const kept = items.filter((i) => !(i.programId && !i.sessionId && i.weekStart >= start));
  const added: PlannedItem[] = [];
  for (let w = 0; w < program.weeks; w++) {
    const ws = shiftWeek(start, w);
    for (const it of program.weekly[w] ?? program.week) {
      added.push({
        id: newId(),
        weekStart: ws,
        day: it.day,
        start: it.start,
        durationMin: it.durationMin,
        kind: it.kind,
        title: it.title,
        detail: it.detail,
        km: it.km,
        templateId: it.templateKey ? tplId(it.templateKey) : undefined,
        moves: [],
        programId: id,
      });
    }
  }
  const fit = await fitPlanning(repo, [...kept, ...added], today);
  await repo.setKv('planning.items', fit.items);
  await repo.setKv('program.answers', answers);
  await repo.setKv('program.current', { id, program, answers, startWeek: start, at: Date.now() } satisfies SavedProgramRow);
  return { id, startWeek: start, notes: fit.notes };
}
