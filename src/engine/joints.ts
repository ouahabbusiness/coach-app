// Gêne à l'épaule ou aux coudes : ce que tu déclares sert à choisir une adaptation et à savoir quand consulter.
// L'app ne pose aucun diagnostic.

export type JointZone = 'epaule' | 'coudes';
export type JointTrigger = 'tractions' | 'dips' | 'pompes' | 'developpe' | 'rowing' | 'autre' | 'inconnu';
export type JointAlert = 'faiblesse' | 'engourdissement' | 'nuit';

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
export const ALERT_LABELS: Record<JointAlert, string> = { faiblesse: 'Faiblesse ou instabilité', engourdissement: 'Fourmillements, engourdissement', nuit: 'Douleur la nuit' };

export interface JointAnswer {
  zone: JointZone;
  since?: '<1m' | '1-6m' | '>6m';
  freq?: 'rare' | 'parfois' | 'souvent';
  triggers: JointTrigger[];
  /** Douleur maximale ressentie, 0 à 10. */
  maxPain?: number;
  /** Le lendemain d'une séance. */
  next?: 'rien' | 'legere' | 'dure';
  alerts: JointAlert[];
}

export interface JointAdvice {
  /** Orientation vers un professionnel, jamais un diagnostic. */
  referral?: string;
  /** Adaptation par mouvement déclencheur : à tester et vérifier, pas une solution supposée sûre. */
  items: { zone: JointZone; text: string }[];
}

const FOR: Partial<Record<JointTrigger, string>> = {
  tractions: 'Tractions : charge gelée ; essaie une descente plus lente et une amplitude confortable. Retirer le lest ne garantit pas d’éviter la gêne : vérifie.',
  dips: 'Dips : charge gelée ; ne descends pas plus bas que l’épaule au niveau du coude. Les dips sur banc ne sont pas forcément plus doux pour l’épaule : à tester, pas à supposer.',
  pompes: 'Pompes : réduis l’amplitude ou change la prise ; vérifie la réaction pendant et le lendemain.',
  developpe: 'Développé, pike : réduis la charge ou l’amplitude ; remplace le mouvement si la gêne revient.',
  rowing: 'Rowing : réduis l’amplitude et la charge ; garde l’épaule loin de l’oreille.',
};

export function jointAdvice(answers: JointAnswer[]): JointAdvice {
  const items: JointAdvice['items'] = [];
  const reasons: string[] = [];
  for (const a of answers) {
    for (const t of a.triggers) {
      const text = FOR[t];
      if (text) items.push({ zone: a.zone, text });
    }
    if (a.triggers.length === 0 || a.triggers.every((t) => t === 'inconnu' || t === 'autre')) {
      items.push({ zone: a.zone, text: 'Mouvement déclencheur inconnu : note pendant quelle série la gêne apparaît, l’app ne change rien d’autre pour l’instant.' });
    }
    const z = ZONE_LABELS[a.zone].toLowerCase();
    if (a.alerts.length) reasons.push(`${z} : ${a.alerts.map((x) => ALERT_LABELS[x].toLowerCase()).join(', ')}`);
    if ((a.maxPain ?? 0) >= 6) reasons.push(`${z} : douleur ${a.maxPain}/10`);
    if (a.freq === 'souvent' && a.since && a.since !== '<1m') reasons.push(`${z} : gêne fréquente depuis plus d’un mois`);
    if (a.next === 'dure') reasons.push(`${z} : gêne qui dure le lendemain`);
  }
  const uniq = [...new Set(items.map((i) => `${i.zone}|${i.text}`))].map((s) => {
    const [zone, ...rest] = s.split('|');
    return { zone: zone as JointZone, text: rest.join('|') };
  });
  const referral = reasons.length
    ? `Un avis médical ou d’un kiné est recommandé (${reasons.join(' ; ')}). L’app ne pose pas de diagnostic.`
    : undefined;
  return { referral, items: uniq };
}

/** Une gêne déclarée gèle la montée de charge des mouvements concernés. */
export function hasJointDeclared(answers?: JointAnswer[]): boolean {
  return !!answers && answers.length > 0;
}
