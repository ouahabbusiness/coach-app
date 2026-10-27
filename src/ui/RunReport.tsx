// Rapport de la course d'initiation : tracé dessiné sur l'appareil (aucune carte chargée), allure par 30 s,
// temps par km, mesures avec leur source, constats et prochaine course.

import { useEffect, useState } from 'react';
import { Footprints } from 'lucide-react';
import { analyzeInitiation, type InitiationInput } from '../engine/runInitiation';
import { fmtPace } from '../engine/runTrack';
import type { Repository } from '../storage/db';
import { Modal } from './common';

/** Progrès : dernière course d'initiation, rapport rouvrable à tout moment. */
export function InitiationCard({ repo }: { repo: Repository }) {
  const [e, setE] = useState<InitiationEntry | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    repo.getKv<(InitiationEntry | { kind?: string })[]>('run.log').then((r) => setE(([...(r ?? [])].reverse().find((x) => x.kind === 'initiation') as InitiationEntry | undefined) ?? null));
  }, [repo]);
  if (!e) return null;
  const r = analyzeInitiation(e);
  return (
    <section className="hero-card" aria-label="Course d’initiation">
      <span className="tile-label">
        <Footprints size={14} aria-hidden="true" /> Course d’initiation · {e.day}
      </span>
      <p className="num" style={{ margin: 0 }}>
        Allure facile {r.easyPace ? `${fmtPace(r.easyPace)}/km` : 'inconnue'} · {r.easyStatus} · {r.walkBreaks} passage(s) en marche
      </p>
      <button className="btn sm" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
        Voir le rapport et le tracé
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Course d’initiation">
        <RunReport entry={e} />
      </Modal>
    </section>
  );
}

export interface InitiationEntry extends InitiationInput {
  id: string;
  day: string;
  kind: 'initiation';
}

function Trace({ segments }: { segments: InitiationInput['segments'] }) {
  const pts = segments.flat();
  if (pts.length < 2) return null;
  const lat0 = pts.reduce((t, p) => t + p[0], 0) / pts.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[1] * kx);
  const ys = pts.map((p) => -p[0]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const P = (p: (typeof pts)[number]) => `${(((p[1] * kx - minX) / span) * 280 + 10).toFixed(1)},${(((-p[0] - minY) / span) * 280 + 10).toFixed(1)}`;
  return (
    <svg viewBox="0 0 300 300" className="run-trace" role="img" aria-label="Tracé de la course">
      {segments.map((s, i) => (
        <polyline key={i} points={s.map(P).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <circle cx={P(pts[0]!).split(',')[0]} cy={P(pts[0]!).split(',')[1]} r="6" className="run-trace-start" />
      <circle cx={P(pts[pts.length - 1]!).split(',')[0]} cy={P(pts[pts.length - 1]!).split(',')[1]} r="6" className="run-trace-end" />
    </svg>
  );
}

function PaceChart({ buckets }: { buckets: ReturnType<typeof analyzeInitiation>['buckets'] }) {
  const paced = buckets.filter((b) => b.pace !== undefined);
  if (paced.length < 2) return null;
  // Allure affichée entre 3:00 et 12:00 /km (plus haut = plus rapide).
  const lo = 180;
  const hi = 720;
  const w = 300;
  const h = 120;
  const x = (s: number) => (s / Math.max(1, buckets[buckets.length - 1]!.s)) * (w - 10) + 5;
  const y = (p: number) => ((Math.min(hi, Math.max(lo, p)) - lo) / (hi - lo)) * (h - 10) + 5;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="run-pace" role="img" aria-label="Allure toutes les 30 secondes">
      {buckets.map((b) => (b.walk ? <rect key={b.s} x={x(b.s)} y={0} width={(w - 10) / buckets.length + 1} height={h} className="run-pace-walk" /> : null))}
      <polyline points={paced.map((b) => `${x(b.s).toFixed(1)},${y(b.pace!).toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function RunReport({ entry }: { entry: InitiationEntry }) {
  const r = analyzeInitiation(entry);
  return (
    <div className="stack run-report">
      <p className="cq-who">Course d’initiation · {entry.day}</p>
      <Trace segments={entry.segments} />
      <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>Tracé dessiné sur l’appareil, sans carte ni envoi.</p>
      <PaceChart buckets={r.buckets} />
      <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>Allure toutes les 30 s (haut = plus rapide). Zones grisées = marche.</p>
      <ul className="run-metrics">
        {r.metrics.map((m) => (
          <li key={m.label}>
            <span>{m.label}</span>
            <strong className="num">{m.value}</strong>
            <small>{m.source}</small>
          </li>
        ))}
      </ul>
      {r.splits.length > 0 && (
        <p className="num" style={{ margin: 0 }}>
          Temps par km : {r.splits.map((s, i) => `km ${i + 1} ${fmtPace(s)}`).join(' · ')}
        </p>
      )}
      <p style={{ margin: 0 }}>
        Allure facile : <b className="num">{r.easyPace ? `${fmtPace(r.easyPace)}/km` : 'inconnue'}</b> · {r.easyStatus}
      </p>
      {r.findings.length > 0 && (
        <ul className="mini-list">
          {r.findings.map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      )}
      <div className="card ob-card">
        <p className="cq-who">Prochaine course</p>
        <p className="cq-q" style={{ margin: 0 }}>{r.next.title}</p>
        <p className="cq-line" style={{ margin: 0 }}>{r.next.detail}</p>
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{r.next.why}</p>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>
        Règles locales de l’app (seuils = choix de conception, non relus par un professionnel). Aucune IA. FC : recopiée depuis la montre, pas lue automatiquement.
      </p>
    </div>
  );
}
