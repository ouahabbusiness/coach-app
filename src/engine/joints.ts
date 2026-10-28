// Gêne à l'épaule ou aux coudes : ce que tu déclares sert à adapter la prescription et à savoir quand consulter.
// L'app ne pose aucun diagnostic. Tes performances en séance ne prouvent pas l'absence de faiblesse, de dérobement ou de gêne sur un geste précis.
// Aucun score de douleur n'est une frontière médicale : les signaux d'alerte priment.

export type JointZone = 'epaule' | 'coudes';
export type JointSide = 'gauche' | 'droite' | 'les-deux';
export type JointTrigger = 'tractions' | 'dips' | 'pompes' | 'developpe' | 'rowing' | 'autre' | 'inconnu';
/** Ce que tu ressens, à distinguer : perte de force, dérobement, douleur qui te fait arrêter, simple fatigue en fin de série. */
export type JointSymptom = 'perte_force' | 'derobement' | 'douleur_limitante' | 'fatigue_fin';
/** Signaux qui appellent une évaluation rapide, ou un avis lorsqu'ils s'installent. */
export type JointAlert = 'engourdissement' | 'blocage' | 'deformation' | 'tres_forte' | 'soudain' | 'nuit';
export type JointTrend = 'mieux' | 'pareil' | 'pire';

export const ZONE_LABELS: Record<JointZone, string> = { epaule: 'Épaule', coudes: 'Coudes' };
export const SIDE_LABELS: Record<JointSide, string> = { gauche: 'gauche', droite: 'droite', 'les-deux': 'les deux' };
export const TRIGGER_LABELS: Record<JointTrigger, string> = {
  tractions: 'Tractions',
  dips: 'Dips',
  pompes: 'Pompes',
  developpe: 'Développé, pike',
  rowing: 'Rowing',
  autre: 'Autre',
  inconnu: 'Je ne sais pas',
};
export const SYMPTOM_LABELS: Record<JointSymptom, string> = {
  perte_force: 'Moins de force qu’avant',
  derobement: 'Ça se dérobe, ça ne tient pas',
  douleur_limitante: 'Je m’arrête à cause de la douleur',
  fatigue_fin: 'Je fatigue seulement en fin de série',
};
export const ALERT_LABELS: Record<JointAlert, string> = {
  engourdissement: 'Fourmillements ou perte de sensibilité qui durent',
  blocage: 'Bras bloqué ou choc récent',
  deformation: 'Déformation visible',
  tres_forte: 'Douleur très forte',
  soudain: 'Apparu d’un coup',
  nuit: 'Douleur la nuit',
};
export const TREND_LABELS: Record<JointTrend, string> = { mieux: 'ça s’améliore', pareil: 'pareil', pire: 'ça empire' };

export interface JointAnswer {
  zone: JointZone;
  side?: JointSide;
  since?: '<1m' | '1-6m' | '>6m';
  freq?: 'rare' | 'parfois' | 'souvent';
  /** Geste où ça se manifeste. */
  triggers: JointTrigger[];
  symptoms?: JointSymptom[];
  /** Douleur maximale ressentie, 0 à 10 : informative, jamais un seuil. */
  maxPain?: number;
  /** Le lendemain d'une séance. */
  next?: 'rien' | 'legere' | 'dure';
  trend?: JointTrend;
  alerts: (JointAlert | 'faiblesse')[];
}

/** Anciennes réponses : la case « perte de force ou instabilité » devient le symptôme « moins de force », à préciser. */
export function normalizeJoint(a: JointAnswer): JointAnswer & { symptoms: JointSymptom[]; alerts: JointAlert[] } {
  const symptoms = new Set<JointSymptom>(a.symptoms ?? []);
  if (a.alerts.includes('faiblesse')) symptoms.add('perte_force');
  return { ...a, symptoms: [...symptoms], alerts: a.alerts.filter((x): x is JointAlert => x !== 'faiblesse') };
}

export interface JointReferral {
  /** « urgent » : évaluation rapide ; « avis » : avis d'un médecin ou d'un kiné. */
  level: 'urgent' | 'avis';
  text: string;
}

export interface JointAdvice {
  referral?: JointReferral;
  /** Adaptation par mouvement déclencheur : une proposition à vérifier pendant la séance et le lendemain, pas une garantie. */
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
/** Mouvement déclencheur inconnu : par prudence, tous les tests maximaux du haut du corps sont concernés. */
export const UPPER_BODY_PATTERN = 'pullup|chinup|dips|pushup|pike|press';

const FOR: Partial<Record<JointTrigger, string>> = {
  tractions: 'Tractions : marge de 3 répétitions, une série de moins, descente contrôlée. Retirer le lest ne garantit pas d’éviter la gêne : on vérifie.',
  dips: 'Dips : marge de 3 répétitions, une série de moins, jamais plus bas que l’épaule au niveau du coude. Les dips sur banc ne sont pas forcément plus doux pour l’épaule : à tester, pas à supposer.',
  pompes: 'Pompes : marge de 3 répétitions, une série de moins, amplitude confortable.',
  developpe: 'Développé, pike : marge de 3 répétitions, une série de moins, amplitude confortable.',
  rowing: 'Rowing : marge de 3 répétitions, une série de moins, épaule loin de l’oreille.',
};

export function jointAdvice(raw: JointAnswer[]): JointAdvice {
  const answers = raw.map(normalizeJoint);
  const items: JointAdvice['items'] = [];
  const urgent: string[] = [];
  const avis: string[] = [];
  for (const a of answers) {
    const z = `${ZONE_LABELS[a.zone].toLowerCase()}${a.side ? ` ${SIDE_LABELS[a.side]}` : ''}`;
    for (const t of a.triggers) {
      const text = FOR[t];
      if (text) items.push({ zone: a.zone, text });
    }
    if (a.triggers.length === 0 || a.triggers.every((t) => t === 'inconnu' || t === 'autre')) {
      items.push({ zone: a.zone, text: 'Geste déclencheur inconnu : note pendant quelle série la gêne apparaît. La charge reste gelée et aucun test maximal du haut du corps n’est maintenu.' });
    }
    // Évaluation rapide, quel que soit le score de douleur.
    for (const al of a.alerts) if (al === 'blocage' || al === 'deformation' || al === 'tres_forte' || al === 'engourdissement') urgent.push(`${z} : ${ALERT_LABELS[al].toLowerCase()}`);
    if (a.alerts.includes('soudain')) urgent.push(`${z} : apparu d’un coup`);
    // Avis médical ou d'un kiné : ce qui s'installe, limite ou empire.
    if (a.symptoms.includes('perte_force')) avis.push(`${z} : moins de force qu’avant`);
    if (a.symptoms.includes('derobement')) avis.push(`${z} : ça se dérobe`);
    if (a.symptoms.includes('douleur_limitante')) avis.push(`${z} : tu t’arrêtes à cause de la douleur`);
    if (a.alerts.includes('nuit')) avis.push(`${z} : douleur la nuit`);
    if (a.trend === 'pire') avis.push(`${z} : ça empire`);
    if (a.next === 'dure') avis.push(`${z} : gêne qui dure le lendemain`);
    if (a.freq && a.freq !== 'rare' && a.since && a.since !== '<1m') avis.push(`${z} : gêne qui revient depuis plus d’un mois`);
  }
  const uniq = [...new Map(items.map((i) => [`${i.zone}|${i.text}`, i])).values()];
  let referral: JointReferral | undefined;
  if (urgent.length) {
    referral = { level: 'urgent', text: `À faire évaluer rapidement par un médecin (${[...new Set(urgent)].join(' ; ')}). Si tu ne peux plus bouger le bras, après un choc ou si c’est soudain, consulte sans attendre. L’app ne pose pas de diagnostic.` };
  } else if (avis.length) {
    referral = { level: 'avis', text: `Un avis médical ou d’un kiné est recommandé sans attendre une baisse de performance (${[...new Set(avis)].join(' ; ')}). L’app ne pose pas de diagnostic.` };
  }
  return { referral, items: uniq };
}

/** Une gêne déclarée gèle la montée de charge des mouvements concernés. */
export function hasJointDeclared(answers?: JointAnswer[]): boolean {
  return !!answers && answers.length > 0;
}

/** Expressions de variantes à adapter d'après les gestes déclarés (aucun geste connu : rien n'est modifié dans les séances de travail). */
export function adaptationPatterns(answers: JointAnswer[]): string[] {
  return [...new Set(answers.flatMap((a) => a.triggers.map((t) => TRIGGER_PATTERN[t]).filter((p): p is string => !!p)))];
}

/**
 * Tests maximaux : jamais maintenus automatiquement sur un mouvement symptomatique. Geste connu : ces mouvements ;
 * gêne déclarée sans geste connu : tout le haut du corps, par prudence.
 */
export function testPatterns(answers: JointAnswer[]): string[] {
  if (!answers.length) return [];
  const known = adaptationPatterns(answers);
  const unknown = answers.some((a) => a.triggers.every((t) => t === 'inconnu' || t === 'autre'));
  return unknown ? [UPPER_BODY_PATTERN] : known;
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
const TEST_CUE = 'Pas de test maximal (gêne déclarée) : une série sous-maximale, arrête avec 3 répétitions en réserve et note-les.';

/**
 * Adaptation acceptée : marge de 3 répétitions, jamais à l'échec, une série de moins par exercice (jamais sous 2),
 * consigne d'amplitude. Les séries de test sur ces mouvements deviennent sous-maximales.
 */
export function adaptSets<T extends AdaptableSet>(sets: T[], patterns: string[], tests: string[] = patterns): T[] {
  if (!patterns.length && !tests.length) return sets;
  const match = (list: string[], v: string) => list.some((p) => new RegExp(p).test(v));
  const hit = (s: T) => s.role === 'work' && match(patterns, s.variantId);
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
    .map((s) => {
      if (hit(s)) return { ...s, targetRir: Math.max(s.targetRir ?? 2, 3), lastSetToFailure: false, cue: [s.cue, 'Amplitude confortable'].filter(Boolean).join(' · '), progression: ADAPT_NOTE };
      if (s.role === 'test' && match(tests, s.variantId)) return { ...s, targetRir: 3, lastSetToFailure: false, cue: TEST_CUE, progression: 'Test maximal remplacé par une série sous-maximale (gêne déclarée).' };
      return s;
    });
}
