// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { challengeValues } from '../src/engine/daily';
import { currentPage, daysToFinish, isValidRange, lastDays, pagesOnDay, progress, readingStreak, type Book, type ReadingEntry } from '../src/engine/reading';

const book: Book = { id: 'b', title: 'Livre', startedAt: 0 };
const e = (day: string, fromPage: number, toPage: number, bookId = 'b'): ReadingEntry => ({ id: `${day}-${fromPage}`, bookId, day, fromPage, toPage, at: 0 });

describe('lecture', () => {
  it('pages lues = page d’arrêt − page de départ, cumulées par jour', () => {
    const log = [e('2026-10-25', 0, 12), e('2026-10-26', 12, 20), e('2026-10-26', 20, 31)];
    expect(pagesOnDay(log, '2026-10-26')).toBe(19);
    expect(currentPage(log, 'b')).toBe(31);
  });

  it('plage invalide refusée, total respecté s’il est connu', () => {
    expect(isValidRange(10, 10)).toBe(false);
    expect(isValidRange(12, 8)).toBe(false);
    expect(isValidRange(10, 330, 320)).toBe(false);
    expect(isValidRange(10, 30)).toBe(true);
  });

  it('pas de progression ni d’estimation sans nombre de pages', () => {
    const log = [e('2026-10-26', 0, 40)];
    expect(progress(book, 40)).toBeUndefined();
    expect(daysToFinish(log, book, '2026-10-26')).toBeUndefined();
    expect(progress({ ...book, totalPages: 200 }, 40)).toBe(0.2);
  });

  it('série : aujourd’hui vide ne casse pas, un trou la casse', () => {
    const log = [e('2026-10-22', 0, 5), e('2026-10-24', 5, 15), e('2026-10-25', 15, 25)];
    expect(readingStreak(log, '2026-10-26')).toBe(2);
    expect(lastDays(log, '2026-10-26').map((d) => d.pages)).toEqual([0, 0, 5, 0, 10, 10, 0]);
  });

  it('estimation de fin sur le rythme des 14 derniers jours', () => {
    const log = [e('2026-10-26', 0, 140)];
    expect(daysToFinish(log, { ...book, totalPages: 280 }, '2026-10-26')).toBe(14);
  });

  it('10 pages notées cochent « Lire » dans le défi ; moins ne décoche jamais une case cochée', () => {
    expect(challengeValues({}, { readPages: 12, updatedAt: 0 }).read).toBe(true);
    expect(challengeValues({}, { readPages: 4, updatedAt: 0 }).read).toBeUndefined();
    expect(challengeValues({ read: true }, { readPages: 4, updatedAt: 0 }).read).toBe(true);
  });
});
