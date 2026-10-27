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

// Trois étapes séparées, chacune traçable : 1) détection (constat chiffré), 2) analyse des causes (hypothèses avec
// leur preuve), 3) décision éventuelle (allègement proposé seulement si la fatigue est la cause la plus plausible).

export interface Detection {
  /** Exercices jugeables (≥ 3 séances comparables / 14 jours). */
  judged: number;
  stuck: string[];
  down: string[];
  detected: boolean;
}

/** 1) Détection : uniquement un constat sur les séances comparables, aucune interprétation. */
export function detectStagnation(trends: { name: string; trend: Trend }[]): Detection {
  const judged = trends.filter((t) => t.trend !== 'insuffisant');
  const stuck = judged.filter((t) => t.trend !== 'progrès').map((t) => t.name);
  const down = judged.filter((t) => t.trend === 'baisse').map((t) => t.name);
  return { judged: judged.length, stuck, down, detected: stuck.length >= 2 || down.length >= 1 };
}

export type CauseId = 'données' | 'régularité' | 'fatigue' | 'programme';

export interface Cause {
  id: CauseId;
  status: 'probable' | 'possible' | 'écartée' | 'inconnue';
  evidence: string;
}

/** 2) Analyse des causes : chaque hypothèse avec son indice. Rien n'est décidé ici. */
export function analyzeCauses(d: Detection, r: RecoveryInput): Cause[] {
  const ratio = r.planned > 0 ? r.done / r.planned : 1;
  const causes: Cause[] = [
    r.rirNotedRatio < 0.5
      ? { id: 'données', status: 'probable', evidence: `Réserve notée sur ${Math.round(r.rirNotedRatio * 100)} % des séries : impossible de distinguer fatigue et stagnation.` }
      : { id: 'données', status: 'écartée', evidence: `Réserve notée sur ${Math.round(r.rirNotedRatio * 100)} % des séries.` },
    r.planned === 0
      ? { id: 'régularité', status: 'inconnue', evidence: 'Aucune séance planifiée sur 14 jours.' }
      : ratio < 0.75
        ? { id: 'régularité', status: 'probable', evidence: `${r.done}/${r.planned} séances faites sur 14 jours.` }
        : { id: 'régularité', status: 'écartée', evidence: `${r.done}/${r.planned} séances faites sur 14 jours.` },
    r.tiredDays >= 3
      ? { id: 'fatigue', status: 'probable', evidence: `${r.tiredDays} jours de mauvaise nuit ou fatigue sur 14 (contrôle avant séance).` }
      : d.down.length
        ? { id: 'fatigue', status: 'possible', evidence: `Baisse sur ${d.down.join(', ')} ; ${r.tiredDays} jour(s) de fatigue déclarée.` }
        : { id: 'fatigue', status: 'écartée', evidence: `${r.tiredDays} jour(s) de fatigue déclarée sur 14.` },
    { id: 'programme', status: d.stuck.length >= 2 ? 'possible' : 'écartée', evidence: d.stuck.length >= 2 ? 'Plusieurs exercices bloqués malgré une pratique régulière : la plage ou la variante peuvent être à revoir après une phase allégée.' : 'Un seul exercice concerné.' },
  ];
  return causes;
}

/**
 * 3) Décision éventuelle. Jamais sans détection ; jamais si les données ou la régularité expliquent mieux le constat
 * (on dit alors quoi corriger d'abord). Allègement proposé (à valider) si la fatigue est probable ou possible
 * avec plusieurs exercices bloqués.
 */
export function decideDeload(d: Detection, causes: Cause[]): DeloadProposal {
  const first: string[] = [];
  const st = (id: CauseId) => causes.find((c) => c.id === id)!;
  if (!d.judged) first.push('Pas encore assez de séances comparables pour juger.');
  if (st('données').status === 'probable') first.push(`Note ta réserve (RIR) sur la plupart des séries. ${st('données').evidence}`);
  if (st('régularité').status === 'probable') first.push(`Régularité d’abord : ${st('régularité').evidence} Une phase allégée ne réglerait rien.`);
  if (first.length || !d.detected) return { propose: false, reasons: [], first };
  const fatigue = st('fatigue');
  const reasons: string[] = [];
  if (d.stuck.length >= 2) reasons.push(`Constat : pas de progrès sur ${d.stuck.join(', ')}.`);
  if (d.down.length) reasons.push(`Constat : baisse sur ${d.down.join(', ')}.`);
  reasons.push(`Cause retenue : fatigue ${fatigue.status} (${fatigue.evidence})`);
  const propose = fatigue.status === 'probable' || (fatigue.status === 'possible' && d.stuck.length >= 2);
  if (propose) return { propose, reasons, first: [] };
  return {
    propose: false,
    reasons: [],
    first: [
      fatigue.status === 'écartée' && d.stuck.length >= 2
        ? 'Blocage sans fatigue observée : un allègement n’est pas justifié. Après 1 séance comparable de plus, le coach proposera de changer de plage ou de variante (à valider).'
        : 'Une baisse isolée sans fatigue déclarée : on observe encore 1 séance comparable avant toute décision.',
    ],
  };
}

/** Enchaîne les trois étapes (compatibilité). */
export function deloadProposal(trends: { name: string; trend: Trend }[], r: RecoveryInput): DeloadProposal {
  const d = detectStagnation(trends);
  return decideDeload(d, analyzeCauses(d, r));
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
