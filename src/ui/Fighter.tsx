// Personnage original (aucun personnage existant reproduit), dessiné en SVG.
// Le palier ne fait que changer l'aura et la couleur des cheveux ; il doit venir de données réelles.

export type FighterLevel = 0 | 1 | 2 | 3 | 4;

export const LEVEL_NAMES: Record<FighterLevel, string> = {
  0: 'Base',
  1: 'Éveil',
  2: 'Aura',
  3: 'Aura II',
  4: 'Forme ultime',
};

const SKIN = '#e9b996';
const SKIN_SHADE = '#cf9874';
const GI = '#1f5c4f';
const GI_DARK = '#163f37';

export function Fighter({ level = 0, size = 200, title }: { level?: FighterLevel; size?: number; title?: string }) {
  const gold = level >= 3;
  const hair = gold ? '#f2c94c' : '#1b1c1e';
  const hairLine = gold ? '#c99a1c' : '#000000';
  const aura = level >= 3 ? '#f5c542' : '#3fb8ae';
  const id = `f${level}`;
  return (
    <svg viewBox="0 0 200 240" width={size} height={(size * 240) / 200} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <radialGradient id={`${id}-aura`} cx="50%" cy="55%" r="60%">
          <stop offset="0%" stopColor={aura} stopOpacity="0.9" />
          <stop offset="100%" stopColor={aura} stopOpacity="0" />
        </radialGradient>
      </defs>

      {level >= 1 && (
        <path
          d="M28 236 C16 176 40 146 28 104 C48 122 52 92 60 62 C70 84 78 42 100 8 C122 42 130 84 140 62 C148 92 152 122 172 104 C160 146 184 176 172 236 Z"
          fill={`url(#${id}-aura)`}
          opacity={[0, 0.45, 0.7, 0.8, 1][level]}
        />
      )}
      {level >= 2 && (
        <path
          d="M52 236 C44 190 60 160 52 126 C66 140 70 112 76 90 C84 104 90 72 100 50 C110 72 116 104 124 90 C130 112 134 140 148 126 C140 160 156 190 148 236 Z"
          fill={level >= 4 ? '#ffffff' : aura}
          opacity={level >= 4 ? 0.55 : 0.35}
        />
      )}
      {level >= 4 &&
        [
          [34, 60, 44, 74],
          [166, 56, 156, 72],
          [24, 150, 38, 156],
          [176, 150, 162, 158],
        ].map(([x1, y1, x2, y2]) => <line key={x1} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff6cf" strokeWidth="3" strokeLinecap="round" />)}

      {/* Torse */}
      <path d="M58 124 Q100 110 142 124 L152 236 L48 236 Z" fill={GI} />
      <path d="M88 114 L100 146 L112 114 Z" fill={SKIN_SHADE} />
      <path d="M86 113 L100 150 L114 113" fill="none" stroke={GI_DARK} strokeWidth="5" strokeLinejoin="round" />
      <rect x="50" y="210" width="100" height="12" rx="3" fill="#111" />

      {/* Cou */}
      <rect x="91" y="98" width="18" height="18" rx="4" fill={SKIN_SHADE} />

      {/* Tête */}
      <path d="M76 66 Q75 98 100 106 Q125 98 124 66 Z" fill={SKIN} />
      <path d="M86 77 L97 75 L96 81 Z" fill="#141414" />
      <path d="M114 77 L103 75 L104 81 Z" fill="#141414" />
      <path d="M83 70 L98 73" stroke="#141414" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M117 70 L102 73" stroke="#141414" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M100 82 L98 90 L102 90" fill="none" stroke={SKIN_SHADE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M94 96 L106 96" stroke="#7a3b2a" strokeWidth="2.4" strokeLinecap="round" />

      {/* Cheveux en pics */}
      <path
        d="M72 70 L64 52 L76 54 L68 30 L86 42 L86 16 L100 34 L112 12 L116 38 L134 24 L126 50 L138 52 L128 70 L122 58 L100 54 L78 58 Z"
        fill={hair}
        stroke={hairLine}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Bandeau */}
      <path d="M76 58 Q100 52 124 58 L124 64 Q100 58 76 64 Z" fill="#c8372d" />
      <path d="M123 59 L148 50 L141 60 L150 66 L123 64 Z" fill="#c8372d" />

      {/* Bras en garde */}
      <path d="M64 128 L50 170" stroke={GI} strokeWidth="24" strokeLinecap="round" />
      <path d="M50 170 L76 122" stroke={SKIN} strokeWidth="19" strokeLinecap="round" />
      <path d="M136 128 L150 170" stroke={GI} strokeWidth="24" strokeLinecap="round" />
      <path d="M150 170 L124 122" stroke={SKIN} strokeWidth="19" strokeLinecap="round" />
      <rect x="64" y="122" width="24" height="9" rx="3" fill="#f4f4f2" transform="rotate(-28 76 126)" />
      <rect x="112" y="122" width="24" height="9" rx="3" fill="#f4f4f2" transform="rotate(28 124 126)" />
      <circle cx="80" cy="112" r="14" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="2" />
      <circle cx="120" cy="112" r="14" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="2" />
      <path d="M72 108 L88 108 M72 114 L88 114" stroke={SKIN_SHADE} strokeWidth="1.6" />
      <path d="M112 108 L128 108 M112 114 L128 114" stroke={SKIN_SHADE} strokeWidth="1.6" />
    </svg>
  );
}

/** Décor de fond simple : salle (barres, rack) ou extérieur (ciel, sol). */
export function Scene({ kind, children }: { kind: 'gym' | 'outdoor'; children?: React.ReactNode }) {
  return (
    <div className={`scene scene-${kind}`}>
      <svg className="scene-bg" viewBox="0 0 300 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {kind === 'gym' ? (
          <>
            <rect width="300" height="220" fill="#cfe0d8" />
            <rect x="0" y="160" width="300" height="60" fill="#b9cbc2" />
            <rect x="20" y="30" width="10" height="130" fill="#93a79d" />
            <rect x="110" y="30" width="10" height="130" fill="#93a79d" />
            <rect x="20" y="30" width="100" height="8" fill="#7f948a" />
            <rect x="230" y="60" width="12" height="100" fill="#93a79d" />
            <circle cx="236" cy="90" r="22" fill="#5f6f68" />
            <circle cx="236" cy="132" r="22" fill="#5f6f68" />
          </>
        ) : (
          <>
            <rect width="300" height="220" fill="#bfe0ef" />
            <circle cx="250" cy="40" r="18" fill="#f6efcf" />
            <path d="M0 150 Q80 120 160 145 T300 135 L300 220 L0 220 Z" fill="#a7cf9f" />
            <path d="M0 175 Q120 160 300 178 L300 220 L0 220 Z" fill="#8dbd86" />
          </>
        )}
      </svg>
      {children}
    </div>
  );
}
