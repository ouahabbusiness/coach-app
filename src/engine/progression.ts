// Progression des charges (lest) et des répétitions, à partir des résultats réels.
// Règle « double progression » avec la réserve déclarée (RIR) :
//  - toutes les séries tenues avec de la marge → on monte ;
//  - séries nettement manquées → on redescend ;
//  - sinon on garde.
// Les charges proposées sont uniquement celles réalisables avec le matériel déclaré (somme de pièces).
// Si la charge suivante est un gros saut, on gagne d'abord des répétitions à la charge actuelle.

import type { PlannedSet, SessionState, SetResult } from './types';
import { currentResult } from './derive';

/** Pièces de lest déclarées par Hmidou le 26/10/2026 : 2 disques de 5 kg, kettlebells 6 et 12 kg. */
export const DEFAULT_PIECES = [5, 5, 6, 12];

/** Kettlebells déclarées : une kettlebell ne s'additionne pas (goblet, rowing, swing : une seule à la fois). */
export const DEFAULT_KETTLEBELLS = [6, 12];

/**
 * Charges possibles pour un exercice selon son matériel :
 * ceinture de lest → combinaisons de pièces ; kettlebell → une des kettlebells ; sinon aucune (on progresse en répétitions).
 */
export function loadsForEquipment(equipment: string[], pieces: number[], kettlebells: number[]): number[] {
  if (equipment.includes('ceinture de lest')) return availableLoads(pieces);
  if (equipment.includes('kettlebell')) return [...kettlebells].sort((a, b) => a - b);
  return [];
}

/** Toutes les charges réalisables en combinant les pièces (0 compris), triées. */
export function availableLoads(pieces: number[]): number[] {
  let sums = new Set<number>([0]);
  for (const p of pieces) sums = new Set([...sums, ...[...sums].map((s) => Math.round((s + p) * 100) / 100)]);
  return [...sums].sort((a, b) => a - b);
}

/** Charge réalisable immédiatement au-dessus / en dessous. Sans pièces déclarées : pas de 2,5 kg (1,25 sous 10 kg). */
export function loadUp(kg: number, loads: number[] = []): number | undefined {
  if (!loads.length) return kg + (kg < 10 ? 1.25 : 2.5);
  return loads.find((l) => l > kg + 1e-9);
}
export function loadDown(kg: number, loads: number[] = []): number {
  if (!loads.length) return Math.max(0, kg - (kg < 10 ? 1.25 : 2.5));
  return [...loads].reverse().find((l) => l < kg - 1e-9) ?? 0;
}

/** Saut « gros » : plus de 20 % de la charge actuelle (et au moins 3 kg). On fait alors d'abord +2 répétitions. */
export const bigJump = (from: number, to: number) => to - from >= 3 && to - from > from * 0.2;
export const REP_BUFFER = 2;

const fmtKg = (kg: number) => kg.toLocaleString('fr-BE', { maximumFractionDigits: 2 });

/** Série « facile » : au moins 3 répétitions de réserve, ou 2 de plus que la cible si la réserve n'est pas notée. */
export function tooEasy(r: SetResult, target?: number): boolean {
  if (target === undefined || r.reps === undefined) return false;
  if (r.reps < target) return false;
  return r.rir !== undefined ? r.rir >= 3 : r.reps >= target + 2;
}

/** Série « manquée » : au moins 2 répétitions sous la cible. */
export const missed = (r: SetResult, target?: number) => target !== undefined && r.reps !== undefined && r.reps <= target - 2;

export interface Adjust {
  loadKg?: number;
  targetReps?: number;
  /** Texte court affiché (ex. « ↑ 16 kg »). */
  note?: string;
}

/**
 * Séance suivante, à partir des séries de travail de la dernière fois sur la même variante.
 * `line.targetReps` est la cible de base du modèle.
 */
export function nextSessionAdjust(prev: SetResult[] | undefined, line: { targetReps?: number; loadKg?: number }, loads: number[] = []): Adjust {
  if (!prev || prev.length === 0 || line.targetReps === undefined) return {};
  const base = line.targetReps;
  const lastLoad = prev.reduce<number | undefined>((m, r) => (r.loadKg !== undefined ? Math.max(m ?? 0, r.loadKg) : m), undefined) ?? line.loadKg;
  const minReps = Math.min(...prev.map((r) => r.reps ?? 0));
  // Cible tenue la dernière fois : la base, ou plus si on était en train de monter les répétitions.
  const hitAll = minReps >= base;
  const easy = hitAll && prev.every((r) => (r.rir !== undefined ? r.rir >= 2 : (r.reps ?? 0) >= base + 1));
  const missedMany = prev.filter((r) => missed(r, base)).length * 2 >= prev.length;

  if (easy) {
    if (lastLoad !== undefined && lastLoad > 0) {
      const up = loadUp(lastLoad, loads);
      if (up === undefined) return { loadKg: lastLoad, targetReps: minReps + 1, note: `↑ +1 rép. · ${fmtKg(lastLoad)} kg max` };
      // Gros saut (ex. 12 → 16 kg) : d'abord base + 2 répétitions à la charge actuelle, puis on saute.
      if (bigJump(lastLoad, up) && minReps < base + REP_BUFFER) {
        return { loadKg: lastLoad, targetReps: minReps + 1, note: `↑ +1 rép. avant ${fmtKg(up)} kg` };
      }
      return { loadKg: up, targetReps: base, note: `↑ ${fmtKg(up)} kg` };
    }
    return { targetReps: Math.max(base, minReps) + 1, note: '↑ +1 rép.' };
  }
  if (missedMany && lastLoad !== undefined && lastLoad > 0) {
    const down = loadDown(lastLoad, loads);
    return { loadKg: down, targetReps: base, note: `↓ ${fmtKg(down)} kg` };
  }
  if (lastLoad !== undefined && lastLoad !== line.loadKg) return { loadKg: lastLoad, note: `= ${fmtKg(lastLoad)} kg` };
  return {};
}

export interface LiveAdvice {
  loadKg?: number;
  targetReps?: number;
  reason: 'facile' | 'manqué' | 'suite';
}

/**
 * Consigne pour une série, d'après les séries déjà faites du même bloc dans cette séance.
 * Trop facile → charge réalisable suivante (avec 2 répétitions de moins si c'est un gros saut).
 */
export function liveLoad(st: SessionState, set: PlannedSet, loads: number[] = []): LiveAdvice | undefined {
  if (set.role !== 'work' || set.kind !== 'reps') return undefined;
  const before = st.sets.filter((s) => s.planned.blockId === set.blockId && s.status === 'done' && s.planned.id !== set.id);
  const last = before[before.length - 1];
  const r = last && currentResult(last);
  if (!r) return undefined;
  const target = last!.planned.repRange?.[1] ?? last!.planned.targetReps;
  const base = r.loadKg ?? last!.planned.loadKg;
  // En séance, on n'ajuste que si c'est MANIFESTEMENT trop facile (≥ 4 de réserve, ou cible + 4 sans réserve notée).
  const manifest = target !== undefined && r.reps !== undefined && r.reps >= target && (r.rir !== undefined ? r.rir >= 4 : r.reps >= target + 4);
  if (manifest) {
    if (base !== undefined && base > 0) {
      const up = loadUp(base, loads);
      if (up === undefined) return { loadKg: base, targetReps: (r.reps ?? 0) + 1, reason: 'facile' };
      return { loadKg: up, targetReps: bigJump(base, up) && target !== undefined ? Math.max(1, target - REP_BUFFER) : undefined, reason: 'facile' };
    }
    return { targetReps: (r.reps ?? 0) + 1, reason: 'facile' };
  }
  if (missed(r, target) && base !== undefined && base > 0) return { loadKg: loadDown(base, loads), reason: 'manqué' };
  // Garde la charge réellement utilisée à la série précédente (si elle a déjà été montée).
  if (base !== undefined && base !== set.loadKg) return { loadKg: base, reason: 'suite' };
  return undefined;
}

export interface LightLoad {
  variantId: string;
  loadKg?: number;
  reps: number;
  /** Charge réalisable au-dessus, si elle existe. */
  next?: number;
  why: string;
}

/**
 * Charge trop légère pour l'objectif muscle/force, d'après les séries de travail réalisées.
 * Repère : une charge légère construit du muscle seulement si on va très près de l'échec ;
 * ≥ 20 répétitions avec ≥ 2 de réserve = endurance ; ≥ 30 répétitions = inefficace dans tous les cas.
 */
export function lightLoad(variantId: string, results: SetResult[], loads: number[]): LightLoad | undefined {
  const reps = results.map((r) => r.reps ?? 0);
  if (!reps.length) return undefined;
  const avg = Math.round(reps.reduce((a, b) => a + b, 0) / reps.length);
  const reserve = results.every((r) => (r.rir ?? 2) >= 2);
  if (avg < 20 || (avg < 30 && !reserve)) return undefined;
  const load = results.reduce<number | undefined>((m, r) => (r.loadKg !== undefined ? Math.max(m ?? 0, r.loadKg) : m), undefined);
  const next = load !== undefined ? loadUp(load, loads) : loads.find((l) => l > 0);
  const where = next !== undefined ? `Passe à ${next.toLocaleString('fr-BE')} kg.` : 'Tu es au maximum de ton matériel : regarde le matériel conseillé.';
  return { variantId, loadKg: load, reps: avg, next, why: `${avg} répétitions${reserve ? ' avec de la réserve' : ''} : c’est de l’endurance, pas du muscle. Vise 6 à 15 répétitions difficiles. ${where}` };
}
