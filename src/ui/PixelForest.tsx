// Fond « forêt en blocs » original (style pixel, aucune texture d'un jeu existant).
// Dessiné en SVG, 1 unité = 1 bloc, couleurs selon le moment de la journée.

import { memo } from 'react';
import type { DayPhase } from '../engine/dayPhase';
import { customBackground, useBackgrounds } from './backgrounds';

const W = 64;
const H = 128;
const GROUND = 98;

interface Palette {
  sky: string[];
  sun?: { color: string; x: number; y: number; size: number };
  moon?: boolean;
  clouds: string | null;
  leaves: string[];
  backLeaves: string[];
  trunk: string;
  grass: string[];
  dirt: string[];
}

const PALETTES: Record<DayPhase, Palette> = {
  matin: {
    sky: ['#8fbfe6', '#a8cdea', '#c5dbea', '#e9d9cc', '#f6cfb2', '#f9c39c'],
    sun: { color: '#fff1b8', x: 44, y: 70, size: 6 },
    clouds: '#fff7f0',
    leaves: ['#3b8a3a', '#2f7330', '#4aa043'],
    backLeaves: ['#5f9a6a', '#527f5c'],
    trunk: '#6b4a2f',
    grass: ['#62b04c', '#55a043'],
    dirt: ['#8a5a3b', '#7a4e33', '#6c442c'],
  },
  jour: {
    sky: ['#4f9fe8', '#62abec', '#76b8f0', '#8ac4f3', '#9fd0f5', '#b4dcf7'],
    sun: { color: '#fff6c4', x: 46, y: 14, size: 6 },
    clouds: '#ffffff',
    leaves: ['#3e9a3d', '#2f7d32', '#4cb045'],
    backLeaves: ['#5a9e66', '#4c8758'],
    trunk: '#6b4a2f',
    grass: ['#66b84f', '#58a845'],
    dirt: ['#8a5a3b', '#7a4e33', '#6c442c'],
  },
  soir: {
    sky: ['#3e3f86', '#5a4f99', '#8a5c9e', '#c46d8a', '#e98c6f', '#f6ad5c'],
    sun: { color: '#ffb85c', x: 12, y: 84, size: 8 },
    clouds: '#f4b8a8',
    leaves: ['#2f6a3a', '#24562f', '#3b7d44'],
    backLeaves: ['#4f5f6e', '#43515f'],
    trunk: '#4f3524',
    grass: ['#4e8f45', '#447d3c'],
    dirt: ['#6b4430', '#5c3a29', '#4f3223'],
  },
  nuit: {
    sky: ['#070b1c', '#0b1128', '#111a38', '#162246', '#1b2a52', '#203160'],
    moon: true,
    clouds: null,
    leaves: ['#14402a', '#0f3321', '#1a4d33'],
    backLeaves: ['#1c2b45', '#17243b'],
    trunk: '#2e2219',
    grass: ['#24532f', '#1e4728'],
    dirt: ['#3a271c', '#322218', '#2a1c14'],
  },
};

/** Générateur pseudo-aléatoire déterministe : la forêt est identique à chaque affichage. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rect = [number, number, number, number, string];

function tree(out: Rect[], x: number, base: number, trunkH: number, crown: number, colors: string[], trunk: string, r: () => number) {
  for (let i = 0; i < trunkH; i++) out.push([x, base - 1 - i, 1, 1, trunk]);
  const top = base - trunkH - crown + 1;
  for (let row = 0; row < crown; row++) {
    // Couronne en escalier : étroite en haut, large au milieu.
    const half = row === 0 ? 1 : row === 1 || row === crown - 1 ? 2 : crown > 7 ? 4 : 3;
    for (let dx = -half; dx <= half; dx++) {
      if (Math.abs(dx) === half && r() < 0.25) continue;
      out.push([x + dx, top + row, 1, 1, colors[Math.floor(r() * colors.length)]!]);
    }
  }
}

function build(phase: DayPhase): Rect[] {
  const p = PALETTES[phase];
  const r = rng(42);
  const out: Rect[] = [];
  const band = Math.ceil(GROUND / p.sky.length);
  p.sky.forEach((c, i) => out.push([0, i * band, W, band + 1, c]));

  if (phase === 'nuit') {
    for (let i = 0; i < 70; i++) out.push([Math.floor(r() * W), Math.floor(r() * 80), 1, 1, r() < 0.2 ? '#ffe9a8' : '#dfe6ff']);
  }
  if (p.sun) out.push([p.sun.x, p.sun.y, p.sun.size, p.sun.size, p.sun.color]);
  if (p.moon) {
    out.push([46, 12, 6, 6, '#e8ecf5']);
    out.push([47, 13, 1, 1, '#c7cee0'], [49, 15, 2, 1, '#c7cee0'], [48, 16, 1, 1, '#c7cee0']);
  }
  if (p.clouds) {
    for (const [cx, cy] of [
      [4, 22],
      [30, 34],
      [50, 50],
    ] as const) {
      out.push([cx, cy, 10, 2, p.clouds], [cx + 2, cy - 1, 6, 1, p.clouds], [cx + 1, cy + 2, 8, 1, p.clouds]);
    }
  }

  // Rangée du fond (plus petite, plus terne) puis rangée de devant.
  for (let x = 1; x < W; x += 5 + Math.floor(r() * 3)) tree(out, x, GROUND, 8 + Math.floor(r() * 5), 7, p.backLeaves, p.trunk, r);
  for (let x = 3; x < W; x += 8 + Math.floor(r() * 4)) tree(out, x, GROUND + 1, 10 + Math.floor(r() * 6), 9, p.leaves, p.trunk, r);

  // Sol : herbe puis terre en blocs.
  for (let x = 0; x < W; x++) {
    out.push([x, GROUND, 1, 2, p.grass[Math.floor(r() * p.grass.length)]!]);
    if (r() < 0.35) out.push([x, GROUND + 2, 1, 1, p.grass[1]!]);
    for (let y = GROUND + 2; y < H; y++) if (r() < 0.6) out.push([x, y, 1, 1, p.dirt[Math.floor(r() * p.dirt.length)]!]);
  }
  out.unshift([0, GROUND, W, H - GROUND, p.dirt[0]!]);
  return out;
}

const Forest = memo(function Forest({ phase }: { phase: DayPhase }) {
  const rects = build(phase);
  return (
    <div className={`forest forest-${phase}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges">
        {rects.map(([x, y, w, h, c], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
        ))}
      </svg>
      <div className="forest-scrim" />
    </div>
  );
});

/** Fond de l'app : image personnelle si elle existe pour ce moment, sinon la forêt en blocs. */
export function PixelForest({ phase }: { phase: DayPhase }) {
  const { images } = useBackgrounds();
  const custom = customBackground(images, phase);
  if (!custom) return <Forest phase={phase} />;
  return (
    <div className="forest" aria-hidden="true" style={{ backgroundImage: `url(${custom})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="forest-scrim" />
    </div>
  );
}
