// Page « Winter Arc » : l'ascension de novembre. Un point par jour sur le sentier, allumé seulement si le jour est tenu.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Flag, Flame, Mountain, Trophy } from 'lucide-react';
import { LOCK_HABITS, arcStats, type ArcDay } from '../engine/arc';
import { NOVEMBER_2026, dayRange, habitStatus } from '../engine/challenge';
import { challengeValues, dailyKey, type DailyMetrics } from '../engine/daily';
import { localDay } from '../engine/derive';
import type { Repository } from '../storage/db';
import { useChallengeEntries } from './Challenge';
import { useProofMap } from './Habits';
import { withProofs } from '../engine/proof';
import { deviceTimeZone } from './support';
import type { Route } from './App';

/** Points de passage du sentier (pied → sommet) dans un repère 360 × 420. */
const TRAIL: [number, number][] = [
  [70, 400], [150, 372], [110, 330], [200, 300], [150, 255], [235, 225], [190, 180], [262, 150], [228, 110], [266, 74],
];

function trailPoints(n: number): [number, number][] {
  // Répartit n points uniformément le long de la polyligne.
  const seg = TRAIL.slice(1).map((p, i) => Math.hypot(p[0] - TRAIL[i]![0], p[1] - TRAIL[i]![1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    let d = (k / (n - 1)) * total;
    let i = 0;
    while (i < seg.length - 1 && d > seg[i]!) d -= seg[i++]!;
    const t = seg[i]! === 0 ? 0 : d / seg[i]!;
    const a = TRAIL[i]!;
    const b = TRAIL[i + 1]!;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

const ARC_DAYS = dayRange(NOVEMBER_2026.start, NOVEMBER_2026.end);

const LABEL: Record<ArcDay, string> = { tenu: 'tenu', excusé: 'excusé', manqué: 'non tenu', 'à venir': 'à venir', 'aujourd’hui': 'aujourd’hui' };

export function ArcPage({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const tz = deviceTimeZone();
  const today = localDay(Date.now(), tz);
  const { entries } = useChallengeEntries(repo);
  const [dailies, setDailies] = useState<Record<string, DailyMetrics>>({});
  const [appDays, setAppDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const m: Record<string, DailyMetrics> = {};
      for (const d of dayRange(NOVEMBER_2026.start, NOVEMBER_2026.end)) {
        const v = await repo.getKv<DailyMetrics>(dailyKey(d));
        if (v) m[d] = v;
      }
      setDailies(m);
      const rows = await repo.listSessions();
      setAppDays(new Set(rows.filter((r) => r.outcome === 'completed' || r.outcome === 'partial').map((r) => localDay(r.startedAt, tz))));
    })();
  }, [repo, tz]);

  // Mêmes valeurs que le défi : sommeil et pas viennent des données du jour (une seule saisie).
  const proofs = useProofMap(repo, ARC_DAYS);
  const merged = useMemo(() => {
    const out: typeof entries = {};
    for (const d of dayRange(NOVEMBER_2026.start, NOVEMBER_2026.end)) {
      if (!entries[d] && !dailies[d]) continue;
      out[d] = { ...(entries[d] ?? { updatedAt: 0 }), values: withProofs(challengeValues(entries[d]?.values, dailies[d]), proofs[d]) };
    }
    return out;
  }, [entries, dailies, proofs]);

  const stats = arcStats(merged, appDays, today);
  const pts = trailPoints(stats.days.length);
  const started = stats.todayIndex >= 0;
  const dayNum = Math.min(stats.days.length, stats.todayIndex + 1);
  const daysLeft = Math.round((Date.parse(`${NOVEMBER_2026.start}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const todayDone = NOVEMBER_2026.daily.filter((h) => habitStatus(h, merged[today]) === 'done').length;
  const reached = stats.days.reduce((last, d, i) => (d.state === 'tenu' ? i : last), -1);
  const trailDone = reached >= 0 ? pts.slice(0, reached + 1) : [];

  return (
    <div className="arc">
      <header className="arc-top">
        <button className="icon-btn ghost" aria-label="Retour" onClick={() => go({ name: 'today' })}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="arc-brand">Winter Arc</span>
        <span className="pill num">
          <Trophy size={12} aria-hidden="true" /> {stats.locked}/{stats.days.length}
        </span>
      </header>

      <section className="arc-hero">
        <p className="arc-eyebrow num">1 → 30 nov. · 30 jours</p>
        <div className="arc-day num">{started ? dayNum : `J−${daysLeft}`}</div>
        <p className="arc-sub">{started ? `Jour ${dayNum} sur ${stats.days.length}` : 'L’ascension commence le 1er novembre'}</p>
        <div className="arc-chips">
          <span className="pill num">
            <Mountain size={12} aria-hidden="true" /> {stats.locked} jours tenus
          </span>
          <span className="pill num">
            <Flame size={12} aria-hidden="true" /> série {stats.streak}
          </span>
          <span className="pill num">
            <Flag size={12} aria-hidden="true" /> semaines {stats.weeksHeld}/{stats.weeksJudged}
          </span>
        </div>
      </section>

      <div className="arc-scene">
        <svg viewBox="0 0 360 420" role="img" aria-label={`Sentier de novembre : ${stats.locked} jours tenus sur ${stats.days.length}`}>
          <defs>
            <radialGradient id="arc-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f3ecdc" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#f3ecdc" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Étoiles */}
          {[[30, 40], [90, 22], [140, 60], [320, 30], [300, 110], [40, 130], [190, 26], [340, 190], [20, 220]].map(([x, y], i) => (
            <circle key={i} className="arc-star" cx={x} cy={y} r={i % 3 === 0 ? 1.4 : 0.9} style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
          {/* Chaînes de montagnes en couches */}
          <path className="arc-range r1" d="M0 250 L60 170 L105 215 L170 120 L230 200 L290 140 L360 210 L360 420 L0 420 Z" />
          <path className="arc-range r2" d="M0 300 L50 240 L95 280 L160 190 L215 250 L266 64 L310 170 L360 140 L360 420 L0 420 Z" />
          <path className="arc-snow" d="M266 64 L250 112 L258 104 L266 116 L274 102 L282 110 Z" />
          <path className="arc-snow" d="M160 190 L150 210 L160 204 L170 212 Z" />
          <path className="arc-range r3" d="M0 360 L70 300 L130 340 L200 290 L270 350 L360 300 L360 420 L0 420 Z" />
          {/* Ligne de neige */}
          <line className="arc-snowline" x1="0" y1="150" x2="360" y2="150" />
          <text className="arc-snowline-txt" x="352" y="144" textAnchor="end">LIGNE DE NEIGE</text>
          {/* Sentier : pointillé complet + partie parcourue */}
          <polyline className="arc-trail" points={pts.map((p) => p.join(',')).join(' ')} />
          {trailDone.length > 1 && <polyline className="arc-trail done" points={trailDone.map((p) => p.join(',')).join(' ')} />}
          {/* Un point par jour */}
          {stats.days.map((d, i) => {
            const [x, y] = pts[i]!;
            const isToday = i === stats.todayIndex;
            return (
              <g key={d.day}>
                {isToday && <circle className="arc-today-glow" cx={x} cy={y} r="14" fill="url(#arc-glow)" />}
                <circle className={`arc-dot s-${d.state === 'aujourd’hui' ? 'today' : d.state === 'à venir' ? 'future' : d.state}`} cx={x} cy={y} r={isToday ? 6 : 4}>
                  <title>
                    {new Date(`${d.day}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {LABEL[d.state]} · {d.done}/6
                  </title>
                </circle>
              </g>
            );
          })}
          {/* Sommet : 30 novembre */}
          <g className="arc-flag" transform={`translate(${pts[pts.length - 1]![0]} ${pts[pts.length - 1]![1]})`}>
            <line x1="0" y1="0" x2="0" y2="-26" />
            <path d="M0 -26 L18 -20 L0 -14 Z" />
            <text x="0" y="-32" textAnchor="middle">30 NOV.</text>
          </g>
        </svg>
      </div>

      <section className="arc-card">
        <div className="spread">
          <span className="arc-card-title num">
            Aujourd’hui · {todayDone}/{NOVEMBER_2026.daily.length}
          </span>
          <span className="pill num">
            <Flame size={12} aria-hidden="true" /> {stats.streak} j
          </span>
        </div>
        <div className="segments" aria-hidden="true">
          {NOVEMBER_2026.daily.map((h, i) => (
            <span key={h.id} className={i < todayDone ? 'on' : ''} />
          ))}
        </div>
        <div className="arc-legend">
          <span>
            <i className="lg tenu" /> tenu
          </span>
          <span>
            <i className="lg excuse" /> excusé
          </span>
          <span>
            <i className="lg future" /> à venir
          </span>
          <span className="muted num">tenu = {LOCK_HABITS}/6</span>
        </div>
        <button className="btn primary big" onClick={() => go({ name: 'challenge' })}>
          Valider ma journée
        </button>
      </section>
    </div>
  );
}
