// Course d'initiation : première course dans l'app, NON maximale, pour connaître ton niveau réel.
// Protocole (choix de conception) : 5 min de marche rapide, 20 min de course facile (tu peux parler en phrases,
// marche autorisée si besoin), 5 min de marche. Tout est mesuré par le GPS ou déclaré par toi, avec sa source.
// La fréquence cardiaque n'est PAS lue automatiquement (impossible pour une app web) : tu la recopies depuis la montre.

import type { GuidedStep } from './guided';
import { haversine } from './runTrack';

export const INITIATION_STEPS: GuidedStep[] = [
  { kind: 'echauffement', label: 'Échauffement · marche rapide', seconds: 300, effort: 'marche rapide, bras actifs' },
  { kind: 'continu', label: 'Course facile · 20 min', seconds: 1200, effort: 'facile : tu peux parler en phrases ; marche si besoin, puis reprends' },
  { kind: 'retour', label: 'Retour au calme · marche', seconds: 300, effort: 'marche tranquille' },
];

/** Point gardé : [lat, lon, t (ms epoch), précision (m)]. */
export type RunPoint = [number, number, number, number];

export interface InitiationInput {
  /** Segments (une pause coupe le tracé). */
  segments: RunPoint[][];
  /** Début de chaque étape (ms epoch), dans l'ordre de INITIATION_STEPS. */
  marks: number[];
  /** Points GPS reçus mais écartés (précision > 30 m ou vitesse impossible). */
  rejected: number;
  /** Durée totale chronométrée (s), pauses exclues. */
  elapsedS: number;
  declared: {
    hrAvg?: number;
    hrMax?: number;
    /** Effort ressenti 1–10. */
    rpe?: number;
    talk?: 'phrases' | 'mots' | 'impossible';
    pain?: string;
  };
}

export type Source = 'mesuré (GPS)' | 'déclaré (montre)' | 'déclaré (toi)' | 'calculé' | 'inconnu';

export interface Metric {
  label: string;
  value: string;
  source: Source;
}

export interface Bucket {
  /** Début (s depuis le départ, pauses exclues). */
  s: number;
  /** Allure s/km sur 30 s (undefined si trop peu de distance). */
  pace?: number;
  walk: boolean;
  step: number;
}

export interface InitiationReport {
  metrics: Metric[];
  buckets: Bucket[];
  splits: number[];
  /** Allure facile de référence (s/km) et son statut. */
  easyPace?: number;
  easyStatus: 'référence' | 'à confirmer' | 'inconnue';
  walkBreaks: number;
  walkSeconds: number;
  /** Variation d'allure 2e moitié vs 1re moitié de la course (en %, + = plus lent). */
  driftPct?: number;
  gpsQuality: 'bonne' | 'moyenne' | 'faible';
  findings: string[];
  next: { title: string; detail: string; why: string };
}

/** En dessous de 1,9 m/s (≈ 8:45/km) sur 30 s : considéré comme de la marche (choix de conception). */
export const WALK_MS = 1.9;
const BUCKET_S = 30;

const fmt = (s?: number) => (s === undefined ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

export function analyzeInitiation(i: InitiationInput): InitiationReport {
  // Temps « en mouvement » continu à travers les segments (les pauses sont retirées).
  const pairs: { s: number; dt: number; d: number; t: number }[] = [];
  let clock = 0;
  for (const seg of i.segments) {
    for (let k = 1; k < seg.length; k++) {
      const a = seg[k - 1]!;
      const b = seg[k]!;
      const dt = (b[2] - a[2]) / 1000;
      if (dt <= 0) continue;
      pairs.push({ s: clock, dt, d: haversine({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }), t: a[2] });
      clock += dt;
    }
  }
  const stepOf = (t: number) => {
    let s = 0;
    i.marks.forEach((m, k) => {
      if (t >= m) s = k;
    });
    return s;
  };
  // Tranches de 30 s : distance et temps cumulés, puis allure et marche.
  const acc30 = new Map<number, { d: number; t: number; step: number }>();
  for (const p of pairs) {
    const k = Math.floor(p.s / BUCKET_S);
    const a = acc30.get(k) ?? { d: 0, t: 0, step: stepOf(p.t) };
    a.d += p.d;
    a.t += p.dt;
    acc30.set(k, a);
  }
  const clean: Bucket[] = [...acc30.entries()]
    .sort(([x], [y]) => x - y)
    .map(([k, a]) => ({ s: k * BUCKET_S, step: a.step, pace: a.d >= 30 ? Math.round(a.t / (a.d / 1000)) : undefined, walk: (a.t > 0 ? a.d / a.t : 0) < WALK_MS }));

  // Portion « course » (étape 2) uniquement pour juger le niveau.
  const run = clean.filter((b) => b.step === 1);
  const running = run.filter((b) => !b.walk && b.pace !== undefined);
  let walkBreaks = 0;
  run.forEach((b, k) => {
    if (b.walk && (k === 0 || !run[k - 1]!.walk)) walkBreaks++;
  });
  const walkSeconds = run.filter((b) => b.walk).length * BUCKET_S;
  const easyPace = median(running.map((b) => b.pace!));
  const half = Math.floor(running.length / 2);
  const p1 = median(running.slice(0, half).map((b) => b.pace!));
  const p2 = median(running.slice(half).map((b) => b.pace!));
  const driftPct = p1 && p2 && running.length >= 8 ? Math.round(((p2 - p1) / p1) * 1000) / 10 : undefined;

  // Distance totale et temps par km (toute la course).
  const meters = pairs.reduce((t, p) => t + p.d, 0);
  const runMeters = pairs.filter((p) => stepOf(p.t) === 1).reduce((t, p) => t + p.d, 0);
  const splits: number[] = [];
  let acc = 0;
  let kmStart = 0;
  for (const p of pairs) {
    const before = acc;
    acc += p.d;
    if (Math.floor(acc / 1000) > Math.floor(before / 1000)) {
      splits.push(Math.round(p.s + p.dt - kmStart));
      kmStart = p.s + p.dt;
    }
  }

  const kept = i.segments.reduce((t, s) => t + s.length, 0);
  const rejRatio = kept + i.rejected ? i.rejected / (kept + i.rejected) : 1;
  const accMed = median(i.segments.flat().map((p) => p[3]));
  const gpsQuality: InitiationReport['gpsQuality'] = rejRatio > 0.2 || (accMed ?? 99) > 20 ? 'faible' : rejRatio > 0.08 || (accMed ?? 99) > 12 ? 'moyenne' : 'bonne';

  const d = i.declared;
  const runMinutes = run.length * (BUCKET_S / 60);
  const easyStatus: InitiationReport['easyStatus'] =
    easyPace === undefined ? 'inconnue' : d.talk === 'phrases' && (d.rpe ?? 10) <= 6 && running.length * BUCKET_S >= 600 && gpsQuality !== 'faible' ? 'référence' : 'à confirmer';

  const metrics: Metric[] = [
    { label: 'Distance totale', value: `${(meters / 1000).toFixed(2).replace('.', ',')} km`, source: 'mesuré (GPS)' },
    { label: 'Distance en course (20 min)', value: `${(runMeters / 1000).toFixed(2).replace('.', ',')} km`, source: 'mesuré (GPS)' },
    { label: 'Durée chronométrée', value: fmt(i.elapsedS), source: 'mesuré (GPS)' },
    { label: 'Allure facile (médiane, hors marche)', value: easyPace ? `${fmt(easyPace)}/km` : 'inconnue', source: easyPace ? 'calculé' : 'inconnu' },
    { label: 'Passages en marche pendant la course', value: `${walkBreaks} (≈ ${Math.round(walkSeconds / 60)} min)`, source: 'calculé' },
    { label: 'Dérive d’allure 2e moitié', value: driftPct === undefined ? 'inconnue (trop peu de données)' : `${driftPct > 0 ? '+' : ''}${String(driftPct).replace('.', ',')} %`, source: driftPct === undefined ? 'inconnu' : 'calculé' },
    { label: 'FC moyenne', value: d.hrAvg ? `${d.hrAvg} bpm` : 'non renseignée', source: d.hrAvg ? 'déclaré (montre)' : 'inconnu' },
    { label: 'FC max', value: d.hrMax ? `${d.hrMax} bpm` : 'non renseignée', source: d.hrMax ? 'déclaré (montre)' : 'inconnu' },
    { label: 'Effort ressenti', value: d.rpe ? `${d.rpe}/10` : 'non renseigné', source: d.rpe ? 'déclaré (toi)' : 'inconnu' },
    { label: 'Test de la parole', value: d.talk === 'phrases' ? 'phrases complètes' : d.talk === 'mots' ? 'quelques mots' : d.talk === 'impossible' ? 'impossible de parler' : 'non renseigné', source: d.talk ? 'déclaré (toi)' : 'inconnu' },
    { label: 'Qualité GPS', value: `${gpsQuality} (${Math.round(rejRatio * 100)} % de points écartés, précision médiane ${accMed ? Math.round(accMed) : '—'} m)`, source: 'mesuré (GPS)' },
  ];

  const findings: string[] = [];
  if (runMinutes < 15) findings.push(`Partie course incomplète (${Math.round(runMinutes)} min sur 20) : niveau à confirmer.`);
  if (gpsQuality === 'faible') findings.push('GPS de mauvaise qualité (immeubles, arbres, poche) : distances et allures peu fiables.');
  if (walkBreaks) findings.push(`${walkBreaks} passage(s) en marche : normal en initiation, c’est une information, pas un échec.`);
  if (driftPct !== undefined && driftPct > 8) findings.push(`Tu as ralenti de ${String(driftPct).replace('.', ',')} % en 2e moitié : départ probablement trop rapide.`);
  if (driftPct !== undefined && driftPct < -5) findings.push('Tu as accéléré en 2e moitié : tu avais de la marge.');
  if (d.talk === 'impossible' || (d.rpe ?? 0) >= 8) findings.push('Effort trop élevé pour une course facile : les prochaines allures seront plus lentes.');
  if (d.hrAvg && d.hrMax && d.hrMax - d.hrAvg < 8) findings.push('FC max proche de la moyenne : vérifie les valeurs recopiées (montre bien serrée ?).');
  if (!d.hrAvg) findings.push('FC non renseignée : lance « Course extérieure » sur la montre la prochaine fois et recopie moyenne et max.');
  if (d.pain) findings.push(`Gêne signalée (${d.pain}) : pas de progression tant qu’elle n’est pas réévaluée.`);

  let next: InitiationReport['next'];
  if (d.pain) next = { title: 'Même séance, sans progression', detail: '20 min facile, marche libre', why: 'Gêne signalée : on ne monte pas.' };
  else if (walkBreaks >= 3 || (d.rpe ?? 0) >= 8 || d.talk === 'impossible' || runMinutes < 15)
    next = { title: 'Course-marche 8 × (2 min course / 1 min marche)', detail: 'Course à allure facile, marche active', why: 'Plusieurs passages en marche ou effort élevé : on construit la base en fractionnant.' };
  else if (walkBreaks >= 1 || (d.rpe ?? 0) >= 6 || d.talk === 'mots')
    next = { title: 'Course facile 20 min', detail: easyPace ? `vers ${fmt(easyPace + 15)}/km, marche autorisée` : 'à l’effort, marche autorisée', why: 'Bonne base, à consolider avant d’allonger.' };
  else next = { title: 'Course facile 22 min', detail: easyPace ? `vers ${fmt(easyPace)}/km` : 'à l’effort', why: 'Course continue et confortable : +10 % de durée.' };

  return { metrics, buckets: clean, splits, easyPace, easyStatus, walkBreaks, walkSeconds, driftPct, gpsQuality, findings, next };
}
