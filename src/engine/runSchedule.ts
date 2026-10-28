// Courses espacées : jamais deux jours de course consécutifs en reprise (un jour de repos entre deux sorties).
// Fonction pure : elle propose, l'appelant applique après validation.

export interface RunLike {
  day: number;
  start: string;
  durationMin: number;
  kind: string;
}

export interface RunMove<T> {
  item: T;
  fromDay: number;
  toDay: number;
}

export interface SpaceResult<T> {
  items: T[];
  moved: RunMove<T>[];
  /** Courses consécutives que rien ne permet de déplacer (aucun jour libre). */
  unresolved: T[];
}

/**
 * Déplace la 1re course d'une paire de jours consécutifs vers un jour libre (sans séance ni course, à 2 jours au moins
 * des autres courses, et autorisé par `canUse`). `movable` exclut le passé et ce qui est déjà fait.
 */
export function spaceRuns<T extends RunLike>(
  week: T[],
  opts: { candidateDays?: number[]; start?: string; canUse?: (day: number, item: T) => boolean; movable?: (item: T) => boolean } = {},
): SpaceResult<T> {
  const candidates = opts.candidateDays ?? [1, 2, 3, 4];
  const start = opts.start ?? '12:30';
  const items = week.map((x) => ({ ...x }));
  const moved: RunMove<T>[] = [];
  const unresolved: T[] = [];
  const runs = () => items.filter((x) => x.kind === 'course').sort((a, b) => a.day - b.day);
  for (let guard = 0; guard < 8; guard++) {
    const r = runs();
    const pair = r.find((x, i) => i < r.length - 1 && r[i + 1]!.day - x.day === 1 && !unresolved.includes(x));
    if (!pair) break;
    const free = (d: number) =>
      !items.some((x) => x !== pair && x.day === d && (x.kind === 'seance' || x.kind === 'course')) &&
      !items.some((x) => x !== pair && x.kind === 'course' && Math.abs(x.day - d) < 2) &&
      (opts.canUse?.(d, pair) ?? true);
    const dest = opts.movable && !opts.movable(pair) ? undefined : candidates.find(free);
    if (dest === undefined) {
      unresolved.push(pair);
      continue;
    }
    moved.push({ item: pair, fromDay: pair.day, toDay: dest });
    pair.day = dest;
    pair.start = start;
  }
  return { items, moved, unresolved };
}
