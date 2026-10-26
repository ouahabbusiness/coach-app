// Pièces de lest disponibles (kg), stockées localement et modifiables dans Réglages.

import { useEffect, useState } from 'react';
import { DEFAULT_PIECES, availableLoads } from '../engine/progression';
import type { Repository } from '../storage/db';

const KEY = 'equipment.loadPieces';

export async function loadPieces(repo: Repository): Promise<number[]> {
  return (await repo.getKv<number[]>(KEY)) ?? DEFAULT_PIECES;
}

export async function savePieces(repo: Repository, pieces: number[]): Promise<void> {
  await repo.setKv(KEY, pieces);
}

/** Charges réalisables avec le matériel déclaré. */
export function useLoads(repo: Repository): number[] {
  const [loads, setLoads] = useState<number[]>(availableLoads(DEFAULT_PIECES));
  useEffect(() => {
    loadPieces(repo).then((p) => setLoads(availableLoads(p)));
  }, [repo]);
  return loads;
}
