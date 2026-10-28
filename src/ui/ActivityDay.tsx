// Bilan d'activité du jour : tu enregistres ce que tu as fait (pas, tapis, course), le coach estime et signale les incohérences.
// Le bilan ne modifie jamais ta cible alimentaire : bilan d'activité, conseil ponctuel et révision de la cible sont trois choses séparées.

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { DailyMetrics } from '../engine/daily';
import { dayActivityReport } from '../engine/dayActivity';
import type { Repository } from '../storage/db';
import { Help, Modal } from './common';
import { loadComplement } from './profileComplement';
import { loadOnboarding } from './profileStore';

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="chip" aria-pressed={on} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {on && <Check size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ActivityDayModal({
  open,
  onClose,
  repo,
  daily,
  saveDaily,
  runKm,
}: {
  open: boolean;
  onClose: () => void;
  repo: Repository;
  daily?: DailyMetrics;
  saveDaily: (m: DailyMetrics) => Promise<void> | void;
  runKm: number;
}) {
  const [treadmill, setTreadmill] = useState<import('../engine/activity').TreadmillUse | undefined>();
  const [weightKg, setWeightKg] = useState<number | undefined>();
  useEffect(() => {
    if (!open) return;
    (async () => {
      setTreadmill((await loadComplement(repo)).activity?.treadmill);
      const w = (await repo.getKv<{ day: string; kg: number }[]>('weight.log')) ?? [];
      const last = [...w].sort((a, b) => (a.day < b.day ? -1 : 1)).pop();
      setWeightKg(last?.kg ?? (await loadOnboarding(repo)).answers.body.weightKg.value);
    })();
  }, [open, repo]);

  const mode = daily?.stepsMode ?? 'separe';
  const includes = daily?.stepsIncludes ?? [];
  const patch = (p: Partial<DailyMetrics>) => void saveDaily({ ...(daily ?? {}), ...p, updatedAt: Date.now() });
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.floor(Number(v) || 0)));
  const report = useMemo(
    () =>
      weightKg
        ? dayActivityReport({ weightKg, steps: daily?.steps, treadmillSteps: daily?.treadmillSteps, mode, includes, measured: daily?.stepsMeasured, final: daily?.dayFinal, treadmill, runKm })
        : undefined,
    [weightKg, daily, mode, includes, treadmill, runKm],
  );

  return (
    <Modal open={open} onClose={onClose} title="Bilan d’activité du jour">
      <div className="stack">
        <Help>Tu enregistres ce que tu as fait ; le coach estime. Deux modes, jamais mélangés : pas hors tapis et tapis séparés, ou total du jour. Rien n’est compté deux fois.</Help>
        <div className="chips">
          <Chip on={mode === 'separe'} onClick={() => patch({ stepsMode: 'separe' })}>pas séparés</Chip>
          <Chip on={mode === 'total'} onClick={() => patch({ stepsMode: 'total' })}>total du jour</Chip>
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{mode === 'total' ? 'Total de pas du jour' : 'Pas hors tapis (montre)'}</span>
          <input type="number" inputMode="numeric" min={0} placeholder="—" value={daily?.steps ?? ''} onChange={(e) => patch({ steps: num(e.target.value) })} />
        </label>
        {mode === 'separe' ? (
          <label className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Pas du tapis (affichés par le tapis)</span>
            <input type="number" inputMode="numeric" min={0} placeholder="—" value={daily?.treadmillSteps ?? ''} onChange={(e) => patch({ treadmillSteps: num(e.target.value) })} />
          </label>
        ) : (
          <>
            <p className="eyebrow" style={{ margin: 0 }}>Ce total comprend déjà</p>
            <div className="chips">
              {(['tapis', 'courses'] as const).map((k) => (
                <Chip key={k} on={includes.includes(k)} onClick={() => patch({ stepsIncludes: includes.includes(k) ? includes.filter((x) => x !== k) : [...includes, k] })}>
                  {k === 'tapis' ? 'tapis de marche' : 'courses'}
                </Chip>
              ))}
            </div>
          </>
        )}
        <div className="chips">
          <Chip on={daily?.stepsMeasured !== false} onClick={() => patch({ stepsMeasured: true })}>mesurés</Chip>
          <Chip on={daily?.stepsMeasured === false} onClick={() => patch({ stepsMeasured: false })}>estimés</Chip>
          <Chip on={!!daily?.dayFinal} onClick={() => patch({ dayFinal: !daily?.dayFinal })}>journée terminée</Chip>
        </div>

        {!weightKg && <p className="muted" style={{ margin: 0 }}>Poids inconnu : renseigne-le pour estimer la dépense.</p>}
        {report && (
          <section className="card stack" aria-label="Bilan">
            <strong>{report.status === 'terminée' ? 'Bilan de la journée terminée' : 'Bilan partiel · journée en cours'}</strong>
            {report.lines.map((l) => (
              <p key={l} className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>{l}</p>
            ))}
            {report.lines.length > 0 && (
              <p className="num" style={{ margin: 0 }}>
                ≈ <strong>{report.kcal} kcal</strong> d’activité enregistrée <span className="muted">(estimation, hors métabolisme de base)</span>
              </p>
            )}
            {report.missing.length > 0 && <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Manque : {report.missing.join(', ')}.</p>}
            {report.issues.map((l) => (
              <p key={l} role="status" className="notice" style={{ margin: 0 }}>{l}</p>
            ))}
            <Help>Ce bilan ne modifie pas ta cible alimentaire. Une journée exceptionnelle pourra donner un conseil ponctuel ; ta cible habituelle n’est révisée qu’à partir de plusieurs journées complètes, de ton poids et de ton alimentation notée.</Help>
          </section>
        )}
        <button className="btn ghost block" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
