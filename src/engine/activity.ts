// Dépense énergétique : activité de la journée, tapis de marche, musculation et course, chacun compté UNE fois.
// Estimation issue de formules publiques et de choix de conception (marqués), jamais une mesure.

export type SitBand = '<6' | '6-9' | '9-12' | '>12';

export const SIT_LABELS: Record<SitBand, string> = { '<6': 'moins de 6 h', '6-9': '6 à 9 h', '9-12': '9 à 12 h', '>12': 'plus de 12 h' };

/** Marche volontaire sur tapis : ce que tu fais réellement, pas ton objectif. */
export interface TreadmillUse {
  /** Jours réellement faits dans une semaine habituelle. */
  daysPerWeek?: number;
  /** Minutes réellement faites les jours habituels. */
  minutes?: number;
  /** Parmi ces jours, ceux où c'est plus court (facultatif) : la variation est comptée, pas lissée en silence. */
  shortDays?: number;
  shortMinutes?: number;
  speedKmh?: number;
  /** Vitesse lue sur le tapis (true) ou estimée (false). */
  speedShown?: boolean;
  inclinePct?: number;
}

/**
 * Activité de la journée. Une valeur absente reste inconnue (jamais 0).
 * Version 2 : les pas sont ceux de la vie quotidienne, HORS tapis et HORS course ; le tapis se déclare à part.
 */
export interface ActivityAnswers {
  v?: 2;
  sitHours?: SitBand;
  /** Pas moyens par jour, hors tapis et hors course. */
  steps?: number;
  /** Total mesuré (montre, iPhone) ou estimé. */
  stepsMeasured?: boolean;
  treadmill?: TreadmillUse;
  at?: number;
}

export interface Training {
  strengthMinPerWeek: number;
  runKmPerWeek: number;
}

export interface EnergyEstimate {
  /** Maintien estimé, kcal par jour, arrondi à 50. */
  maintenance: number;
  lines: string[];
  notes: string[];
}

const SIT_PAL: Record<SitBand, number> = { '<6': 1.45, '6-9': 1.35, '9-12': 1.3, '>12': 1.25 };

/** Base de la journée selon les pas du quotidien, sans sport ni tapis (choix de conception). */
function stepsPal(steps: number): number {
  if (steps >= 10_000) return 1.5;
  if (steps >= 7_500) return 1.4;
  if (steps >= 5_000) return 1.3;
  return 1.2;
}

const DEFAULT_SPEED_KMH = 4.5;
const round50 = (n: number) => Math.round(n / 50) * 50;
const fmt = (n: number) => n.toLocaleString('fr-BE', { maximumFractionDigits: 2 });

/** Les réponses d'avant la version 2 décrivaient un total de pas ambigu : elles ne servent plus au calcul. */
export function usableActivity(a?: ActivityAnswers): ActivityAnswers | undefined {
  return a && a.v === 2 ? a : undefined;
}

/** Une activité est connue dès que les heures assises ou les pas du quotidien sont renseignés. */
export function hasActivity(a?: ActivityAnswers): boolean {
  return !!usableActivity(a) && (a!.sitHours !== undefined || a!.steps !== undefined);
}

/** Dépense nette de la marche (équation de marche ACSM) : kcal par minute au-dessus du repos. */
export function walkKcalPerMin(weightKg: number, speedKmh: number, inclinePct = 0): number {
  const speed = (speedKmh * 1000) / 60; // m/min
  const vo2 = 0.1 * speed + 1.8 * speed * (inclinePct / 100); // ml/kg/min nets
  return (vo2 * weightKg * 5) / 1000;
}

/**
 * Maintien = métabolisme de base × base de la journée (sans sport ni tapis) + tapis + musculation + course.
 * Pas de doublon par construction : les pas du quotidien excluent le tapis et la course, qui sont comptés à part.
 * Marche et course ne sont pas interchangeables : la marche suit l'équation de marche (vitesse, inclinaison), la course
 * un coût par km. Choix de conception : musculation 3 MET nets, course 0,9 kcal/kg/km.
 */
export function estimateEnergy(i: { bmr: number; weightKg: number; activity?: ActivityAnswers; training: Training }): EnergyEstimate | undefined {
  if (!hasActivity(i.activity)) return undefined;
  const a = i.activity!;
  const w = i.weightKg;
  const lines: string[] = [`métabolisme de base ${Math.round(i.bmr)} kcal (formule)`];
  const notes: string[] = [];
  let pal: number;
  if (a.steps !== undefined) {
    pal = stepsPal(a.steps);
    lines.push(`vie quotidienne : ${a.steps.toLocaleString('fr-BE')} pas/jour hors tapis et hors course (${a.stepsMeasured === false ? 'estimés' : 'mesurés'}) → base × ${fmt(pal)}`);
    if (a.stepsMeasured === false) notes.push('Pas estimés : marge d’erreur plus large.');
  } else {
    pal = SIT_PAL[a.sitHours!];
    lines.push(`assis ${SIT_LABELS[a.sitHours!]} par jour → base × ${fmt(pal)} (estimation)`);
  }
  let tread = 0;
  const t = a.treadmill;
  if (t?.daysPerWeek && t.minutes) {
    const speed = t.speedKmh ?? DEFAULT_SPEED_KMH;
    const perMin = walkKcalPerMin(w, speed, t.inclinePct ?? 0);
    const short = Math.min(t.shortDays ?? 0, t.daysPerWeek);
    const weeklyMin = (t.daysPerWeek - short) * t.minutes + (short && t.shortMinutes !== undefined ? short * t.shortMinutes : short * t.minutes);
    tread = (perMin * weeklyMin) / 7;
    const detail = short && t.shortMinutes !== undefined ? `${t.daysPerWeek - short} j × ${t.minutes} min + ${short} j × ${t.shortMinutes} min` : `${t.daysPerWeek} j × ${t.minutes} min`;
    lines.push(`tapis : ${detail} par semaine à ${fmt(speed)} km/h${t.speedKmh !== undefined ? (t.speedShown === false ? ' (estimés)' : t.speedShown === true ? ' (affichés)' : '') : ''}${t.inclinePct ? `, ${fmt(t.inclinePct)} %` : ''} → +${Math.round(tread)} kcal/jour (moyenne sur la semaine)`);
    if (t.speedKmh === undefined) notes.push(`Vitesse du tapis non renseignée : ${fmt(DEFAULT_SPEED_KMH)} km/h supposés.`);
    if (t.speedKmh !== undefined && t.speedShown === false) notes.push('Vitesse estimée : marge d’erreur plus large sur le tapis.');
  } else {
    notes.push('Tapis non renseigné (jours et durée réels) : non compté.');
  }
  const strength = (3 * w * (i.training.strengthMinPerWeek / 60)) / 7;
  const run = (0.9 * w * i.training.runKmPerWeek) / 7;
  if (strength > 0) lines.push(`musculation : ${Math.round(i.training.strengthMinPerWeek)} min/sem. → +${Math.round(strength)} kcal/jour (moyenne sur la semaine, pas par séance)`);
  if (run > 0) lines.push(`course : ${fmt(i.training.runKmPerWeek)} km/sem. → +${Math.round(run)} kcal/jour (comptée à part : la course n’est pas dans les pas)`);
  const maintenance = round50(i.bmr * pal + tread + strength + run);
  lines.push(`= maintien estimé ${maintenance} kcal (arrondi à 50 : estimation, pas mesure)`);
  notes.push('Marche et course sont comptées différemment et jamais deux fois. L’écart réel peut être important : la cible se corrige avec ton poids et ton alimentation réellement notée.');
  return { maintenance, lines, notes };
}
