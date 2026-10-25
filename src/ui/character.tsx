// Images de personnage fournies par l'utilisateur, stockées uniquement sur l'appareil (jamais dans le code).

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Repository } from '../storage/db';
import { Fighter, type FighterLevel } from './Fighter';

const KEY = 'character.images';
export type CharacterImages = Partial<Record<FighterLevel, string>>;

interface Ctx {
  images: CharacterImages;
  setImage: (level: FighterLevel, file: File | null) => Promise<void>;
}

const CharacterContext = createContext<Ctx>({ images: {}, setImage: async () => undefined });

/** Réduit l'image (max 900 px) pour limiter la place prise sur l'appareil. */
async function toDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CharacterProvider({ repo, children }: { repo: Repository; children: React.ReactNode }) {
  const [images, setImages] = useState<CharacterImages>({});
  useEffect(() => {
    repo.getKv<CharacterImages>(KEY).then((v) => v && setImages(v));
  }, [repo]);
  const setImage = useCallback(
    async (level: FighterLevel, file: File | null) => {
      const next = { ...images };
      if (file) next[level] = await toDataUrl(file);
      else delete next[level];
      await repo.setKv(KEY, next);
      setImages(next);
    },
    [repo, images],
  );
  return <CharacterContext.Provider value={{ images, setImage }}>{children}</CharacterContext.Provider>;
}

export function useCharacter() {
  return useContext(CharacterContext);
}

/** Affiche l'image fournie pour ce palier, sinon le personnage original dessiné. */
export function CharacterArt({ level = 0, size = 200 }: { level?: FighterLevel; size?: number }) {
  const { images } = useCharacter();
  const src = images[level];
  if (src) return <img src={src} alt="" style={{ height: (size * 240) / 200, width: 'auto', maxWidth: '100%', objectFit: 'contain', position: 'relative' }} />;
  return <Fighter level={level} size={size} />;
}
