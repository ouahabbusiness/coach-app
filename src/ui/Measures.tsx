// Mensurations : la vraie preuve qu'une zone change (le poids seul ne dit pas où le gras part).

import { useEffect, useState } from 'react';
import { Plus, Ruler } from 'lucide-react';
import { localDay } from '../engine/derive';
import type { Repository } from '../storage/db';
import { Modal } from './common';
import { deviceTimeZone } from './support';

const KEY = 'measures.log';
type Part = 'taille' | 'hanches' | 'cuisse' | 'bras' | 'poitrine' | 'epaules';
const PARTS: { id: Part; label: string; how: string; optional?: boolean }[] = [
  { id: 'taille', label: 'Tour de taille', how: 'Au niveau du nombril, ventre relâché' },
  { id: 'hanches', label: 'Hanches', how: 'Au plus large des fessiers, pieds joints' },
  { id: 'cuisse', label: 'Cuisse', how: '15 cm au-dessus du genou, même jambe à chaque fois' },
  // Facultatif, toutes les 4 semaines : un indicateur complémentaire, jamais une preuve directe de muscle gagné ; rien n'est ajusté à partir d'une seule mesure.
  { id: 'bras', label: 'Bras', how: 'Bras relâché, au plus large du biceps, même bras à chaque fois', optional: true },
  { id: 'poitrine', label: 'Poitrine', how: 'Sous les aisselles, ruban horizontal, à la fin d’une expiration normale', optional: true },
  { id: 'epaules', label: 'Épaules', how: 'Au plus large des épaules, pieds joints, bras relâchés', optional: true },
];

interface Measure {
  day: string;
  values: Partial<Record<Part, number>>;
}

const fmt = (n: number) => n.toLocaleString('fr-BE', { maximumFractionDigits: 1 });

export function MeasuresCard({ repo }: { repo: Repository }) {
  const [log, setLog] = useState<Measure[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<Part, string>>>({});
  const today = localDay(Date.now(), deviceTimeZone());
  useEffect(() => {
    repo.getKv<Measure[]>(KEY).then((v) => v && setLog(v));
  }, [repo]);

  const first = (p: Part) => log.find((m) => m.values[p] !== undefined)?.values[p];
  const last = (p: Part) => [...log].reverse().find((m) => m.values[p] !== undefined)?.values[p];

  const save = async () => {
    const values: Measure['values'] = {};
    for (const p of PARTS) {
      const n = Number((draft[p.id] ?? '').replace(',', '.'));
      if (draft[p.id]?.trim() && n > 20 && n < 250) values[p.id] = Math.round(n * 10) / 10;
    }
    if (!Object.keys(values).length) return;
    const next = [...log.filter((m) => m.day !== today), { day: today, values }].sort((a, b) => (a.day < b.day ? -1 : 1));
    await repo.setKv(KEY, next);
    setLog(next);
    setOpen(false);
  };

  return (
    <section className="hero-card" aria-label="Mensurations">
      <div className="spread">
        <span className="tile-label">
          <Ruler size={14} aria-hidden="true" /> Mensurations
        </span>
        <button className="btn primary icon" aria-label="Ajouter des mesures" onClick={() => (setDraft({}), setOpen(true))}>
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="grid3">
        {PARTS.filter((p) => !p.optional || last(p.id) !== undefined).map((p) => {
          const l = last(p.id);
          const f = first(p.id);
          const d = l !== undefined && f !== undefined ? l - f : undefined;
          return (
            <div key={p.id} className="measure">
              <span className="kpi-label">{p.label}</span>
              <span className="kpi-value num">{l !== undefined ? fmt(l) : '—'}<span className="kpi-sub"> cm</span></span>
              {d !== undefined && d !== 0 && <span className={`pill num ${d < 0 ? 'ok' : ''}`}>{d > 0 ? '+' : ''}{fmt(d)} cm</span>}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>1 fois par semaine, le matin à jeun, même endroit.</p>
      <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>Bras, poitrine, épaules : facultatif, toutes les 4 semaines, pas juste après l’entraînement. Mesure douteuse : refais-la.</p>
      <Modal open={open} onClose={() => setOpen(false)} title="Mensurations">
        <div className="stack">
          {PARTS.map((p) => (
            <label key={p.id} className="field">
              {p.label}{p.optional ? ' (facultatif)' : ''}
              <span className="hint">{p.how}</span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input type="text" inputMode="decimal" value={draft[p.id] ?? ''} onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })} />
                <span className="muted">cm</span>
              </div>
            </label>
          ))}
          <button className="btn primary block" onClick={save}>
            Enregistrer
          </button>
        </div>
      </Modal>
    </section>
  );
}
