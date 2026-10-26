// Stagnation et récupération : on analyse avant de modifier. Choix de conception (ajustables) :
//  - tendance jugée sur ≥ 3 séances COMPARABLES couvrant ≥ 14 jours (une mauvaise séance ne suffit jamais) ;
//  - indice de performance = estimation d'Epley sur la meilleure série (comparaison relative seulement, pas un 1RM) ;
//  - avant toute phase allégée : qualité des données, régularité, récupération ;
//  - phase allégée proposée (à valider) : 6 jours, ≈ 40 % de séries en moins, +1 rép. en réserve, pas d'échec ; puis réévaluation.

export interface Perf {
  day: string;
  /** Charge ajoutée (kg), 0 au poids du corps. */
  load: number;
  reps: number;
  rirKnown: boolean;
}

export type Trend = 'progrès' | 'stable' | 'baisse' | 'insuffisant';

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Indice d'Epley (résistance totale × (1 + rép/30)). Poids du corps inclus si fourni (exercices au poids du corps). */
export const perfIndex = (p: Perf, bodyweightKg = 0) => (bodyweightKg + p.load) * (1 + p.reps / 30);

/** Tendance d'un exercice sur ses séances comparables (de la plus ancienne à la plus récente). */
export function trendOf(perfs: Perf[], bodyweightKg = 0): { trend: Trend; changePct?: number; sessions: number; reason: string } {
  if (perfs.length < 3 || days(perfs[0]!.day, perfs[perfs.length - 1]!.day) < 14) {
    return { trend: 'insuffisant', sessions: perfs.length, reason: 'Moins de 3 séances comparables sur 14 jours : pas de conclusion.' };
  }
  const idx = perfs.map((p) => perfIndex(p, bodyweightKg));
  const before = Math.max(...idx.slice(0, -1));
  const last = idx[idx.length - 1]!;
  const change = Math.round(((last - before) / before) * 1000) / 10;
  if (change > 1) return { trend: 'progrès', changePct: change, sessions: perfs.length, reason: `+${change} % sur ${perfs.length} séances comparables.` };
  if (change < -3) return { trend: 'baisse', changePct: change, sessions: perfs.length, reason: `${change} % sur ${perfs.length} séances comparables.` };
  return { trend: 'stable', changePct: change, sessions: perfs.length, reason: `Pas de progrès (${change >= 0 ? '+' : ''}${change} %) sur ${perfs.length} séances comparables.` };
}

export interface RecoveryInput {
  /** Jours avec mauvaise nuit ou fatigue (contrôle avant séance) sur 14 jours. */
  tiredDays: number;
  /** Séances faites / prévues sur 14 jours. */
  done: number;
  planned: number;
  /** Part des séries de travail avec réserve notée (0–1). */
  rirNotedRatio: number;
}

export interface DeloadProposal {
  propose: boolean;
  reasons: string[];
  /** Ce qu'il faut vérifier/améliorer avant (si pas de proposition). */
  first: string[];
}

/**
 * Proposition de phase allégée. Jamais sur une seule séance ; jamais si le vrai problème est ailleurs
 * (données insuffisantes, régularité faible) — dans ce cas, on dit quoi corriger d'abord.
 */
export function deloadProposal(trends: { name: string; trend: Trend }[], r: RecoveryInput): DeloadProposal {
  const first: string[] = [];
  const judged = trends.filter((t) => t.trend !== 'insuffisant');
  if (r.rirNotedRatio < 0.5) first.push('Note ta réserve (RIR) sur la plupart des séries : sans elle, impossible de distinguer fatigue et stagnation.');
  if (r.planned > 0 && r.done / r.planned < 0.75) first.push(`Régularité ${r.done}/${r.planned} : d’abord tenir les séances prévues, une phase allégée ne réglerait rien.`);
  if (!judged.length) first.push('Pas encore assez de séances comparables pour juger.');
  if (first.length) return { propose: false, reasons: [], first };
  const stuck = judged.filter((t) => t.trend !== 'progrès');
  const down = judged.filter((t) => t.trend === 'baisse');
  const reasons: string[] = [];
  if (stuck.length >= 2) reasons.push(`Pas de progrès sur ${stuck.map((t) => t.name).join(', ')}.`);
  if (down.length >= 1 && r.tiredDays >= 3) reasons.push(`Baisse (${down.map((t) => t.name).join(', ')}) + ${r.tiredDays} jours de fatigue en 2 semaines.`);
  return { propose: reasons.length > 0, reasons, first: [] };
}

/** Clé de stockage de la phase allégée. */
export const DELOAD = 'deload';

export interface Deload {
  from: string;
  to: string;
  reason: string;
  status: 'proposée' | 'active' | 'refusée' | 'terminée';
}

/** Applique la phase allégée à une ligne : ≈ 40 % de séries en moins (au moins 1), +1 rép. en réserve, pas d'échec. */
export function deloadLine<T extends { sets: number; targetRir?: number; lastSetToFailure?: boolean }>(l: T): T {
  return { ...l, sets: Math.max(1, Math.round(l.sets * 0.6)), targetRir: (l.targetRir ?? 2) + 1, lastSetToFailure: false };
}

/**
 * Applique la phase allégée à une liste de séries (une entrée par série, groupées par bloc) : on garde les premières
 * séries de travail de chaque bloc (≈ 60 %, au moins 1), réserve +1, pas d'échec. Échauffements inchangés.
 * La réserve différente rend ces séances non comparables : elles ne servent ni à progresser ni à conclure à une baisse.
 */
export function deloadSets<T extends { blockId: string; role: string; targetRir?: number; lastSetToFailure?: boolean; progression?: string }>(sets: T[], note: string): T[] {
  const total = new Map<string, number>();
  for (const s of sets) if (s.role === 'work') total.set(s.blockId, (total.get(s.blockId) ?? 0) + 1);
  const seen = new Map<string, number>();
  return sets.flatMap((s) => {
    if (s.role !== 'work') return [s];
    const i = (seen.get(s.blockId) ?? 0) + 1;
    seen.set(s.blockId, i);
    if (i > Math.max(1, Math.round(total.get(s.blockId)! * 0.6))) return [];
    return [{ ...s, targetRir: (s.targetRir ?? 2) + 1, lastSetToFailure: false, progression: note }];
  });
}

export const inDeload =(d: Deload | undefined, day: string) => !!d && d.status === 'active' && day >= d.from && day <= d.to;
