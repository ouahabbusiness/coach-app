// Disponibilités : indisponibilités ponctuelles (soirée, réunion, analyse Amazon…) et replacement automatique
// des séances et courses du programme sur le créneau libre le plus proche, le même jour.
// Rien n'est reporté à un autre jour ici : c'est compatible avec la rigueur « strict » et « militaire ».

import { dateOf, spansOf, toMin, fromMin, type FixedEvent, type PlannedItem } from './planning';

export type OneOffKind = 'soiree' | 'reunion' | 'travail_perso' | 'rdv' | 'autre';

export const ONE_OFF_LABELS: Record<OneOffKind, string> = {
  soiree: 'Soirée prévue',
  reunion: 'Réunion',
  travail_perso: 'Travail perso (ex. analyse Amazon)',
  rdv: 'Rendez-vous',
  autre: 'Autre',
};

export interface OneOff {
  id: string;
  /** AAAA-MM-JJ */
  date: string;
  start: string;
  end: string;
  kind: OneOffKind;
  label: string;
}

/** Plages occupées [début, fin) en minutes pour une date : événements fixes du jour de semaine + ponctuels. */
export function busy(date: string, weekday: number, fixed: FixedEvent[], oneOffs: OneOff[]): [number, number][] {
  const out: [number, number][] = [];
  for (const ev of fixed) for (const s of spansOf(ev)) if (s.day === weekday) out.push([s.start, s.end]);
  for (const o of oneOffs.filter((x) => x.date === date)) {
    const s = toMin(o.start);
    const e = toMin(o.end);
    out.push([s, e > s ? e : 1440]);
  }
  return out;
}

const overlaps = (a: [number, number], spans: [number, number][], margin: number) => spans.some(([s, e]) => a[0] < e + margin && s < a[1] + margin);

/**
 * Créneau libre le plus proche de l'heure prévue, entre `from` et `to` (heure de début), par pas de 15 min.
 * `margin` : battement avant/après chaque occupation (15 min par défaut).
 */
export function nearestFree(preferred: string, durationMin: number, spans: [number, number][], from = '06:00', to = '21:30', margin = 15): string | undefined {
  const p = toMin(preferred);
  const lo = toMin(from);
  const hi = toMin(to);
  const candidates: number[] = [];
  for (let t = lo; t <= hi; t += 15) candidates.push(t);
  candidates.sort((a, b) => Math.abs(a - p) - Math.abs(b - p) || a - b);
  const hit = candidates.find((t) => !overlaps([t, t + durationMin], spans, margin));
  return hit === undefined ? undefined : fromMin(hit);
}

export interface Move {
  itemId: string;
  title: string;
  from: string;
  to?: string;
  because: string;
}

/**
 * Replace, pour une date, les séances et courses qui tombent sur une occupation.
 * Les éléments déjà démarrés ou adaptés ne bougent pas. Sans créneau libre : signalé, rien n'est inventé.
 */
export function replanDay(items: PlannedItem[], date: string, fixed: FixedEvent[], oneOffs: OneOff[], at: number): { items: PlannedItem[]; moves: Move[] } {
  const moves: Move[] = [];
  const out = items.map((i) => ({ ...i }));
  const todays = out.filter((i) => dateOf(i.weekStart, i.day) === date && (i.kind === 'seance' || i.kind === 'course') && !i.sessionId && (!i.adjustment || i.adjustment.decision === 'adaptée'));
  for (const it of todays) {
    const spans = busy(date, it.day, fixed, oneOffs);
    // Les autres éléments du jour occupent aussi leur créneau.
    const others = todays.filter((x) => x.id !== it.id).map((x) => [toMin(x.start), toMin(x.start) + x.durationMin] as [number, number]);
    const mine: [number, number] = [toMin(it.start), toMin(it.start) + it.durationMin];
    const clash = oneOffs.find((o) => o.date === date && overlaps(mine, [[toMin(o.start), toMin(o.end) > toMin(o.start) ? toMin(o.end) : 1440]], 0));
    if (!clash && !overlaps(mine, spans, 0)) continue;
    const to = nearestFree(it.start, it.durationMin, [...spans, ...others]);
    const because = clash ? clash.label : 'créneau occupé';
    moves.push({ itemId: it.id, title: it.title, from: it.start, to, because });
    if (to) {
      it.moves = [...it.moves, { at, fromDay: it.day, fromStart: it.start }];
      it.start = to;
    }
  }
  return { items: out, moves };
}
