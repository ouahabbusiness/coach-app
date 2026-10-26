// Retour après séance : court et exploitable (pas de « bravo » sans conséquence).
// Travail réalisé · écart avec la prescription · progression validée ? · point à surveiller · prochaine exposition.

import { useEffect, useState } from 'react';
import { findVariant } from '../catalog/exercises';
import { decide, type Decision } from '../engine/decide';
import { currentResult } from '../engine/derive';
import { project } from '../engine/session';
import type { SessionState, SetResult } from '../engine/types';
import type { Repository } from '../storage/db';
import { loadsFor, useEquipment } from './equipment';
import { samplesFor } from './actions';

interface Row {
  name: string;
  done: number;
  planned: number;
  prescribed: string;
  achieved: string;
  decision?: Decision;
  watch: string[];
}

export function PostFeedback({ repo, st }: { repo: Repository; st: SessionState }) {
  const eq = useEquipment(repo);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    (async () => {
      const others = [...(await repo.allSessionEvents()).values()]
        .map((e) => project(e))
        .filter((s): s is SessionState => !!s && s.sessionId !== st.sessionId && s.startedAt < st.startedAt)
        .sort((a, b) => b.startedAt - a.startedAt);
      const ws = (await repo.getKv<{ day: string; kg: number }[]>('weight.log')) ?? [];
      const bw = ws.length ? [...ws].sort((a, b) => (a.day < b.day ? -1 : 1)).pop()!.kg : undefined;
      const blocks = [...new Set(st.sets.filter((x) => x.planned.role === 'work').map((x) => x.planned.blockId))];
      const out: Row[] = [];
      for (const b of blocks) {
        const sets = st.sets.filter((x) => x.planned.blockId === b && x.planned.role === 'work');
        const p = sets[0]!.planned;
        const results = sets.filter((x) => x.status === 'done').map(currentResult).filter((r): r is SetResult => !!r);
        const watch: string[] = [];
        if (st.pain.some((x) => sets.some((y) => y.planned.id === x.plannedSetId))) watch.push('douleur signalée');
        if (results.some((r) => r.rir === undefined) && p.kind === 'reps') watch.push('réserve non notée');
        const skipped = sets.filter((x) => x.status === 'skipped');
        if (skipped.length) watch.push(`${skipped.length} série(s) sautée(s) : ${skipped[0]!.skipReason ?? ''}`);
        let decision: Decision | undefined;
        if (p.kind === 'reps' && p.repRange && results.length) {
          // Même règle qu'au lancement : cette séance d'abord, puis les précédentes, avec leur comparabilité.
          const { samples, pain } = await samplesFor(repo, [st, ...others], p);
          const addedLoad = (findVariant(p.variantId)?.variant.equipment ?? []).includes('ceinture de lest');
          decision = decide(p.variantId, { lo: p.repRange[0], hi: p.repRange[1], rir: p.targetRir ?? 2, loadKg: p.loadKg, target: p.targetReps ?? p.repRange[0] }, samples, loadsFor(p.variantId, eq), { pain, addedLoad, bodyweightKg: bw });
        }
        out.push({
          name: findVariant(p.variantId)?.variant.name ?? p.variantId,
          done: results.length,
          planned: sets.length,
          prescribed: p.kind === 'reps' ? `${sets.length} × ${p.repRange ? `${p.repRange[0]}–${p.repRange[1]}` : p.targetReps ?? '?'}${p.loadKg ? ` à ${p.loadKg} kg` : ''}` : `${sets.length} × ${p.targetSeconds ?? '?'} s`,
          achieved: results.length ? results.map((r) => (p.kind === 'reps' ? r.reps ?? '?' : `${r.seconds ?? '?'}s`)).join(' / ') : '—',
          decision,
          watch,
        });
      }
      setRows(out);
    })();
  }, [repo, st, eq]);

  if (!rows || !rows.length) return null;
  return (
    <section className="ui-card stack post-fb" aria-label="Retour du coach">
      <p className="eyebrow" style={{ margin: 0 }}>Retour du coach</p>
      {rows.map((r) => (
        <div key={r.name} className="pf-row">
          <div className="spread">
            <strong>{r.name}</strong>
            <span className="pill num">
              {r.done}/{r.planned} séries
            </span>
          </div>
          <p className="num pf-line">
            Prévu {r.prescribed} · fait {r.achieved}
          </p>
          {r.decision && (
            <p className="pf-line">
              <span className={`pf-tag ${r.decision.progressionAllowed ? 'ok' : ''}`}>
                {r.decision.progressionAllowed ? 'progression validée' : r.decision.action === 'transition' ? 'essai de charge' : r.decision.proposal ? 'à valider' : r.decision.rule === 'séance non comparable' ? 'non comparable' : r.decision.targetReached ? 'cible atteinte' : 'à consolider'}
              </span>{' '}
              {r.decision.reason}
            </p>
          )}
          {r.watch.length > 0 && <p className="pf-line muted">À surveiller : {r.watch.join(' · ')}</p>}
        </div>
      ))}
    </section>
  );
}
