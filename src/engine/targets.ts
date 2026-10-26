// Cibles calculées par l'app à partir des données de l'utilisateur : eau, calories, course.
// Ce sont des estimations issues de formules publiques, jamais des mesures ni des prescriptions médicales.
// Chaque cible renvoie sa justification (« why ») pour être affichée telle quelle.

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
  const factor = activityFactor(i.sessionsPerWeek);
  const maintenance = bmr * factor;
  const strategy = strategyOf(i);
  const why = [`Mifflin-St Jeor ${Math.round(bmr)} kcal`, `× ${fmt(factor, 3)} (${i.sessionsPerWeek ?? 0} séances/sem.) = maintien estimé`];
  const pct = strategy === 'développement' ? 0.05 : strategy === 'réduction' ? -0.12 : 0;
  if (pct) why.push(`${strategy} : ${pct > 0 ? '+' : '−'}${Math.round(Math.abs(pct) * 100)} %`);
  else why.push('maintien : observation avant de décider');
  const adjusted = (i.adjustments ?? []).reduce((t, a) => t + a.delta, 0);
  for (const a of i.adjustments ?? []) why.push(`${a.delta > 0 ? '+' : '−'} ${Math.abs(a.delta)} kcal (${a.at}) : ${a.reason}`);
  const kcal = roundTo(maintenance * (1 + pct) + adjusted, 50);
  const perKg = strategy === 'réduction' ? 2.0 : 1.8;
  const proteinG = Math.round(perKg * i.weightKg!);
  const fatG = Math.round(Math.max(0.8 * i.weightKg!, (kcal * 0.25) / 9));
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  why.push(`protéines ${fmt(perKg, 1)} g/kg = ${proteinG} g · lipides ${fatG} g · glucides ${carbG} g`);
  return { value: { kcal, proteinG, fatG, carbG, maintenance: roundTo(maintenance, 50), strategy, adjusted }, why, missing: [] };
}

/**
 * Bilan calorique : seulement après ≥ 14 jours depuis le dernier changement et ≥ 3 pesées par semaine sur 2 semaines.
 * Fourchettes de rythme (choix de conception) : réduction −0,25 à −1 %/sem. ; développement +0,1 à +0,35 kg/sem. ;
 * maintien ±0,25 kg/sem. Pas de 125 kcal. Données insuffisantes → aucun changement, « bilan incertain ».
 */
export function reviewCalories(strategy: Strategy, weights: { day: string; kg: number }[], today: string, lastChange?: string): { delta: number; reason: string; uncertain: boolean } {
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
  if (strategy === 'réduction') {
    if (pct > -0.25) return { delta: -125, reason: `Poids ${sign}${fmt(kg)} kg/sem. : la baisse est trop lente.`, uncertain: false };
    if (pct < -1) return { delta: 125, reason: `Poids ${fmt(kg)} kg/sem. : la baisse est trop rapide (muscle à protéger).`, uncertain: false };
  } else if (strategy === 'développement') {
    if (kg < 0.1) return { delta: 125, reason: `Poids ${sign}${fmt(kg)} kg/sem. : pas assez d’énergie pour construire.`, uncertain: false };
    if (kg > 0.35) return { delta: -125, reason: `Poids +${fmt(kg)} kg/sem. : prise trop rapide.`, uncertain: false };
  } else if (Math.abs(kg) > 0.25) {
    return { delta: kg > 0 ? -125 : 125, reason: `Poids ${sign}${fmt(kg)} kg/sem. alors que l’objectif est le maintien.`, uncertain: false };
  }
  return { delta: 0, reason: `Rythme ${sign}${fmt(kg)} kg/sem. conforme : on ne change rien.`, uncertain: false };
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

export type RunMove = 'départ' | 'hausse' | 'maintien' | 'reprise';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const roundHalf = (n: number) => Math.round(n * 2) / 2;

/**
 * Prochaine course : +10 % sur la plus longue course récente si l'effort était raisonnable,
 * maintien si la dernière était très dure, baisse après une longue pause.
 */
export function runTarget(runs: RunEntry[], today: string): Computed<{ km: number; move: RunMove }> {
  const past = runs.filter((r) => r.day <= today).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.at - b.at));
  const last = past[past.length - 1];
  if (!last) return { value: { km: 3, move: 'départ' }, why: ['aucune course enregistrée', 'départ 3 km'], missing: [] };

  const gap = daysBetween(last.day, today);
  if (gap > 14) {
    const km = Math.max(2, roundHalf(last.km * 0.8));
    return { value: { km, move: 'reprise' }, why: [`dernière course il y a ${gap} j`, `${fmt(last.km)} km × 0,8`], missing: [] };
  }
  if (last.effort !== undefined && last.effort >= 9) {
    return { value: { km: last.km, move: 'maintien' }, why: [`dernière ${fmt(last.km)} km`, `effort ${last.effort}/10 : on consolide`], missing: [] };
  }
  const recent = past.filter((r) => daysBetween(r.day, today) <= 14);
  const best = Math.max(...recent.map((r) => r.km));
  const km = Math.max(roundHalf(best * 1.1), best + 0.5);
  return {
    value: { km, move: 'hausse' },
    why: [`plus longue sur 14 j : ${fmt(best)} km`, last.effort !== undefined ? `effort ${last.effort}/10` : 'effort non noté', '+10 %'],
    missing: [],
  };
}
