// Modèles de séance créés par l'utilisateur, stockés localement.

import type { BlockType, SessionPlan, SetKind, SetRole } from '../engine/types';
import type { Repository } from '../storage/db';
import { newId } from './support';

export interface TemplateLine {
  id: string;
  variantId: string;
  kind: SetKind;
  role: SetRole;
  sets: number;
  targetReps?: number;
  targetSeconds?: number;
  loadKg?: number;
  assistance?: string;
  targetRir?: number;
  repRange?: [number, number];
  lastSetToFailure?: boolean;
  restSeconds: number;
  /** Consigne d'exécution (ex. « prise neutre »). */
  cue?: string;
}

export interface SessionTemplate {
  id: string;
  title: string;
  lines: TemplateLine[];
  updatedAt: number;
}

const KEY = 'templates';

export async function loadTemplates(repo: Repository): Promise<SessionTemplate[]> {
  return (await repo.getKv<SessionTemplate[]>(KEY)) ?? [];
}

export async function saveTemplates(repo: Repository, list: SessionTemplate[]): Promise<void> {
  await repo.setKv(KEY, list);
}

/** Transforme un modèle en plan figé pour une séance : le plan prévu est conservé tel quel. */
/**
 * Consignes d'anciens programmes déjà enregistrés : « 1re série = test max » est remplacée À LA LECTURE par la
 * calibration sous-maximale. Le programme stocké n'est pas modifié (aucune réécriture de tes données).
 */
export function currentCue(cue: string | undefined): string | undefined {
  if (cue && /test max/i.test(cue)) return 'Calibration sous-maximale : arrête chaque série avec 3 rép. en réserve (pas de max)';
  return cue;
}

export function planFromTemplate(t: SessionTemplate, exerciseOf: (variantId: string) => string): SessionPlan {
  const blockType: BlockType = 'straight';
  return {
    id: newId(),
    title: t.title,
    source: 'manual',
    sets: t.lines.flatMap((line) =>
      Array.from({ length: line.sets }, () => ({
        id: newId(),
        exerciseId: exerciseOf(line.variantId),
        variantId: line.variantId,
        blockId: line.id,
        blockType,
        role: line.role,
        kind: line.kind,
        targetReps: line.kind === 'reps' ? line.targetReps : undefined,
        targetSeconds: line.kind === 'hold' ? line.targetSeconds : undefined,
        loadKg: line.loadKg,
        assistance: line.assistance,
        targetRir: line.targetRir,
        repRange: line.kind === 'reps' ? line.repRange : undefined,
        lastSetToFailure: line.lastSetToFailure,
        restSeconds: line.restSeconds,
        cue: currentCue(line.cue),
      })),
    ),
  };
}
