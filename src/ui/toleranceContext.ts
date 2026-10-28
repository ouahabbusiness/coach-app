// Contexte de tolérance : réponses sur la gêne + séances récentes. Sans gêne déclarée, rien n'est restreint.

import type { AdaptOpts } from '../engine/trip';
import { adaptationPatterns } from '../engine/joints';
import { project } from '../engine/session';
import { toleranceOf, toleratedVariants, TOLERANCE_LABELS, type ToleranceContext } from '../engine/tolerance';
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
  const ctx: ToleranceContext = { triggerPatterns: adaptationPatterns(joints), tolerated: toleratedVariants(states, now) };
  const declared = joints.length > 0;
  return {
    declared,
    ctx,
    opts: declared
      ? {
          avoid: (id) => toleranceOf(id, ctx) === 'declencheur',
          note: (id) => {
            const t = toleranceOf(id, ctx);
            return t && t !== 'declencheur' ? TOLERANCE_LABELS[t] : undefined;
          },
        }
      : {},
  };
}
