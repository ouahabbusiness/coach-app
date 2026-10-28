// « Compléter mon profil » : activité de la journée et gêne articulaire. Stocké localement, modifiable à tout moment.

import type { ActivityAnswers, Training } from '../engine/activity';
import type { JointAnswer, JointZone } from '../engine/joints';
import type { Repository } from '../storage/db';

const KEY = 'profile.complement';
export const COMPLEMENT_EVENT = 'coach-complement';

export interface Complement {
  activity?: ActivityAnswers;
  joints?: JointAnswer[];
}

export async function loadComplement(repo: Pick<Repository, 'getKv'>): Promise<Complement> {
  return (await repo.getKv<Complement>(KEY)) ?? {};
}

export async function saveComplement(repo: Pick<Repository, 'setKv'>, c: Complement): Promise<void> {
  await repo.setKv(KEY, c);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COMPLEMENT_EVENT));
}

interface ProgramLite {
  program?: { weekly?: ProgramItem[][]; week?: ProgramItem[] };
  answers?: { pains?: string[] };
}
interface ProgramItem {
  kind: string;
  durationMin: number;
  km?: number;
}

/** Charge hebdomadaire de la 1re semaine du programme : minutes de musculation et km de course. */
export function trainingOfProgram(p?: ProgramLite | null): Training | undefined {
  const week = p?.program?.weekly?.[0] ?? p?.program?.week;
  if (!week?.length) return undefined;
  return {
    strengthMinPerWeek: week.filter((x) => x.kind === 'seance').reduce((t, x) => t + x.durationMin, 0),
    runKmPerWeek: week.filter((x) => x.kind === 'course').reduce((t, x) => t + (x.km ?? 0), 0),
  };
}

/** Zones déjà déclarées (entretien du programme ou fiche d'accueil) : proposées déjà cochées, à confirmer. */
export function declaredZones(programPains?: string[], onboardingPains?: string): JointZone[] {
  const out = new Set<JointZone>();
  if (programPains?.includes('epaules') || /[ée]paule/i.test(onboardingPains ?? '')) out.add('epaule');
  if (programPains?.includes('coudes') || /coude/i.test(onboardingPains ?? '')) out.add('coudes');
  return [...out];
}

export async function loadTraining(repo: Pick<Repository, 'getKv'>): Promise<Training | undefined> {
  return trainingOfProgram(await repo.getKv<ProgramLite>('program.current'));
}
