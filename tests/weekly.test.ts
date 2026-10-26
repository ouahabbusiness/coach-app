import { describe, expect, it } from 'vitest';
import { weekReport } from '../src/engine/weekly';

describe('bilan de la semaine', () => {
  it('séances manquées comptées, pas de rattrapage en double', () => {
    const r = weekReport({ plannedSessions: 3, doneSessions: 2, plannedRuns: 3, runsKm: [5, 4.5], habitsByDay: [5, 6, 4], weightAvg: 76.8, weightAvgPrev: 77.3, pagesRead: 42 });
    expect(r).toMatchObject({ sessions: '2/3', runs: '2/3', km: 9.5, habits: 5, weightDelta: -0.5, pages: 42 });
    expect(r.verdict).toContain('2 séances manquées');
  });
  it('données absentes → non affichées, jamais zéro', () => {
    const r = weekReport({ plannedSessions: 0, doneSessions: 0, plannedRuns: 0, runsKm: [], habitsByDay: [], pagesRead: 0 });
    expect(r.habits).toBeUndefined();
    expect(r.weightDelta).toBeUndefined();
  });
  it('rien de renseigné → « bilan incertain », jamais un progrès ou un retard inventé', () => {
    const r = weekReport({ plannedSessions: 0, doneSessions: 0, plannedRuns: 0, runsKm: [], habitsByDay: [], pagesRead: 0 });
    expect(r.verdict).toContain('Bilan incertain');
    expect(r.uncertain).toContain('habitudes non renseignées');
  });
});
