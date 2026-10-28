// Dépense énergétique : activité de la journée (hors séances) + entraînement ajouté à part, sans double comptage.
// Estimation issue de formules publiques et de choix de conception (marqués), jamais une mesure.

export type SitBand = '<6' | '6-9' | '9-12' | '>12';

export const SIT_LABELS: Record<SitBand, string> = { '<6': 'moins de 6 h', '6-9': '6 à 9 h', '9-12': '9 à 12 h', '>12': 'plus de 12 h' };

/** Activité de la journée, hors séances. Une valeur absente reste inconnue (jamais 0). */
export interface ActivityAnswers {
  /** Heures assises par jour (travail, transports, loisirs). */
  sitHours?: SitBand;
  /** Pas moyens par jour, mesurés les jours SANS séance. Ils comprennent déjà la marche et le tapis. */
  steps?: number;
  /** Tapis de marche : minutes par jour de télétravail (compté seulement si les pas sont inconnus). */
  treadmillMin?: number;
  /** Trajets à pied ou à vélo : minutes par jour de travail (compté seulement si les pas sont inconnus). */
  walkCommuteMin?: number;
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

/** Base de la journée selon les pas (hors séances), choix de conception. */
function stepsPal(steps: number): number {
  if (steps >= 10_000) return 1.5;
  if (steps >= 7_500) return 1.4;
  if (steps >= 5_000) return 1.3;
  return 1.2;
}

const round50 = (n: number) => Math.round(n / 50) * 50;
const fmt = (n: number) => n.toLocaleString('fr-BE', { maximumFractionDigits: 2 });

/** Une activité est connue dès que les heures assises ou les pas sont renseignés. */
export function hasActivity(a?: ActivityAnswers): boolean {
  return !!a && (a.sitHours !== undefined || a.steps !== undefined);
}

/**
 * Maintien = métabolisme de base × base de la journée + marche supplémentaire + entraînement (net du repos).
 * Pas de double comptage : les pas, mesurés hors séances, contiennent déjà la marche et le tapis ; l'entraînement
 * est ajouté une seule fois, en kcal nettes (au-dessus du repos).
 * Choix de conception : musculation 3 MET nets, tapis 1,8 MET net, trajets actifs 2,5 MET nets, course 0,9 kcal/kg/km.
 */
export function estimateEnergy(i: { bmr: number; weightKg: number; activity?: ActivityAnswers; training: Training; treadmillDaysPerWeek?: number; workDaysPerWeek?: number }): EnergyEstimate | undefined {
  const a = i.activity;
  if (!hasActivity(a)) return undefined;
  const w = i.weightKg;
  const lines: string[] = [`métabolisme de base ${Math.round(i.bmr)} kcal`];
  const notes: string[] = [];
  let pal: number;
  let extra = 0;
  if (a!.steps !== undefined) {
    pal = stepsPal(a!.steps);
    lines.push(`${a!.steps.toLocaleString('fr-BE')} pas/jour hors séances → base × ${fmt(pal)}`);
    notes.push('Les pas comptent déjà la marche et le tapis : ils ne sont pas ajoutés une seconde fois.');
  } else {
    pal = SIT_PAL[a!.sitHours!];
    lines.push(`assis ${SIT_LABELS[a!.sitHours!]} par jour → base × ${fmt(pal)}`);
    const tm = ((a!.treadmillMin ?? 0) * (i.treadmillDaysPerWeek ?? 0)) / 7;
    const wc = ((a!.walkCommuteMin ?? 0) * (i.workDaysPerWeek ?? 0)) / 7;
    const walk = (1.8 * w * tm) / 60 + (2.5 * w * wc) / 60;
    if (walk > 0) {
      extra += walk;
      lines.push(`+ ${Math.round(walk)} kcal de marche (tapis, trajets)`);
    }
    if (a!.treadmillMin === undefined) notes.push('Tapis de marche non renseigné : non compté.');
  }
  const strength = (3 * w * (i.training.strengthMinPerWeek / 60)) / 7;
  const run = (0.9 * w * i.training.runKmPerWeek) / 7;
  if (strength > 0) lines.push(`+ ${Math.round(strength)} kcal de musculation (${Math.round(i.training.strengthMinPerWeek)} min/sem.)`);
  if (run > 0) lines.push(`+ ${Math.round(run)} kcal de course (${fmt(i.training.runKmPerWeek)} km/sem.)`);
  const maintenance = round50(i.bmr * pal + extra + strength + run);
  lines.push(`= maintien estimé ${maintenance} kcal`);
  notes.push('Estimation : l’écart réel peut être important. Elle se corrige avec ton poids et ton alimentation réellement notée.');
  return { maintenance, lines, notes };
}
