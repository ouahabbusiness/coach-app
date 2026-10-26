// Analyse de stagnation sur les séances comparables + état de la phase allégée (kv 'deload').

import { findVariant } from '../catalog/exercises';
import { currentResult, localDay } from '../engine/derive';
import { project } from '../engine/session';
import { DELOAD, deloadProposal, perfIndex, trendOf, type Deload, type DeloadProposal, type Perf, type Trend } from '../engine/stagnation';
import type { SessionState } from '../engine/types';
import type { Repository } from '../storage/db';
import { loadPlanning } from './Planning';
import { dateOf } from '../engine/planning';
import { deviceTimeZone } from './support';

export { DELOAD };
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export interface ExerciseTrend {
  variantId: string;
  name: string;
  trend: Trend;
  reason: string;
}

export interface RecoveryReport {
  trends: ExerciseTrend[];
  proposal: DeloadProposal;
  deload?: Deload;
  /** La phase allégée est finie : réévaluation à afficher. */
  reevaluate: boolean;
}

export async function loadDeload(repo: Repository): Promise<Deload | undefined> {
  return (await repo.getKv<Deload>(DELOAD)) ?? undefined;
}

/** Tendances sur 6 semaines, séances comparables uniquement (même plage et réserve que la plus récente, contrôle normal, non interrompue). */
export async function recoveryReport(repo: Repository, today = localDay(Date.now(), deviceTimeZone())): Promise<RecoveryReport> {
  const states = [...(await repo.allSessionEvents()).values()]
    .map((e) => project(e))
    .filter((s): s is SessionState => !!s)
    .sort((a, b) => a.startedAt - b.startedAt);
  const weights = (await repo.getKv<{ day: string; kg: number }[]>('weight.log')) ?? [];
  const bw = weights.length ? [...weights].sort((a, b) => (a.day < b.day ? -1 : 1)).pop()!.kg : 0;
  const since = addDays(today, -42);
  const since14 = addDays(today, -14);
  const readiness = new Map<string, string>();
  for (const s of states) readiness.set(s.sessionId, (await repo.getKv<{ d: { decision: string } }>(`readiness.${s.sessionId}`))?.d.decision ?? 'normale');

  const variants = [...new Set(states.flatMap((s) => s.sets.filter((x) => x.planned.role === 'work' && x.planned.kind === 'reps').map((x) => x.planned.variantId)))];
  const trends: ExerciseTrend[] = [];
  let rirNoted = 0;
  let workDone = 0;
  for (const v of variants) {
    const recent = states.filter((s) => localDay(s.startedAt, s.timeZone) >= since && s.sets.some((x) => x.planned.variantId === v && x.planned.role === 'work' && x.status === 'done'));
    if (!recent.length) continue;
    const ref = recent[recent.length - 1]!.sets.find((x) => x.planned.variantId === v && x.planned.role === 'work')!.planned;
    // Charge externe (kettlebell) : sans poids du corps ; sinon le poids du corps fait partie de la résistance.
    const external = (findVariant(v)?.variant.equipment ?? []).some((e) => /kettlebell/i.test(e));
    const perfs: Perf[] = [];
    for (const s of recent) {
      const sets = s.sets.filter((x) => x.planned.variantId === v && x.planned.role === 'work' && x.status === 'done');
      const p = sets[0]!.planned;
      const comparable = readiness.get(s.sessionId) === 'normale' && !s.interruptions.length && JSON.stringify(p.repRange) === JSON.stringify(ref.repRange) && p.targetRir === ref.targetRir;
      const res = sets.map((x) => ({ r: currentResult(x), load: currentResult(x)?.loadKg ?? x.planned.loadKg ?? 0 })).filter((x) => x.r?.reps !== undefined);
      if (localDay(s.startedAt, s.timeZone) >= since14) {
        workDone += res.length;
        rirNoted += res.filter((x) => x.r!.rir !== undefined).length;
      }
      if (!comparable || !res.length) continue;
      const best = res.map((x) => ({ day: localDay(s.startedAt, s.timeZone), load: x.load, reps: x.r!.reps!, rirKnown: x.r!.rir !== undefined })).sort((a, b) => perfIndex(b, external ? 0 : bw) - perfIndex(a, external ? 0 : bw))[0]!;
      perfs.push(best);
    }
    const t = trendOf(perfs.slice(-4), external ? 0 : bw);
    trends.push({ variantId: v, name: findVariant(v)?.variant.name ?? v, trend: t.trend, reason: t.reason });
  }

  const rlog = ((await repo.getKv<{ day: string; tired: boolean }[]>('readiness.log')) ?? []).filter((r) => r.day >= since14 && r.day <= today);
  const tiredDays = new Set(rlog.filter((r) => r.tired).map((r) => r.day)).size;
  const items = (await loadPlanning(repo)).filter((i) => i.kind === 'seance' && !(i.adjustment && i.adjustment.decision !== 'adaptée')).map((i) => ({ ...i, date: dateOf(i.weekStart, i.day) })).filter((i) => i.date >= since14 && i.date < today);
  const done = items.filter((i) => i.sessionId).length;
  const deload = await loadDeload(repo);
  let proposal = deloadProposal(trends, { tiredDays, done, planned: items.length, rirNotedRatio: workDone ? rirNoted / workDone : 0 });
  // Pas de nouvelle proposition pendant une phase allégée, ni dans les 14 jours après un refus ou une fin.
  const quiet = deload && (deload.status === 'active' ? today <= deload.to : addDays(deload.to, 14) >= today);
  if (quiet) proposal = { propose: false, reasons: [], first: [] };
  return { trends, proposal, deload, reevaluate: !!deload && deload.status === 'active' && today > deload.to };
}

export async function acceptDeload(repo: Repository, reasons: string[], today = localDay(Date.now(), deviceTimeZone())): Promise<Deload> {
  const d: Deload = { from: today, to: addDays(today, 6), reason: reasons.join(' '), status: 'active' };
  await repo.setKv(DELOAD, d);
  return d;
}

export async function refuseDeload(repo: Repository, reasons: string[], today = localDay(Date.now(), deviceTimeZone())): Promise<void> {
  await repo.setKv(DELOAD, { from: today, to: today, reason: reasons.join(' '), status: 'refusée' } satisfies Deload);
}

export async function closeDeload(repo: Repository): Promise<void> {
  const d = await loadDeload(repo);
  if (d) await repo.setKv(DELOAD, { ...d, status: 'terminée' } satisfies Deload);
}
