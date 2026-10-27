// Rapport de séance : texte clair à relire ou à partager. Rien n'est inventé : une valeur absente reste « — » (inconnu, pas zéro).
// Les premières séances sont des séances d'initiation : elles servent à calibrer, pas à juger la progression.

import { findVariant } from '../catalog/exercises';
import { currentResult, summarizeSession, timings } from './derive';
import type { SessionState, SetResult } from './types';

export type FeelLevel = 'tres-facile' | 'simple' | 'bien-dose' | 'dur' | 'trop-dur';

export const FEEL_LABELS: Record<FeelLevel, string> = {
  'tres-facile': 'Très facile',
  simple: 'Plutôt simple',
  'bien-dose': 'Bien dosée',
  dur: 'Dure',
  'trop-dur': 'Trop dure',
};

export interface SessionFeel {
  level: FeelLevel;
  /** Mot libre (ex. « classique »). */
  note?: string;
  at: number;
}

/** Nombre de premières séances considérées comme séances d'initiation (choix de conception, ajustable). */
export const INITIATION_SESSIONS = 3;

/** Rang (1, 2, 3…) de la séance parmi les séances enregistrées, de la plus ancienne à la plus récente ; seulement si c'est une séance d'initiation. */
export function initiationRank(sessions: { id: string; startedAt: number }[], id: string): number | undefined {
  const order = [...sessions].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  const i = order.findIndex((s) => s.id === id);
  return i >= 0 && i < INITIATION_SESSIONS ? i + 1 : undefined;
}

const mmss = (ms: number) => {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
};

const cell = (r: SetResult | undefined, kind: 'reps' | 'hold') => {
  if (!r) return '—';
  const v = kind === 'reps' ? (r.reps !== undefined ? `${r.reps}` : '—') : r.seconds !== undefined ? `${r.seconds} s` : '—';
  return [v, r.loadKg !== undefined ? `${r.loadKg} kg` : '', r.rir !== undefined ? `RIR ${r.rir}` : ''].filter(Boolean).join(' · ');
};

export function sessionReport(st: SessionState, opts: { feel?: SessionFeel; initiation?: number; activeKcal?: number; avgBpm?: number } = {}): string {
  const t = timings(st, st.endedAt ?? Date.now());
  const groups = summarizeSession(st);
  const done = st.sets.filter((s) => s.status === 'done').length;
  const date = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'full', timeStyle: 'short', timeZone: st.timeZone }).format(st.startedAt);
  const lines: string[] = [`Rapport de séance · ${st.plan.title}`, date, ''];

  if (opts.initiation) {
    lines.push(`Séance d'initiation ${opts.initiation}/${INITIATION_SESSIONS} : les charges et les répétitions servent à calibrer. Aucune conclusion sur la progression avant d'avoir plusieurs séances comparables.`, '');
  }

  lines.push(`Durée : ${mmss(t.totalMs)} (actif ${mmss(t.activeMs)}, repos ${mmss(t.restMs)})`);
  lines.push(`Séries : ${done}/${st.sets.length} faites`);
  if (opts.activeKcal !== undefined) lines.push(`Calories actives (montre) : ${opts.activeKcal} kcal`);
  if (opts.avgBpm !== undefined) lines.push(`Fréquence cardiaque moyenne (montre) : ${opts.avgBpm} bpm`);
  lines.push('');

  lines.push('Exercices (prévu → fait)');
  for (const g of groups) {
    const name = findVariant(g.variantId)?.variant.name ?? g.variantId;
    const cells = g.sets.map((s) => (s.status === 'skipped' ? 'passée' : s.status === 'pending' ? 'non faite' : cell(s.actual, s.planned.kind)));
    const planned = g.sets[0]!.planned;
    const target = planned.kind === 'reps' ? (planned.repRange ? `${planned.repRange[0]}–${planned.repRange[1]}` : `${planned.targetReps ?? '?'}`) : `${planned.targetSeconds ?? '?'} s`;
    lines.push(`- ${name} : ${g.sets.length} × ${target} → ${cells.join(' / ')}`);
  }

  const missing = groups.reduce((n, g) => n + g.missingResults, 0);
  const watch: string[] = [];
  if (missing > 0) watch.push(`${missing} série(s) sans résultat saisi : inconnu, pas zéro`);
  for (const p of st.pain) watch.push(`douleur signalée : ${p.location} ${p.intensity}/10 (${p.stop ? 'arrêt' : 'poursuite'})`);
  if (watch.length) lines.push('', 'À surveiller', ...watch.map((w) => `- ${w}`));

  lines.push('', 'Ressenti');
  lines.push(opts.feel ? `${FEEL_LABELS[opts.feel.level]}${opts.feel.note ? ` · « ${opts.feel.note} »` : ''}` : 'Non renseigné');
  lines.push('', 'Ce rapport décrit ce qui a été enregistré. Il ne pose aucun diagnostic.');
  return lines.join('\n');
}
