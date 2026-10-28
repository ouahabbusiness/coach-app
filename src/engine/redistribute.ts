// Répartition A/B/C du programme « Hybride » : même volume, pas de séance ajoutée, le travail des jambes n'est plus concentré en B.
// Orientation confirmée : physique athlétique et équilibré, haut du corps plus développé, abdos visibles, jambes fortes et
// proportionnées, sans priorité fessiers fondée sur les zones de gras.
// Fonction pure et idempotente : si les séances n'ont pas la forme attendue, rien n'est touché.

export interface RLine {
  variantId: string;
  sets: number;
  kind?: string;
  role?: string;
  repRange?: [number, number];
  targetReps?: number;
  cue?: string;
  [k: string]: unknown;
}

export const ORIENTATION =
  'Physique athlétique et équilibré : haut du corps plus développé, abdos visibles, jambes fortes et proportionnées, sans priorité fessiers fondée sur les zones de gras.';

const LEG_FORWARD = ['lunge-reverse', 'split-squat-bulgarian'];
/** Rowing : plage haute et séance de calibration (tu as fait environ 22 répétitions avec 2 à 4 en réserve à 12 kg). */
export const ROW_RANGE: [number, number] = [15, 20];
const ROW_CUE = 'Par bras · calibration : arrête à 2 répétitions en réserve et note-les';

export interface Redistributed<T extends RLine> {
  A: T[];
  B: T[];
  C: T[];
  /** Mouvements déplacés ou retirés, pour le journal. */
  moves: { variantId: string; from: string; to: string }[];
}

const has = (lines: RLine[], id: string) => lines.some((l) => l.variantId === id);
const pick = <T extends RLine>(lines: T[], ids: string[]) => lines.find((l) => ids.includes(l.variantId));

/** Null si la répartition est déjà appliquée ou si les séances n'ont pas la forme attendue. */
export function redistribute<T extends RLine>(A: T[], B: T[], C: T[]): Redistributed<T> | null {
  const row = pick(A, ['kb-row-1arm']);
  const rdl = pick(B, ['kb-rdl']);
  const leg = pick(B, LEG_FORWARD);
  const goblet = pick(B, ['squat-goblet-kb']);
  const swing = pick(B, ['kb-swing-2h']);
  const hollow = pick(B, ['hollow-hold']);
  const pull = pick(A, ['pullup-strict', 'pullup-weighted']);
  const dips = pick(A, ['dips-weighted', 'dips-bars', 'dips-bench']);
  const legRaise = pick(A, ['leg-raise-hanging']);
  const kneeRaise = pick(C, ['knee-raise-hanging']);
  if (!row || !rdl || !leg || !goblet || !swing || !hollow || !pull || !dips || !legRaise || !kneeRaise) return null;
  if (has(C, leg.variantId)) return null;
  const newRow: T = { ...row, repRange: [...ROW_RANGE], targetReps: ROW_RANGE[0], cue: ROW_CUE };
  const newA = [pull, dips, rdl, legRaise, ...A.filter((l) => ![pull, dips, row, legRaise].includes(l))];
  const newB = [goblet, newRow, { ...swing, sets: Math.min(swing.sets, 3) }, hollow];
  const idxKnee = C.indexOf(kneeRaise);
  const newC = [...C.slice(0, idxKnee), leg, ...C.slice(idxKnee)];
  const dropped = B.find((l) => l.variantId === 'glute-bridge-kb');
  return {
    A: newA,
    B: newB,
    C: newC,
    moves: [
      { variantId: rdl.variantId, from: 'B', to: 'A' },
      { variantId: row.variantId, from: 'A', to: 'B' },
      { variantId: leg.variantId, from: 'B', to: 'C' },
      { variantId: swing.variantId, from: 'B', to: `B (${swing.sets} → ${Math.min(swing.sets, 3)} séries)` },
      ...(dropped ? [{ variantId: dropped.variantId, from: 'B', to: 'retiré (redondant)' }] : []),
    ],
  };
}
