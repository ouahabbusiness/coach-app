// Gêne à l'épaule ou aux coudes : ce que tu déclares sert à choisir une adaptation de la prescription et à savoir quand consulter.
// L'app ne pose aucun diagnostic. Aucun seuil de douleur n'est une frontière médicale : les signaux d'alerte priment sur les scores.

export type JointZone = 'epaule' | 'coudes';
export type JointTrigger = 'tractions' | 'dips' | 'pompes' | 'developpe' | 'rowing' | 'autre' | 'inconnu';
export type JointAlert = 'faiblesse' | 'engourdissement' | 'blocage' | 'nuit';
export type JointTrend = 'mieux' | 'pareil' | 'pire';

export const ZONE_LABELS: Record<JointZone, string> = { epaule: 'Épaule', coudes: 'Coudes' };
export const TRIGGER_LABELS: Record<JointTrigger, string> = {
  tractions: 'Tractions',
  dips: 'Dips',
  pompes: 'Pompes',
  developpe: 'Développé, pike',
  rowing: 'Rowing',
  autre: 'Autre',
  inconnu: 'Je ne sais pas',
};
export const ALERT_LABELS: Record<JointAlert, string> = {
  faiblesse: 'Perte de force ou instabilité',
  engourdissement: 'Fourmillements, engourdissement',
  blocage: 'Bras bloqué ou choc récent',
  nuit: 'Douleur la nuit',
};
export const TREND_LABELS: Record<JointTrend, string> = { mieux: 'ça s’améliore', pareil: 'pareil', pire: 'ça empire' };

export interface JointAnswer {
  zone: JointZone;
  since?: '<1m' | '1-6m' | '>6m';
  freq?: 'rare' | 'parfois' | 'souvent';
  triggers: JointTrigger[];
  /** Douleur maximale ressentie, 0 à 10 : informative, jamais un seuil. */
  maxPain?: number;
  /** Le lendemain d'une séance. */
  next?: 'rien' | 'legere' | 'dure';
  trend?: JointTrend;
  alerts: JointAlert[];
}

export interface JointReferral {
  /** « urgent » : évaluation rapide ; « avis » : avis d'un médecin ou d'un kiné. */
  level: 'urgent' | 'avis';
  text: string;
}

export interface JointAdvice {
  referral?: JointReferral;
  /** Adaptation par mouvement déclencheur : à vérifier pendant la séance et le lendemain, pas une solution supposée sûre. */
  items: { zone: JointZone; text: string }[];
}

/** Variantes concernées par chaque mouvement déclencheur (expression sur l'identifiant de variante). */
export const TRIGGER_PATTERN: Partial<Record<JointTrigger, string>> = {
  tractions: 'pullup|chinup',
  dips: 'dips',
  pompes: 'pushup|pike',
  developpe: 'press|pike',
  rowing: 'row',
};

const FOR: Partial<Record<JointTrigger, string>> = {
  tractions: 'Tractions : marge de 3 répétitions, une série de moins, descente contrôlée. Retirer le lest ne garantit pas d’éviter la gêne : on vérifie.',
  dips: 'Dips : marge de 3 répétitions, une série de moins, jamais plus bas que l’épaule au niveau du coude. Les dips sur banc ne sont pas forcément plus doux pour l’épaule : à tester, pas à supposer.',
  pompes: 'Pompes : marge de 3 répétitions, une série de moins, amplitude confortable.',
  developpe: 'Développé, pike : marge de 3 répétitions, une série de moins, amplitude confortable.',
  rowing: 'Rowing : marge de 3 répétitions, une série de moins, épaule loin de l’oreille.',
};

export function jointAdvice(answers: JointAnswer[]): JointAdvice {
  const items: JointAdvice['items'] = [];
  const urgent: string[] = [];
  const avis: string[] = [];
  for (const a of answers) {
    const z = ZONE_LABELS[a.zone].toLowerCase();
    for (const t of a.triggers) {
      const text = FOR[t];
      if (text) items.push({ zone: a.zone, text });
    }
    if (a.triggers.length === 0 || a.triggers.every((t) => t === 'inconnu' || t === 'autre')) {
      items.push({ zone: a.zone, text: 'Mouvement déclencheur inconnu : note pendant quelle série la gêne apparaît. La séance n’est pas modifiée pour l’instant, la charge reste gelée.' });
    }
    // Signaux qui appellent une évaluation rapide, quel que soit le score de douleur.
    for (const al of a.alerts) if (al === 'faiblesse' || al === 'engourdissement' || al === 'blocage') urgent.push(`${z} : ${ALERT_LABELS[al].toLowerCase()}`);
    if (a.alerts.includes('nuit')) avis.push(`${z} : douleur la nuit`);
    if (a.trend === 'pire') avis.push(`${z} : ça empire`);
    if (a.next === 'dure') avis.push(`${z} : gêne qui dure le lendemain`);
    if (a.freq === 'souvent' && a.since && a.since !== '<1m') avis.push(`${z} : gêne fréquente depuis plus d’un mois`);
  }
  const uniq = [...new Map(items.map((i) => [`${i.zone}|${i.text}`, i])).values()];
  let referral: JointReferral | undefined;
  if (urgent.length) {
    referral = { level: 'urgent', text: `À faire évaluer rapidement par un médecin (${[...new Set(urgent)].join(' ; ')}). Si c’est soudain ou après un choc, consulte sans attendre. L’app ne pose pas de diagnostic.` };
  } else if (avis.length) {
    referral = { level: 'avis', text: `Un avis médical ou d’un kiné est recommandé (${[...new Set(avis)].join(' ; ')}). L’app ne pose pas de diagnostic.` };
  }
  return { referral, items: uniq };
}

/** Une gêne déclarée gèle la montée de charge des mouvements concernés. */
export function hasJointDeclared(answers?: JointAnswer[]): boolean {
  return !!answers && answers.length > 0;
}

/** Expressions de variantes à adapter d'après les déclencheurs déclarés (aucun déclencheur connu : rien n'est modifié). */
export function adaptationPatterns(answers: JointAnswer[]): string[] {
  return [...new Set(answers.flatMap((a) => a.triggers.map((t) => TRIGGER_PATTERN[t]).filter((p): p is string => !!p)))];
}

interface AdaptableSet {
  variantId: string;
  blockId: string;
  role: string;
  targetRir?: number;
  lastSetToFailure?: boolean;
  cue?: string;
  progression?: string;
}

const ADAPT_NOTE = 'Adaptée à ta gêne : marge de 3 répétitions, amplitude confortable, stop si gêne > 3/10.';

/**
 * Adaptation acceptée : marge de 3 répétitions, jamais à l'échec, une série de moins par exercice (jamais sous 2),
 * consigne d'amplitude. Seuls les exercices dont le mouvement déclenche la gêne sont touchés.
 */
export function adaptSets<T extends AdaptableSet>(sets: T[], patterns: string[]): T[] {
  if (!patterns.length) return sets;
  const hit = (s: T) => s.role === 'work' && patterns.some((p) => new RegExp(p).test(s.variantId));
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const s of sets) if (hit(s)) total.set(s.blockId, (total.get(s.blockId) ?? 0) + 1);
  return sets
    .filter((s) => {
      if (!hit(s)) return true;
      const n = (seen.get(s.blockId) ?? 0) + 1;
      seen.set(s.blockId, n);
      const t = total.get(s.blockId)!;
      return !(t > 2 && n === t);
    })
    .map((s) => (hit(s) ? { ...s, targetRir: Math.max(s.targetRir ?? 2, 3), lastSetToFailure: false, cue: [s.cue, 'Amplitude confortable'].filter(Boolean).join(' · '), progression: ADAPT_NOTE } : s));
}
