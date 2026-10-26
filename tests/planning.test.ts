// Données de test fictives.
import { describe, expect, it } from 'vitest';
import {
  conflicts,
  consequencesOf,
  dateOf,
  fixedEventsFromAnswers,
  itemStatus,
  shiftWeek,
  spansOf,
  type FixedEvent,
  type PlannedItem,
} from '../src/engine/planning';
import { addGoalVersion, emptyAnswers, goalChanges } from '../src/engine/profile';

const work: FixedEvent = { id: 'w', kind: 'travail', label: 'Travail', days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00' };
const sleep: FixedEvent = { id: 's', kind: 'sommeil', label: 'Sommeil', days: [0, 1, 2, 3, 4, 5, 6], start: '23:00', end: '07:00' };

function item(p: Partial<PlannedItem>): PlannedItem {
  return { id: 'i', weekStart: '2026-11-02', day: 0, start: '18:00', durationMin: 60, kind: 'seance', title: 'Haut du corps', moves: [], ...p };
}

describe('événements fixes', () => {
  it('le sommeil qui passe minuit est découpé sur deux jours', () => {
    const spans = spansOf({ days: [6], start: '23:00', end: '07:00' });
    expect(spans).toEqual([
      { day: 6, start: 1380, end: 1440 },
      { day: 0, start: 0, end: 420 },
    ]);
  });

  it('détecte un chevauchement avec le travail et le sommeil', () => {
    expect(conflicts(0, '16:30', 60, [work, sleep]).map((e) => e.id)).toEqual(['w']);
    expect(conflicts(0, '06:30', 45, [work, sleep]).map((e) => e.id)).toEqual(['s']);
    expect(conflicts(5, '10:00', 60, [work, sleep])).toEqual([]);
  });

  it('ne crée aucun horaire si l’information manque', () => {
    expect(fixedEventsFromAnswers(emptyAnswers())).toEqual([]);
  });

  it('déduit travail, trajets et sommeil des réponses', () => {
    const a = emptyAnswers();
    a.schedule = { workDays: [0, 1], workStart: '08:30', workEnd: '16:30', commuteMin: 30 };
    a.sleep = { bedtime: '23:30', wake: '07:00', preferredSlots: [] };
    const ev = fixedEventsFromAnswers(a);
    expect(ev.map((e) => `${e.label} ${e.start}-${e.end}`)).toEqual([
      'Travail 08:30-16:30',
      'Trajet 08:00-08:30',
      'Trajet 16:30-17:00',
      'Sommeil 23:30-07:00',
    ]);
  });
});

describe('conséquences avant confirmation', () => {
  it('signale le conflit avec le travail et la double séance du jour', () => {
    const items = [item({ id: 'a', day: 2, start: '18:00' })];
    const c = consequencesOf(items, { day: 2, start: '16:30', durationMin: 60, kind: 'seance' }, [work]);
    expect(c.map((x) => x.text)).toEqual([
      'Chevauche « Travail » (09:00–17:00).',
      'Mercredi aurait 2 séances prévues.',
    ]);
  });

  it('un déplacement ne se compare pas à lui-même', () => {
    const items = [item({ id: 'a', day: 2, start: '18:00' })];
    const c = consequencesOf(items, { id: 'a', day: 2, start: '18:30', durationMin: 60, kind: 'seance' }, [work]);
    expect(c).toEqual([{ tone: 'info', text: 'Aucun conflit avec tes horaires connus.' }]);
  });

  it('signale deux séances du même type sur des jours consécutifs', () => {
    const items = [item({ id: 'a', day: 1 })];
    const c = consequencesOf(items, { day: 2, start: '18:00', durationMin: 60, kind: 'seance' }, []);
    expect(c[0]!.text).toMatch(/veille ou le lendemain/);
  });
});

describe('statut des éléments prévus', () => {
  const it1 = item({});
  it('réalisé ou partiel uniquement d’après les séances enregistrées', () => {
    expect(itemStatus(it1, '2026-11-02', '2026-11-03', [{ title: 'Haut du corps', outcome: 'completed' }])).toBe('réalisé');
    expect(itemStatus(it1, '2026-11-02', '2026-11-03', [{ title: 'Haut du corps', outcome: 'partial' }])).toBe('partiel');
  });
  it('jour passé sans séance : non confirmé, pas absent', () => {
    expect(itemStatus(it1, '2026-11-02', '2026-11-03', [])).toBe('non confirmé');
    expect(itemStatus(it1, '2026-11-04', '2026-11-03', [])).toBe('prévu');
  });
  it('calcule les dates de la semaine', () => {
    expect(dateOf('2026-11-02', 6)).toBe('2026-11-08');
    expect(shiftWeek('2026-11-02', -1)).toBe('2026-10-26');
  });
});

describe('objectifs versionnés', () => {
  it('ajoute une version seulement si l’objectif change, sans modifier les anciennes', () => {
    let h = addGoalVersion([], { main: 'street_workout', secondary: [], targetDate: '2027-03-01' }, 'onboarding', 1);
    h = addGoalVersion(h, { main: 'street_workout', secondary: [], targetDate: '2027-03-01' }, 'relecture', 2);
    expect(h).toHaveLength(1);
    h = addGoalVersion(h, { main: 'street_workout', secondary: [], targetDate: '2027-05-01' }, 'échéance repoussée', 3);
    expect(h).toHaveLength(2);
    expect(h[0]!.targetDate).toBe('2027-03-01');
    expect(h[1]).toMatchObject({ version: 2, reason: 'échéance repoussée' });
    expect(goalChanges(h[0], h[1]!)).toEqual(['targetDate']);
  });
});
