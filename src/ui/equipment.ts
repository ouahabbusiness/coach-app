// Matériel de charge déclaré (kg) : pièces de lest et kettlebells, stockés localement, modifiables dans Réglages.

import { useEffect, useState } from 'react';
import { findVariant } from '../catalog/exercises';
import { DEFAULT_KETTLEBELLS, DEFAULT_PIECES, loadsForEquipment } from '../engine/progression';
import type { Repository } from '../storage/db';

const KEY = 'equipment.loadPieces';
const KB = 'equipment.kettlebells';

export async function loadPieces(repo: Repository): Promise<number[]> {
  return (await repo.getKv<number[]>(KEY)) ?? DEFAULT_PIECES;
}
export async function savePieces(repo: Repository, pieces: number[]): Promise<void> {
  await repo.setKv(KEY, pieces);
}
export async function loadKettlebells(repo: Repository): Promise<number[]> {
  return (await repo.getKv<number[]>(KB)) ?? DEFAULT_KETTLEBELLS;
}
export async function saveKettlebells(repo: Repository, kbs: number[]): Promise<void> {
  await repo.setKv(KB, kbs);
}

export interface Equipment {
  pieces: number[];
  kettlebells: number[];
}

export async function loadEquipment(repo: Repository): Promise<Equipment> {
  return { pieces: await loadPieces(repo), kettlebells: await loadKettlebells(repo) };
}

/** Charges possibles pour une variante d'exercice. */
export function loadsFor(variantId: string, eq: Equipment): number[] {
  return loadsForEquipment(findVariant(variantId)?.variant.equipment ?? [], eq.pieces, eq.kettlebells);
}

export function useEquipment(repo: Repository): Equipment {
  const [eq, setEq] = useState<Equipment>({ pieces: DEFAULT_PIECES, kettlebells: DEFAULT_KETTLEBELLS });
  useEffect(() => {
    loadEquipment(repo).then(setEq);
  }, [repo]);
  return eq;
}
