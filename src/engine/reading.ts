// Suivi de lecture : livre en cours, séances « de la page X à la page Y », pages lues par jour.
// Convention marque-page : X = page où l'on avait arrêté, Y = page où l'on s'arrête ; pages lues = Y − X.
// Le nombre total de pages dépend de l'édition : jamais deviné, la progression n'existe que s'il est saisi.

export interface Book {
  id: string;
  title: string;
  author?: string;
  totalPages?: number;
  /** Photo de couverture prise par l'utilisateur (data URL, stockée localement). */
  cover?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface ReadingEntry {
  id: string;
  bookId: string;
  day: string;
  fromPage: number;
  toPage: number;
  at: number;
}

/** Objectif quotidien du défi (« Lire 10 pages »). */
export const DAILY_PAGES = 10;

export const pagesOf = (e: ReadingEntry) => Math.max(0, e.toPage - e.fromPage);

export function isValidRange(from: number, to: number, totalPages?: number): boolean {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
  if (from < 0 || to <= from) return false;
  return totalPages === undefined || to <= totalPages;
}

/** Page actuelle du livre : la plus loin atteinte (0 si rien noté). */
export function currentPage(log: ReadingEntry[], bookId: string): number {
  return log.filter((e) => e.bookId === bookId).reduce((m, e) => Math.max(m, e.toPage), 0);
}

/** Pages lues un jour donné, tous livres confondus. */
export function pagesOnDay(log: ReadingEntry[], day: string): number {
  return log.filter((e) => e.day === day).reduce((s, e) => s + pagesOf(e), 0);
}

/** Part lue (0–1), ou undefined si le nombre de pages n'est pas connu. */
export function progress(book: Book, page: number): number | undefined {
  if (!book.totalPages) return undefined;
  return Math.min(1, page / book.totalPages);
}

const shift = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Pages par jour sur les n derniers jours (aujourd'hui inclus, du plus ancien au plus récent). */
export function lastDays(log: ReadingEntry[], today: string, n = 7): { day: string; pages: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const day = shift(today, i - n + 1);
    return { day, pages: pagesOnDay(log, day) };
  });
}

/** Série de jours consécutifs avec au moins une page ; aujourd'hui sans lecture ne casse pas encore la série. */
export function readingStreak(log: ReadingEntry[], today: string): number {
  let streak = 0;
  for (let i = 0; ; i++) {
    const p = pagesOnDay(log, shift(today, -i));
    if (p > 0) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

/**
 * Estimation de fin : pages restantes ÷ rythme moyen des 14 derniers jours.
 * undefined si le total est inconnu ou s'il n'y a pas eu de lecture sur la période.
 */
export function daysToFinish(log: ReadingEntry[], book: Book, today: string): number | undefined {
  if (!book.totalPages) return undefined;
  const left = book.totalPages - currentPage(log, book.id);
  if (left <= 0) return 0;
  const pace = lastDays(log.filter((e) => e.bookId === book.id), today, 14).reduce((s, d) => s + d.pages, 0) / 14;
  return pace > 0 ? Math.ceil(left / pace) : undefined;
}
