// Volume de la semaine par muscle : prévu vs fait (direct), indirect à part, échauffement et EMOM à part.

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { weekStart } from '../engine/challenge';
import { localDay } from '../engine/derive';
import { project } from '../engine/session';
import type { SessionState } from '../engine/types';
import { REFERENCE_SETS, weekVolume, type SetCount, type WeekVolume } from '../engine/volume';
import { dateOf } from '../engine/planning';
import type { Repository } from '../storage/db';
import { loadFree } from './FreeWork';
import { loadPlanning } from './Planning';
import { deviceTimeZone } from './support';
import { loadTemplates } from './templates';
import { findVariant } from '../catalog/exercises';

export function VolumeCard({ repo }: { repo: Repository }) {
  const [v, setV] = useState<WeekVolume | null>(null);
  useEffect(() => {
    (async () => {
      const tz = deviceTimeZone();
      const today = localDay(Date.now(), tz);
      const ws = weekStart(today);
      const days = Array.from({ length: 7 }, (_, i) => dateOf(ws, i));
      const tpls = await loadTemplates(repo);
      const items = (await loadPlanning(repo)).filter((i) => i.weekStart === ws && i.kind === 'seance' && !(i.adjustment && i.adjustment.decision !== 'adaptée'));
      const planned: SetCount[] = items.flatMap((i) => (i.adapted?.lines ?? tpls.find((t) => t.id === i.templateId)?.lines ?? []).flatMap((l) => Array.from({ length: l.sets }, () => ({ variantId: l.variantId, role: l.role, done: false }))));
      const states = [...(await repo.allSessionEvents()).values()].map((e) => project(e)).filter((s): s is SessionState => !!s && days.includes(localDay(s.startedAt, s.timeZone)));
      const done: SetCount[] = states.flatMap((s) => s.sets.filter((x) => x.status === 'done').map((x) => ({ variantId: x.planned.variantId, role: x.planned.role, done: true })));
      const free = (await loadFree(repo))
        .filter((b) => days.includes(b.day))
        .map((b) => ({ variantId: b.variantId, label: `${b.format === 'emom' ? `EMOM ${b.rounds.length} min` : `${b.rounds.length} séries libres`} · ${findVariant(b.variantId)?.variant.name ?? b.variantId}` }));
      setV(weekVolume(planned, done, free));
    })();
  }, [repo]);
  if (!v) return null;
  const rows = v.muscles.filter((m) => m.plannedDirect || m.doneDirect || m.doneIndirect || m.free.length);
  return (
    <section className="hero-card" aria-label="Volume de la semaine">
      <span className="tile-label">
        <BarChart3 size={14} aria-hidden="true" /> Volume de la semaine
      </span>
      {rows.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Rien de prévu ni de fait cette semaine.</p>
      ) : (
        <ul className="vol-list">
          {rows.map((m) => (
            <li key={m.muscle}>
              <span className="vol-name">{m.muscle}</span>
              <span className="vol-bar" aria-hidden="true">
                <i className="planned" style={{ width: `${Math.min(100, (m.plannedDirect / (REFERENCE_SETS * 1.6)) * 100)}%` }} />
                <i className="done" style={{ width: `${Math.min(100, (m.doneDirect / (REFERENCE_SETS * 1.6)) * 100)}%` }} />
                <b style={{ left: `${(REFERENCE_SETS / (REFERENCE_SETS * 1.6)) * 100}%` }} />
              </span>
              <span className="vol-num num">
                {m.doneDirect}/{m.plannedDirect}
                {m.doneIndirect ? <small> +{m.doneIndirect} ind.</small> : null}
                {m.free.length ? <small> + EMOM</small> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>
        Séries de travail directes faites / prévues. Trait = repère ≈ {REFERENCE_SETS} séries/sem. (repère, pas un quota). Échauffement : {v.warmupSets} série(s), non compté.
      </p>
      {v.uncertain.map((u) => (
        <p key={u} className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>
          ≈ {u}
        </p>
      ))}
    </section>
  );
}
