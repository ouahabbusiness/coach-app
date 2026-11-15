// Enregistre un programme généré (modèles + planning + programme courant).
// Même logique que la validation de l'entretien classique, extraite pour être réutilisée
// par le parcours guidé par Ippo.

import { localDay } from '../engine/derive';
import { shiftWeek, type PlannedItem } from '../engine/planning';
import { weekStart } from '../engine/challenge';
import { buildProgram, type Program, type ProgramAnswers } from '../engine/programBuilder';
import { adaptToEquipment } from '../engine/trip';
import type { FixedEvent } from '../engine/planning';
import type { Repository } from '../storage/db';
import { fitPlanning } from './agenda';
import { loadKettlebells, loadOwned, loadPieces } from './equipment';
import { loadPlanning } from './Planning';
import { loadRecurring, saveRecurring } from './agenda';
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

const DAY_LABELS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Règles affichées : boxe, corde, style. Le moteur de séries n'est pas modifié. */
export function extraRules(base: string[], answers: ProgramAnswers): string[] {
  const rules = [...base];
  const boxingDays = answers.boxingDays ?? [];
  if ((answers.boxingPerWeek ?? 0) > 0 && boxingDays.length) {
    const days = boxingDays.map((d) => DAY_LABELS[d] ?? `j${d}`).join(', ');
    rules.unshift(
      `Boxe ${answers.boxingPerWeek}×/semaine (${days}) : garde 48 h entre une séance lourde du haut du corps et la boxe.`,
    );
  }
  if (answers.rope) rules.push('Corde à sauter : 3 × 2 min en fin de séance, ou 15 min un jour léger.');
  if (answers.style === 'calisthenics') {
    rules.push('Style calisthenics : priorité aux tractions, dips et gainage ; ajoute du lest quand les répétitions deviennent faciles.');
  }
  return rules;
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

  // La boxe devient un engagement récurrent : le planning de force se place autour.
  if ((answers.boxingPerWeek ?? 0) > 0 && (answers.boxingDays ?? []).length) {
    const recurring = await loadRecurring(repo);
    const boxing: FixedEvent = {
      id: 'boxe',
      kind: 'autre',
      label: 'Boxe',
      days: answers.boxingDays ?? [],
      start: '19:00',
      end: '20:30',
    };
    await saveRecurring(repo, [...recurring.filter((e) => e.id !== 'boxe'), boxing]);
  }

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
  const finalProgram: Program = { ...program, rules: extraRules(program.rules, answers) };
  await repo.setKv('program.answers', answers);
  await repo.setKv('program.current', { id, program: finalProgram, answers, startWeek: start, at: Date.now() } satisfies SavedProgramRow);
  return { id, startWeek: start, notes: fit.notes };
}
