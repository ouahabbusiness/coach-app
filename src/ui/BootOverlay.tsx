// Transition « Discipline Protocol » au lancement d'une séance : grille, balayage, synchronisation (~1 s).
// Purement visuelle ; masquée si l'utilisateur a réduit les animations.

import { useEffect } from 'react';

export function BootOverlay({ title, onDone }: { title: string; onDone: () => void }) {
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(onDone, reduce ? 0 : 1150);
    return () => window.clearTimeout(id);
  }, [onDone]);
  return (
    <div className="boot" role="status" aria-label="Lancement de la séance">
      <div className="boot-grid" aria-hidden="true" />
      <div className="boot-scan" aria-hidden="true" />
      <div className="boot-core">
        <div className="boot-title">DISCIPLINE PROTOCOL</div>
        <div className="boot-main">SYNCHRONISATION</div>
        <div className="boot-bar" aria-hidden="true">
          <span />
        </div>
        <div className="boot-sub">{title.toUpperCase()} // NO EXCUSES</div>
      </div>
    </div>
  );
}
