// Matériel de charge déclaré (kg) : pièces de lest et kettlebells, stockés localement, modifiables dans Réglages.

import { useEffect, useState } from 'react';
import { findVariant } from '../catalog/exercises';
import { DEFAULT_KETTLEBELLS, DEFAULT_PIECES, loadsForEquipment } from '../engine/progression';
import type { Repository } from '../storage/db';
import { DEFAULT_OWNED } from '../engine/gear';

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

const OWNED = 'equipment.owned';
const GEAR = 'equipment.gear';

/** Matériel possédé (noms du catalogue d'exercices), défaut = matériel déclaré. */
export async function loadOwned(repo: Repository): Promise<string[]> {
  return (await repo.getKv<string[]>(OWNED)) ?? DEFAULT_OWNED;
}
export async function saveOwned(repo: Repository, v: string[]): Promise<void> {
  await repo.setKv(OWNED, v);
}
/** Accessoires conseillés déjà achetés (identifiants). */
export async function loadBoughtGear(repo: Repository): Promise<string[]> {
  return (await repo.getKv<string[]>(GEAR)) ?? [];
}
export async function saveBoughtGear(repo: Repository, v: string[]): Promise<void> {
  await repo.setKv(GEAR, v);
}
