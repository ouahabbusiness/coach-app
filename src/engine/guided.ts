// Course guidée (façon Runna) : la séance du programme devient une suite d'étapes annoncées à voix haute.
// Allures cibles tirées de tes courses passées ; sans historique, on guide à l'effort (jamais d'allure inventée).

import type { RunEntry } from './targets';

export type StepKind = 'echauffement' | 'effort' | 'recup' | 'retour' | 'continu';

export interface GuidedStep {
  kind: StepKind;
  label: string;
  meters?: number;
  seconds?: number;
  /** Allure cible en s/km, si connue. */
  pace?: number;
  /** Repère d'effort quand l'allure est inconnue. */
  effort?: string;
}

export interface Paces {
  easy?: number;
  fast?: number;
}

/** Allures de référence : la meilleure allure récente (≥ 3 km) sert de base. */
export function pacesFrom(runs: RunEntry[]): Paces {
  const timed = runs.filter((r) => r.minutes && r.km >= 3).map((r) => Math.round((r.minutes! * 60) / r.km));
  if (!timed.length) return {};
  const best = Math.min(...timed);
  return { easy: best + 60, fast: best - 20 };
}

/** Étapes d'une course du programme, d'après son titre (« fractionné 6 × 400 m », « endurance 5 km »…). */
export function stepsFor(item: { title: string; km?: number; detail?: string }, p: Paces): GuidedStep[] {
  const interval = item.title.match(/(\d+)\s*×\s*(\d+(?:[.,]\d+)?)\s*(m|km)\b/i);
  if (interval) {
    const n = Number(interval[1]);
    const dist = Number(interval[2]!.replace(',', '.')) * (interval[3]!.toLowerCase() === 'km' ? 1000 : 1);
    const rec = /2 min/.test(item.detail ?? '') ? 120 : 90;
    const fast = dist >= 1000 && p.fast ? p.fast + 10 : p.fast;
    const steps: GuidedStep[] = [{ kind: 'echauffement', label: 'Échauffement', seconds: 600, pace: p.easy, effort: p.easy ? undefined : 'facile, tu peux parler' }];
    for (let i = 1; i <= n; i++) {
      steps.push({ kind: 'effort', label: `Effort ${i}/${n} · ${dist >= 1000 ? `${dist / 1000} km` : `${dist} m`}`, meters: dist, pace: fast, effort: fast ? undefined : '8/10, vite mais contrôlé' });
      if (i < n) steps.push({ kind: 'recup', label: `Récup ${rec} s`, seconds: rec, effort: 'trot très lent' });
    }
    steps.push({ kind: 'retour', label: 'Retour au calme', seconds: 300, effort: 'très facile' });
    return steps;
  }
  if (item.km) {
    const test = /test|chrono/i.test(item.title);
    return [{ kind: 'continu', label: test ? `Test ${item.km} km` : `${item.km.toLocaleString('fr-BE')} km`, meters: item.km * 1000, pace: test ? undefined : p.easy, effort: test ? 'à fond, régulier' : p.easy ? undefined : 'facile, tu peux parler' }];
  }
  return [];
}

export interface GuideState {
  index: number;
  /** Distance (m) et temps (s) au début de l'étape en cours. */
  startM: number;
  startS: number;
}

/**
 * Fait avancer la séance guidée : une étape se termine quand sa distance ou sa durée est atteinte.
 * Renvoie le nouvel état et, si on change d'étape, l'étape qui commence (pour l'annoncer). `index === steps.length` = terminé.
 */
export function advance(steps: GuidedStep[], st: GuideState, meters: number, seconds: number): { state: GuideState; started?: GuidedStep; finished?: boolean } {
  const cur = steps[st.index];
  if (!cur) return { state: st };
  const doneM = meters - st.startM;
  const doneS = seconds - st.startS;
  const over = (cur.meters !== undefined && doneM >= cur.meters) || (cur.seconds !== undefined && doneS >= cur.seconds);
  if (!over) return { state: st };
  const next: GuideState = { index: st.index + 1, startM: meters, startS: seconds };
  return { state: next, started: steps[next.index], finished: next.index >= steps.length };
}

/** Phrase annoncée au début d'une étape. */
export function announce(step: GuidedStep): string {
  const pace = step.pace ? `, allure ${Math.floor(step.pace / 60)} minutes ${step.pace % 60 ? String(step.pace % 60) : ''}` : step.effort ? `, ${step.effort}` : '';
  return `${step.label}${pace}`;
}
