// Contexte de tolérance : réponses sur la gêne + séances récentes + retours explicites. Sans gêne déclarée, rien n'est restreint.

import type { AdaptOpts } from '../engine/trip';
import { adaptationPatterns } from '../engine/joints';
import { project } from '../engine/session';
import { localDay } from '../engine/derive';
import { toleranceDetail, toleranceOf, toleranceHistory, type JointFeedback, type ToleranceContext } from '../engine/tolerance';
import type { Repository } from '../storage/db';
import { loadComplement } from './profileComplement';

export interface LoadedTolerance {
  declared: boolean;
  ctx: ToleranceContext;
  /** À passer à adaptToEquipment. */
  opts: AdaptOpts;
}

export async function loadTolerance(repo: Repository, now = Date.now()): Promise<LoadedTolerance> {
  const joints = (await loadComplement(repo)).joints ?? [];
  const states = [...(await repo.allSessionEvents()).values()].map((ev) => project(ev)).filter((s): s is NonNullable<ReturnType<typeof project>> => s !== null);
  const feedback: Record<string, JointFeedback | undefined> = {};
  const readinessPain: Record<string, string | undefined> = {};
  for (const s of states) {
    feedback[s.sessionId] = await repo.getKv<JointFeedback>(`joint.feedback.${s.sessionId}`);
    readinessPain[s.sessionId] = (await repo.getKv<{ input?: { pain?: string } }>(`readiness.${s.sessionId}`))?.input?.pain;
  }
  const ctx: ToleranceContext = { triggerPatterns: adaptationPatterns(joints), ...toleranceHistory(states, feedback, now, (at, tz) => localDay(at, tz ?? 'UTC'), 28, readinessPain) };
  const declared = joints.length > 0;
  return {
    declared,
    ctx,
    opts: declared
      ? {
          // Un remplaçant déclencheur ou à gêne signalée n'est jamais choisi automatiquement.
          avoid: (id) => {
            const t = toleranceOf(id, ctx);
            return t === 'declencheur' || t === 'signalee';
          },
          note: (id) => {
            const t = toleranceOf(id, ctx);
            return t && t !== 'declencheur' ? toleranceDetail(id, ctx) : undefined;
          },
        }
      : {},
  };
}
