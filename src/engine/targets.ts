// Cibles calculées par l'app à partir des données de l'utilisateur : eau, calories, course.
// Ce sont des estimations issues de formules publiques, jamais des mesures ni des prescriptions médicales.
// Chaque cible renvoie sa justification (« why ») pour être affichée telle quelle.

import { estimateEnergy, type ActivityAnswers, type Training } from './activity';
import type { GoalCategory } from './profile';
import type { TrendStatus } from './weight';

export interface Computed<T> {
  value?: T;
  why: string[];
  /** Données manquantes pour calculer (affichées à la place d'une valeur inventée). */
  missing: string[];
}

const fmt = (n: number, d = 1) => n.toLocaleString('fr-BE', { maximumFractionDigits: d });
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Eau à boire (ml) : 35 ml/kg (règle courante d'estimation) + 0,5 L par heure d'entraînement. */
export function waterTarget(weightKg: number | undefined, trainingMin = 0): Computed<number> {
  if (!weightKg) return { why: [], missing: ['poids'] };
  const base = 35 * weightKg;
  const sport = trainingMin > 0 ? (trainingMin / 60) * 500 : 0;
  const why = [`${fmt(weightKg)} kg × 35 ml = ${fmt(base / 1000, 2)} L`];
  if (sport) why.push(`+ ${fmt(sport / 1000, 2)} L séance ${trainingMin} min`);
  return { value: roundTo(base + sport, 250), why, missing: [] };
}

export type FormulaSex = 'homme' | 'femme';

export interface CalorieInput {
  sex?: FormulaSex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  sessionsPerWeek?: number;
  goal?: GoalCategory;
  trend?: TrendStatus;
  /** Stratégie issue du programme validé (prioritaire sur l'objectif de configuration). */
  strategy?: Strategy;
  /** Ajustements décidés par les bilans précédents. */
  adjustments?: CalorieAdjust[];
  /** Activité de la journée (hors séances) : si elle est connue, elle remplace le facteur par nombre de séances. */
  activity?: ActivityAnswers;
  training?: Training;
}

export interface CalorieTarget {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  maintenance: number;
  strategy: Strategy;
  /** Ajustements cumulés issus des bilans (kcal). */
  adjusted: number;
  /** Base du maintien : activité réelle déclarée, ou facteur grossier par nombre de séances. */
  basis: 'activité' | 'séances';
}

/** Stratégie validée : développement (surplus), réduction (déficit), maintien (observation). */
export type Strategy = 'développement' | 'réduction' | 'maintien';

export interface CalorieAdjust {
  at: string;
  delta: number;
  reason: string;
}

/** Facteur d'activité selon les séances par semaine (barème classique Harris-Benedict / Mifflin). */
export function activityFactor(sessionsPerWeek = 0): number {
  if (sessionsPerWeek >= 6) return 1.725;
  if (sessionsPerWeek >= 4) return 1.55;
  if (sessionsPerWeek >= 1) return 1.375;
  return 1.2;
}

const strategyOf = (i: CalorieInput): Strategy =>
  i.strategy ?? (i.goal === 'perte_de_graisse' ? 'réduction' : i.goal === 'muscle' ? 'développement' : 'maintien');

/**
 * Cible du jour = estimation provisoire, puis corrigée par les bilans (jamais par une pesée isolée).
 * Réglages de départ (choix de conception à valider, pas des prescriptions) :
 *  développement +5 % du maintien estimé ; réduction −12 % ; maintien = observation.
 * Protéines : 1,8 g/kg (2,0 en réduction pour protéger le muscle), dans la plage 1,6–2,2 g/kg.
 * Lipides ≥ 0,8 g/kg ; glucides = le reste.
 */
export function calorieTarget(i: CalorieInput): Computed<CalorieTarget> {
  const missing: string[] = [];
  if (!i.sex) missing.push('formule');
  if (!i.age) missing.push('âge');
  if (!i.heightCm) missing.push('taille');
  if (!i.weightKg) missing.push('poids');
  if (missing.length) return { why: [], missing };
  const bmr = 10 * i.weightKg! + 6.25 * i.heightCm! - 5 * i.age! + (i.sex === 'homme' ? 5 : -161);
  const strategy = strategyOf(i);
  const energy = i.training ? estimateEnergy({ bmr, weightKg: i.weightKg!, activity: i.activity, training: i.training }) : undefined;
  const factor = activityFactor(i.sessionsPerWeek);
  const maintenance = energy ? energy.maintenance : bmr * factor;
  const why = energy
    ? [...energy.lines, ...energy.notes]
    : [`Mifflin-St Jeor ${Math.round(bmr)} kcal`, `× ${fmt(factor, 3)} (${i.sessionsPerWeek ?? 0} séances/sem.) = maintien estimé`, 'Facteur grossier par nombre de séances : renseigne ton activité pour une estimation plus juste.'];
  const pct = strategy === 'développement' ? 0.05 : strategy === 'réduction' ? -0.12 : 0;
  if (pct) why.push(`${strategy} : ${pct > 0 ? '+' : '−'}${Math.round(Math.abs(pct) * 100)} %`);
  else why.push('maintien : observation avant de décider');
  // Un seul ajustement par date (idempotence : un doublon enregistré ne compte pas deux fois).
  const uniq = [...new Map((i.adjustments ?? []).map((a) => [a.at, a])).values()];
  const adjusted = uniq.reduce((t, a) => t + a.delta, 0);
  for (const a of uniq) why.push(`${a.delta > 0 ? '+' : '−'} ${Math.abs(a.delta)} kcal (${a.at}) : ${a.reason}`);
  const kcal = roundTo(maintenance * (1 + pct) + adjusted, 50);
  const perKg = strategy === 'réduction' ? 2.0 : 1.8;
  const proteinG = Math.round(perKg * i.weightKg!);
  const fatG = Math.round(Math.max(0.8 * i.weightKg!, (kcal * 0.25) / 9));
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  why.push(`protéines ${fmt(perKg, 1)} g/kg = ${proteinG} g · lipides ${fatG} g · glucides ${carbG} g`);
  return { value: { kcal, proteinG, fatG, carbG, maintenance: roundTo(maintenance, 50), strategy, adjusted, basis: energy ? 'activité' : 'séances' }, why, missing: [] };
}

/** Trajectoire visée et zone de tolérance par stratégie (choix de conception, à valider avec l'utilisateur). */
export const TRAJECTORY: Record<Strategy, { label: string; tolerance: string }> = {
  réduction: { label: 'baisse de 0,25 à 1 % du poids par semaine', tolerance: 'entre −0,25 % et −1 %/sem. : aucun changement' },
  développement: { label: 'prise de 0,1 à 0,35 kg par semaine', tolerance: 'entre +0,1 et +0,35 kg/sem. : aucun changement' },
  maintien: { label: 'poids stable', tolerance: 'à ±0,25 kg/sem. : aucun changement' },
};

export interface ReviewContext {
  /** Apports réellement notés (repas cochés / déclarés), un par jour noté. */
  intake: { day: string; kcal: number }[];
  /** Cible actuelle (kcal). */
  targetKcal: number;
  /** Jours avec mauvaise nuit ou fatigue déclarée (contrôle avant séance) sur la période. */
  fatigueDays: number;
}

/**
 * Bilan calorique : seulement après ≥ 14 jours depuis le dernier changement, ≥ 3 pesées par semaine sur 2 semaines,
 * et ≥ 7 jours d'alimentation réellement notée. Pas de 125 kcal. Blocages :
 *  - tu manges déjà nettement sous (ou au-dessus de) la cible → d'abord respecter la cible, pas de correction ;
 *  - récupération difficile (≥ 3 jours) → aucune réduction.
 */
export function reviewCalories(strategy: Strategy, weights: { day: string; kg: number }[], today: string, lastChange?: string, ctx?: ReviewContext): { delta: number; reason: string; uncertain: boolean } {
  const since = (d: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86_400_000);
  if (lastChange && since(lastChange) < 14) return { delta: 0, reason: 'Dernier changement il y a moins de 2 semaines : on observe.', uncertain: false };
  const recent = weights.filter((w) => since(w.day) <= 13 && since(w.day) >= 0);
  const wk1 = recent.filter((w) => since(w.day) <= 6);
  const wk2 = recent.filter((w) => since(w.day) >= 7);
  if (wk1.length < 3 || wk2.length < 3) return { delta: 0, reason: 'Bilan incertain : moins de 3 pesées par semaine sur 2 semaines.', uncertain: true };
  const avg = (a: { kg: number }[]) => a.reduce((t, w) => t + w.kg, 0) / a.length;
  const change = avg(wk1) - avg(wk2);
  const pct = (change / avg(wk2)) * 100;
  const kg = Math.round(change * 100) / 100;
  const sign = kg >= 0 ? '+' : '';
  let wanted = 0;
  let why = '';
  if (strategy === 'réduction') {
    if (pct > -0.25) [wanted, why] = [-125, `Poids ${sign}${fmt(kg)} kg/sem. : la baisse est plus lente que visé.`];
    else if (pct < -1) [wanted, why] = [125, `Poids ${fmt(kg)} kg/sem. : la baisse est trop rapide (muscle à protéger).`];
  } else if (strategy === 'développement') {
    if (kg < 0.1) [wanted, why] = [125, `Poids ${sign}${fmt(kg)} kg/sem. : prise plus lente que visé.`];
    else if (kg > 0.35) [wanted, why] = [-125, `Poids +${fmt(kg)} kg/sem. : prise trop rapide.`];
  } else if (Math.abs(kg) > 0.25) [wanted, why] = [kg > 0 ? -125 : 125, `Poids ${sign}${fmt(kg)} kg/sem. alors que l’objectif est le maintien.`];
  if (!wanted) return { delta: 0, reason: `Rythme ${sign}${fmt(kg)} kg/sem. dans la zone visée : on ne change rien.`, uncertain: false };

  // Vérifications avant toute correction.
  const intake = (ctx?.intake ?? []).filter((x) => since(x.day) <= 13 && since(x.day) >= 0);
  if (intake.length < 7) return { delta: 0, reason: `${why} Mais alimentation réelle notée sur ${intake.length} jour(s) seulement (7 requis) : aucune correction.`, uncertain: true };
  const eaten = Math.round(intake.reduce((t, x) => t + x.kcal, 0) / intake.length);
  const target = ctx!.targetKcal;
  if (eaten < target * 0.9) return { delta: 0, reason: `${why} Tu manges en moyenne ${eaten} kcal, sous la cible ${target} : d’abord atteindre la cible, pas de correction.`, uncertain: false };
  if (eaten > target * 1.1) return { delta: 0, reason: `${why} Tu manges en moyenne ${eaten} kcal, au-dessus de la cible ${target} : d’abord respecter la cible.`, uncertain: false };
  if (wanted < 0 && (ctx?.fatigueDays ?? 0) >= 3) return { delta: 0, reason: `${why} Mais récupération difficile (${ctx!.fatigueDays} jours de fatigue) : aucune réduction.`, uncertain: false };
  return { delta: wanted, reason: `${why} Apports notés ≈ ${eaten} kcal (cible respectée).`, uncertain: false };
}

export interface RunEntry {
  id: string;
  day: string;
  km: number;
  minutes?: number;
  /** Effort ressenti 1–10 (déclaré). */
  effort?: number;
  at: number;
}

export type RunMove = 'départ' | 'hausse' | 'maintien' | 'reprise' | 'prévu';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const roundHalf = (n: number) => Math.round(n * 2) / 2;

/**
 * Distance de la prochaine course. La sortie PRÉVUE au planning fixe la distance (une prescription par sortie, courte ou longue) ;
 * il n'y a plus de hausse automatique de 10 % sur la plus longue sortie récente.
 *  - effort 9/10 ou plus à la dernière sortie : on consolide (jamais plus que la dernière, ni que le prévu) ;
 *  - plus de 14 jours sans courir : reprise à 80 % de la dernière, plafonnée au prévu ;
 *  - sinon : le prévu, sans hausse obligatoire parce qu'une sortie a été terminée.
 * Sans sortie prévue : on garde la dernière distance (jamais de hausse automatique) ; sans historique, départ à 3 km.
 */
export function runTarget(runs: RunEntry[], today: string, planned?: number): Computed<{ km: number; move: RunMove }> {
  const past = runs.filter((r) => r.day <= today).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.at - b.at));
  const last = past[past.length - 1];
  if (!last) {
    if (planned !== undefined) return { value: { km: planned, move: 'départ' }, why: ['aucune course enregistrée', `sortie prévue : ${fmt(planned)} km`, 'pas de hausse automatique'], missing: [] };
    return { value: { km: 3, move: 'départ' }, why: ['aucune course enregistrée', 'départ 3 km'], missing: [] };
  }
  const cap = (km: number) => (planned !== undefined ? Math.min(km, planned) : km);
  const gap = daysBetween(last.day, today);
  if (gap > 14) {
    const km = cap(Math.max(1, roundHalf(last.km * 0.8)));
    return { value: { km, move: 'reprise' }, why: [`dernière course il y a ${gap} j`, `${fmt(last.km)} km × 0,8`, ...(planned !== undefined ? [`plafonné au prévu (${fmt(planned)} km)`] : [])], missing: [] };
  }
  if (last.effort !== undefined && last.effort >= 9) {
    return { value: { km: cap(last.km), move: 'maintien' }, why: [`dernière ${fmt(last.km)} km`, `effort ${last.effort}/10 : on consolide`], missing: [] };
  }
  if (planned !== undefined) {
    return { value: { km: planned, move: 'prévu' }, why: [`sortie prévue : ${fmt(planned)} km`, last.effort !== undefined ? `dernier effort ${last.effort}/10` : 'effort non noté', 'pas de hausse automatique'], missing: [] };
  }
  return { value: { km: last.km, move: 'maintien' }, why: [`dernière ${fmt(last.km)} km`, 'aucune sortie prévue', 'pas de hausse automatique'], missing: [] };
}
