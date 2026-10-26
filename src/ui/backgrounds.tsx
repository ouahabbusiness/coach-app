// Fonds d'écran personnels (jour / nuit), stockés uniquement sur l'appareil.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DayPhase } from '../engine/dayPhase';
import type { Repository } from '../storage/db';

export type BgSlot = 'jour' | 'nuit';
type Images = Partial<Record<BgSlot, string>>;

const KEY = 'settings.backgrounds';

interface Ctx {
  images: Images;
  setImage: (slot: BgSlot, file: File | null) => Promise<void>;
}

const BackgroundContext = createContext<Ctx>({ images: {}, setImage: async () => undefined });

/** Réduit l'image (côté max 1600 px, JPEG) pour limiter la place prise sur l'appareil. */
async function toDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function BackgroundProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [images, setImages] = useState<Images>({});
  useEffect(() => {
    repo.getKv<Images>(KEY).then((v) => v && setImages(v));
  }, [repo]);
  const setImage = useCallback(
    async (slot: BgSlot, file: File | null) => {
      const next = { ...images };
      if (file) next[slot] = await toDataUrl(file);
      else delete next[slot];
      await repo.setKv(KEY, next);
      setImages(next);
    },
    [repo, images],
  );
  return <BackgroundContext.Provider value={{ images, setImage }}>{children}</BackgroundContext.Provider>;
}

export const useBackgrounds = () => useContext(BackgroundContext);

/** Image perso pour le moment de la journée : « nuit » pour la nuit, « jour » sinon. */
export function customBackground(images: Images, phase: DayPhase): string | undefined {
  return phase === 'nuit' ? images.nuit : images.jour;
}
