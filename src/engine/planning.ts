// Planning de la semaine. Heures locales « HH:MM », jours 0 = lundi … 6 = dimanche.
// Fonctions pures : conflits avec les événements fixes et conséquences d'un déplacement.

import type { DisruptionReason, PlanLine } from './disruption';
import type { OnboardingAnswers } from './profile';

export type FixedKind = 'travail' | 'trajet' | 'sommeil' | 'autre';

export interface FixedEvent {
  id: string;
  kind: FixedKind;
  label: string;
  days: number[];
  start: string;
  /** Si end ≤ start, l'événement se termine le lendemain (ex. sommeil). */
  end: string;
}

export type ItemKind = 'seance' | 'course' | 'marche';

export interface PlannedItem {
  id: string;
  /** Lundi de la semaine, AAAA-MM-JJ. */
  weekStart: string;
  day: number;
  start: string;
  durationMin: number;
  kind: ItemKind;
  title: string;
  templateId?: string;
  /** Historique des déplacements (traçabilité). */
  moves: { at: number; fromDay: number; fromStart: string; reason?: DisruptionReason }[];
  /** Séance démarrée depuis cet élément (lien par identifiant). */
  sessionId?: string;
  /** Imprévu déclaré : la décision et sa raison sont conservées. */
  adjustment?: Adjustment;
  /** Version adaptée à utiliser à la place du modèle (raccourcie, allégée, sans matériel). */
  adapted?: { lines: PlanLine[]; estimatedMin: number; removed: string[] };
  /** Élément créé par un programme du coach (remplacé si le programme est refait). */
  programId?: string;
  /** Course : distance prescrite et contenu (fractionné, allure). */
  km?: number;
  detail?: string;
}

export interface Adjustment {
  reason: DisruptionReason;
  decision: 'adaptée' | 'annulée' | 'suspendue' | 'remplacée';
  at: number;
  note?: string;
  /** Corrections datées : la note d'origine reste lisible, jamais réécrite en silence. */
  corrections?: { at: number; text: string }[];
}

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fromMin(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface Span {
  day: number;
  start: number;
  end: number;
}

/** Découpe un événement en plages [début, fin) par jour, en gérant le passage à minuit. */
export function spansOf(ev: { days: number[]; start: string; end: string }): Span[] {
  const s = toMin(ev.start);
  const e = toMin(ev.end);
  const out: Span[] = [];
  for (const d of ev.days) {
    if (e > s) out.push({ day: d, start: s, end: e });
    else {
      out.push({ day: d, start: s, end: 1440 });
      if (e > 0) out.push({ day: (d + 1) % 7, start: 0, end: e });
    }
  }
  return out;
}

function itemSpans(day: number, start: string, durationMin: number): Span[] {
  return spansOf({ days: [day], start, end: fromMin(toMin(start) + durationMin) });
}

/** Événements fixes qui chevauchent un créneau. */
export function conflicts(day: number, start: string, durationMin: number, fixed: FixedEvent[]): FixedEvent[] {
  const mine = itemSpans(day, start, durationMin);
  return fixed.filter((ev) => spansOf(ev).some((a) => mine.some((b) => a.day === b.day && a.start < b.end && b.start < a.end)));
}

/** Événements fixes déduits de l'onboarding (travail, trajets, sommeil). Rien n'est inventé si l'info manque. */
export function fixedEventsFromAnswers(a: OnboardingAnswers): FixedEvent[] {
  const out: FixedEvent[] = [];
  const { workDays, workStart, workEnd, commuteMin, lunchStart, lunchEnd } = a.schedule;
  if (workDays.length > 0 && workStart && workEnd) {
    // Pause de midi déclarée (dans la journée de travail) : le travail est coupé en deux, le trou reste libre pour une séance ou une course.
    const lunchOk = !!lunchStart && !!lunchEnd && toMin(workStart) < toMin(lunchStart) && toMin(lunchStart) < toMin(lunchEnd) && toMin(lunchEnd) < toMin(workEnd);
    if (lunchOk) {
      out.push({ id: 'travail-matin', kind: 'travail', label: 'Travail', days: workDays, start: workStart, end: lunchStart! });
      out.push({ id: 'travail-apres-midi', kind: 'travail', label: 'Travail', days: workDays, start: lunchEnd!, end: workEnd });
    } else {
      out.push({ id: 'travail', kind: 'travail', label: 'Travail', days: workDays, start: workStart, end: workEnd });
    }
    if (commuteMin && commuteMin > 0) {
      out.push({ id: 'trajet-aller', kind: 'trajet', label: 'Trajet', days: workDays, start: fromMin(toMin(workStart) - commuteMin), end: workStart });
      out.push({ id: 'trajet-retour', kind: 'trajet', label: 'Trajet', days: workDays, start: workEnd, end: fromMin(toMin(workEnd) + commuteMin) });
    }
  }
  if (a.sleep.bedtime && a.sleep.wake) {
    out.push({ id: 'sommeil', kind: 'sommeil', label: 'Sommeil', days: [0, 1, 2, 3, 4, 5, 6], start: a.sleep.bedtime, end: a.sleep.wake });
  }
  return out;
}

export interface Consequence {
  tone: 'info' | 'warn';
  text: string;
}

/**
 * Conséquences d'un ajout ou d'un déplacement, affichées AVANT confirmation.
 * Constats factuels uniquement : aucune règle physiologique inventée.
 */
export function consequencesOf(
  items: PlannedItem[],
  target: { id?: string; day: number; start: string; durationMin: number; kind: ItemKind },
  fixed: FixedEvent[],
): Consequence[] {
  const out: Consequence[] = [];
  for (const ev of conflicts(target.day, target.start, target.durationMin, fixed)) {
    out.push({ tone: 'warn', text: `Chevauche « ${ev.label} » (${ev.start}–${ev.end}).` });
  }
  const others = items.filter((i) => i.id !== target.id);
  const overlap = others.filter(
    (i) => i.day === target.day && toMin(i.start) < toMin(target.start) + target.durationMin && toMin(target.start) < toMin(i.start) + i.durationMin,
  );
  for (const i of overlap) out.push({ tone: 'warn', text: `Chevauche « ${i.title} » prévu à ${i.start}.` });
  const sameDay = others.filter((i) => i.day === target.day && i.kind !== 'marche');
  if (target.kind !== 'marche' && sameDay.length > 0) {
    out.push({ tone: 'info', text: `${DAY_NAMES[target.day]} aurait ${sameDay.length + 1} séances prévues.` });
  }
  const prevDay = others.filter((i) => i.day === (target.day + 6) % 7 && i.kind === target.kind && target.day !== 0).length;
  const nextDay = others.filter((i) => i.day === target.day + 1 && i.kind === target.kind).length;
  if (target.kind !== 'marche' && (prevDay > 0 || nextDay > 0)) {
    out.push({ tone: 'info', text: 'Même type de séance la veille ou le lendemain : vérifie que ta récupération le permet.' });
  }
  if (out.length === 0) out.push({ tone: 'info', text: 'Aucun conflit avec tes horaires connus.' });
  return out;
}

export type ItemStatus = 'prévu' | 'réalisé' | 'adapté' | 'partiel' | 'annulé' | 'suspendu' | 'non confirmé';

/**
 * Statut d'un élément prévu à partir des séances réellement enregistrées et des imprévus déclarés.
 * Lien par identifiant si la séance a été lancée depuis le planning ; sinon par nom le même jour.
 * Jour passé sans séance : « non confirmé » (l'app ne sait pas), jamais « absent ».
 */
export function itemStatus(
  item: PlannedItem,
  itemDate: string,
  today: string,
  sessionsOnDay: { id: string; title: string; outcome: string }[],
): ItemStatus {
  const match = item.sessionId
    ? sessionsOnDay.find((s) => s.id === item.sessionId)
    : sessionsOnDay.find((s) => s.title === item.title);
  if (match && match.outcome !== 'in_progress') {
    if (match.outcome === 'partial' || match.outcome === 'stopped_for_safety') return 'partiel';
    return item.adapted ? 'adapté' : 'réalisé';
  }
  if (item.adjustment?.decision === 'annulée') return 'annulé';
  if (item.adjustment?.decision === 'suspendue') return 'suspendu';
  return itemDate < today ? 'non confirmé' : 'prévu';
}

/** Date AAAA-MM-JJ du jour `day` (0 = lundi) d'une semaine. */
export function dateOf(weekStart: string, day: number): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return dateOf(weekStart, weeks * 7);
}
