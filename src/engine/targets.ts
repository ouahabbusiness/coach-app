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
}

export interface CalorieTarget {
  kcal: number;
  proteinG: number;
  maintenance: number;
}

/** Facteur d'activité selon les séances par semaine (barème classique Harris-Benedict / Mifflin). */
export function activityFactor(sessionsPerWeek = 0): number {
  if (sessionsPerWeek >= 6) return 1.725;
  if (sessionsPerWeek >= 4) return 1.55;
  if (sessionsPerWeek >= 1) return 1.375;
  return 1.2;
}

/** Calories du jour : Mifflin-St Jeor × activité, ajustées à l'objectif puis à la tendance du poids. */
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
  const why = [`Mifflin-St Jeor ${Math.round(bmr)} kcal`, `× ${fmt(factor, 3)} (${i.sessionsPerWeek ?? 0} séances/sem.)`];

  let adjust = 0;
  if (i.goal === 'perte_de_graisse') adjust = -Math.min(500, maintenance * 0.2);
  else if (i.goal === 'recomposition') adjust = -maintenance * 0.1;
  else if (i.goal === 'muscle') adjust = Math.min(300, maintenance * 0.1);
  if (adjust) why.push(`${adjust > 0 ? '+' : '−'} ${Math.round(Math.abs(adjust))} kcal objectif`);

  // Les données réelles corrigent la formule : le poids ne bouge pas dans le sens voulu → on ajuste.
  if ((i.goal === 'perte_de_graisse' || i.goal === 'recomposition') && (i.trend === 'stable' || i.trend === 'hausse')) {
    adjust -= 150;
    why.push(`− 150 kcal : poids ${i.trend} sur 7 j`);
  } else if (i.goal === 'muscle' && i.trend === 'baisse') {
    adjust += 150;
    why.push('+ 150 kcal : poids en baisse sur 7 j');
  }

  const proteinG = Math.round(1.8 * i.weightKg!);
  why.push(`protéines 1,8 g/kg = ${proteinG} g`);
  return { value: { kcal: roundTo(maintenance + adjust, 50), proteinG, maintenance: roundTo(maintenance, 50) }, why, missing: [] };
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
