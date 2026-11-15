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
  if (answers.flatGlutes) {
    rules.push('Fessiers : pas de hip thrust, RDL lourd, fentes ni swings. Sissy squat et curl nordique les remplacent.');
  }
  if ((answers.boxingPerWeek ?? 0) > 0 && answers.boxingPlace === 'maison') {
    rules.push('Boxe maison : 2 séances (corde, ombres, sac) + 1 conditionnement de 30 min par semaine.');
  }
  if ((answers.weeks ?? 4) >= 8) {
    rules.push('Semaine 4 : deload — réduis les séries de 30 à 40 %, garde les mêmes charges.');
  }
  if (answers.priority === 'seche') {
    rules.push('Déficit léger : 2 400–2 600 kcal, 165–175 g de protéines, 8 h de sommeil. Repère de travail, à ajuster sur la tendance.');
  }
  if (answers.style === 'calisthenics') {
    rules.push('Style calisthenics : priorité aux tractions, dips et gainage ; ajoute du lest quand les répétitions deviennent faciles.');
  }
  return rules;
}

function applyFlatGlutes(program: Program, flat: boolean): Program {
  if (!flat) return program;
  const templates = program.templates.map((t) =>
    t.key === 'B'
      ? {
          ...t,
          title: 'Jambes sans fessiers',
          lines: [
            { variantId: 'sissy-squat-bw', kind: 'reps' as const, role: 'work' as const, sets: 3, targetReps: 10, repRange: [8, 12] as [number, number], targetRir: 2, restSeconds: 90 },
            { variantId: 'nordic-curl-bw', kind: 'reps' as const, role: 'work' as const, sets: 3, targetReps: 8, repRange: [6, 10] as [number, number], targetRir: 2, restSeconds: 90 },
            { variantId: 'hollow-hold', kind: 'hold' as const, role: 'work' as const, sets: 3, targetSeconds: 30, restSeconds: 45 },
          ],
        }
      : t,
  );
  const rename = (items: Program['week']): Program['week'] =>
    items.map((i) => (i.templateKey === 'B' ? { ...i, title: 'Jambes sans fessiers' } : i));
  return { ...program, templates, week: rename(program.week), weekly: program.weekly.map(rename) };
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

  const finalProgram = applyFlatGlutes(program, answers.flatGlutes === true);
  const owned = await loadOwned(repo);
  const templates = await loadTemplates(repo);
  const tplId = (key: string) => `prog-${key}`;
  const progTemplates: SessionTemplate[] = finalProgram.templates.map((t) => ({
    id: tplId(t.key),
    title: t.title,
    updatedAt: Date.now(),
    lines: adaptToEquipment(t.lines, owned).lines.map((l) => ({ ...l, id: newId() })),
  }));
  const homeBoxing = (answers.boxingPerWeek ?? 0) > 0 && answers.boxingPlace === 'maison';
  const campTemplate: SessionTemplate | null = homeBoxing
    ? {
        id: 'camp-cond',
        title: 'Conditionnement boxe',
        updatedAt: Date.now(),
        lines: adaptToEquipment(
          [
            { variantId: 'jump-rope-basic', kind: 'hold' as const, role: 'work' as const, sets: 3, targetSeconds: 180, restSeconds: 60 },
            { variantId: 'shadow-boxing', kind: 'hold' as const, role: 'work' as const, sets: 3, targetSeconds: 180, restSeconds: 60 },
            { variantId: 'bag-rounds', kind: 'hold' as const, role: 'work' as const, sets: 2, targetSeconds: 180, restSeconds: 60 },
            { variantId: 'hollow-hold', kind: 'hold' as const, role: 'work' as const, sets: 3, targetSeconds: 30, restSeconds: 45 },
          ],
          owned,
        ).lines.map((l) => ({ ...l, id: newId() })),
      }
    : null;
  await saveTemplates(repo, [
    ...templates.filter((t) => !t.id.startsWith('prog-') && t.id !== 'camp-cond'),
    ...progTemplates,
    ...(campTemplate ? [campTemplate] : []),
  ]);

  // La boxe devient un engagement récurrent : le planning de force se place autour.
  if ((answers.boxingPerWeek ?? 0) > 0 && (answers.boxingDays ?? []).length) {
    const recurring = await loadRecurring(repo);
    const boxing: FixedEvent = {
      id: 'boxe',
      kind: 'autre',
      label: answers.boxingPlace === 'club' ? 'Boxe (club)' : 'Boxe (maison)',
      days: answers.boxingDays ?? [],
      start: '19:00',
      end: '20:30',
    };
    await saveRecurring(repo, [...recurring.filter((e) => e.id !== 'boxe'), boxing]);
  }

  const items = await loadPlanning(repo);
  const kept = items.filter((i) => !(i.programId && !i.sessionId && i.weekStart >= start));
  const added: PlannedItem[] = [];
  for (let w = 0; w < finalProgram.weeks; w++) {
    const ws = shiftWeek(start, w);
    for (const it of finalProgram.weekly[w] ?? finalProgram.week) {
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
  if (campTemplate) {
    const busy = new Set([...added.map((i) => i.day), ...(answers.boxingDays ?? [])]);
    const day = [5, 6, 2, 3, 1, 4, 0].find((d) => !busy.has(d)) ?? 6;
    for (let w = 0; w < finalProgram.weeks; w++) {
      added.push({
        id: newId(),
        weekStart: shiftWeek(start, w),
        day,
        start: '10:00',
        durationMin: 30,
        kind: 'seance',
        title: 'Conditionnement boxe',
        templateId: 'camp-cond',
        moves: [],
        programId: id,
      });
    }
  }

  const fit = await fitPlanning(repo, [...kept, ...added], today);
  await repo.setKv('planning.items', fit.items);
  const savedProgram: Program = { ...finalProgram, rules: extraRules(finalProgram.rules, answers) };
  await repo.setKv('program.answers', answers);
  await repo.setKv('program.current', { id, program: savedProgram, answers, startWeek: start, at: Date.now() } satisfies SavedProgramRow);
  return { id, startWeek: start, notes: fit.notes };
}
