// Bilan d'activité du jour : ce que tu as enregistré, estimé par le coach. Un bilan, jamais une nouvelle cible alimentaire.
// Saisie manuelle : tout est « déclaré ». Rien n'est remplacé en silence ; les incohérences sont signalées.

import { walkKcalPerMin, type TreadmillUse } from './activity';

/** Longueur de pas supposée pour convertir pas et distance : une hypothèse, jamais une mesure. */
export const STRIDE_M = 0.75;

export interface DayActivityInput {
  weightKg: number;
  /** Pas saisis : « montre » en mode séparé (hors tapis), total quotidien en mode total. */
  steps?: number;
  treadmillSteps?: number;
  mode?: 'separe' | 'total';
  /** Mode total : ce que le total comprend déjà. */
  includes?: ('tapis' | 'courses')[];
  measured?: boolean;
  /** Journée terminée (sinon partielle : on ne conclut pas sur une journée en cours). */
  final?: boolean;
  /** Réglages du tapis (profil) : vitesse, inclinaison, durée habituelle. */
  treadmill?: TreadmillUse;
  /** Courses enregistrées aujourd'hui, en km. */
  runKm?: number;
}

export interface DayActivityReport {
  status: 'partielle' | 'terminée';
  totalSteps?: number;
  /** kcal nettes (au-dessus du repos) de l'activité enregistrée ; jamais un crédit alimentaire. */
  kcal: number;
  lines: string[];
  missing: string[];
  /** Incohérences signalées : les données saisies ne sont jamais remplacées en silence. */
  issues: string[];
}

const fmt = (n: number) => n.toLocaleString('fr-BE', { maximumFractionDigits: 1 });
const stepKcal = (w: number) => (0.5 * w * STRIDE_M) / 1000;

/** Total de pas du jour selon le mode (jamais deux fois le tapis en mode total). */
export function totalSteps(d: { steps?: number; treadmillSteps?: number; mode?: 'separe' | 'total' }): number | undefined {
  if (d.steps === undefined && d.treadmillSteps === undefined) return undefined;
  return d.mode === 'total' ? d.steps : (d.steps ?? 0) + (d.treadmillSteps ?? 0);
}

export function dayActivityReport(i: DayActivityInput): DayActivityReport {
  const w = i.weightKg;
  const lines: string[] = [];
  const missing: string[] = [];
  const issues: string[] = [];
  const total = i.mode === 'total';
  const inc = new Set(i.includes ?? []);
  const tag = i.measured === false ? 'estimés' : 'déclarés';
  let kcal = 0;

  if (total) {
    if (i.steps === undefined) missing.push('total de pas du jour');
    else {
      kcal += i.steps * stepKcal(w);
      lines.push(`${i.steps.toLocaleString('fr-BE')} pas au total (${tag}${inc.size ? `, comprend : ${[...inc].join(', ')}` : ', sans précision sur ce qu’il comprend'}) → ≈ ${Math.round(i.steps * stepKcal(w))} kcal`);
      if (i.treadmillSteps) issues.push('Pas du tapis ignorés en mode total (déjà compris dans le total) : rien n’est compté deux fois.');
      if (!inc.size) missing.push('ce que le total comprend (tapis, courses)');
      if (inc.has('courses')) issues.push('Courses comptées comme de la marche dans les pas : leur dépense réelle est sous-estimée.');
    }
  } else {
    if (i.steps === undefined) missing.push('pas hors tapis (montre)');
    else {
      kcal += i.steps * stepKcal(w);
      lines.push(`${i.steps.toLocaleString('fr-BE')} pas hors tapis (${tag}) → ≈ ${Math.round(i.steps * stepKcal(w))} kcal`);
    }
    if (i.treadmillSteps !== undefined) {
      const t = i.treadmill;
      const speed = t?.speedKmh;
      const perKm = speed ? (walkKcalPerMin(w, speed, t?.inclinePct ?? 0) * 60) / speed : 0.5 * w;
      const dist = (i.treadmillSteps * STRIDE_M) / 1000;
      const k = dist * perKm;
      kcal += k;
      lines.push(
        `${i.treadmillSteps.toLocaleString('fr-BE')} pas de tapis (${tag}) ≈ ${fmt(dist)} km (pas de ${STRIDE_M.toLocaleString('fr-BE')} m supposé) → ≈ ${Math.round(k)} kcal${speed ? ` à ${fmt(speed)} km/h${t?.speedShown === false ? ' (estimés)' : ''}` : ' (vitesse inconnue : coût moyen de marche)'}`,
      );
      if (t?.minutes && speed && i.final) {
        const expected = (t.minutes * speed * 1000) / 60 / STRIDE_M;
        if (Math.abs(i.treadmillSteps - expected) / expected > 0.3) {
          issues.push(
            `Tes pas de tapis (${i.treadmillSteps.toLocaleString('fr-BE')}) s’écartent de ce que donnent ${t.minutes} min à ${fmt(speed)} km/h (≈ ${Math.round(expected).toLocaleString('fr-BE')} pas, longueur de pas supposée). Rien n’est modifié : vérifie la durée, la vitesse ou le compteur.`,
          );
        }
      }
    }
  }
  if (i.runKm && !(total && inc.has('courses'))) {
    const k = 0.9 * w * i.runKm;
    kcal += k;
    lines.push(`course : ${fmt(i.runKm)} km → ≈ ${Math.round(k)} kcal (comptée à part)`);
  }
  const status = i.final ? 'terminée' : 'partielle';
  if (!i.final) lines.push('Journée en cours : bilan partiel, rien n’est conclu avant la fin.');
  return { status, totalSteps: totalSteps({ steps: i.steps, treadmillSteps: i.treadmillSteps, mode: i.mode }), kcal: Math.round(kcal), lines, missing, issues };
}
