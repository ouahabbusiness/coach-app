// Suivi du poids : saisie rapide, courbe et historique. Données locales uniquement.

import { useCallback, useEffect, useState } from 'react';
import { Plus, Scale, Sunrise, Trash2 } from 'lucide-react';
import { localDay } from '../engine/derive';
import { average7, dailyWeights, isValidKg, trend, type WeighIn, type WeightStatus } from '../engine/weight';
import type { Repository } from '../storage/db';
import { Modal } from './common';
import { useTracking } from './trackingPrefs';
import { deviceTimeZone, newId } from './support';

const KEY = 'weight.log';
const fmtKg = (kg: number) => kg.toLocaleString('fr-BE', { maximumFractionDigits: 1 });

export function useWeightLog(repo: Repository) {
  const [log, setLog] = useState<WeighIn[]>([]);
  useEffect(() => {
    repo.getKv<WeighIn[]>(KEY).then((v) => v && setLog(v));
  }, [repo]);
  const save = useCallback(
    async (next: WeighIn[]) => {
      await repo.setKv(KEY, next);
      setLog(next);
    },
    [repo],
  );
  const add = (kg: number, status: WeightStatus, day: string, fasting = true) => save([...log, { id: newId(), day, kg, status, fasting, at: Date.now() }]);
  const remove = (day: string) => save(log.filter((w) => w.day !== day));
  return { log, days: dailyWeights(log), add, remove };
}

/** Fenêtre de saisie : un chiffre, son statut, la date. */
export function WeightModal({ open, onClose, onSave, last }: { open: boolean; onClose: () => void; onSave: (kg: number, status: WeightStatus, day: string, fasting: boolean) => void; last?: number }) {
  const today = localDay(Date.now(), deviceTimeZone());
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<WeightStatus>('mesuré');
  const [day, setDay] = useState(today);
  const [fasting, setFasting] = useState(true);
  useEffect(() => {
    if (open) {
      setDraft(last !== undefined ? String(last).replace('.', ',') : '');
      setStatus('mesuré');
      setDay(today);
      setFasting(true);
    }
  }, [open, last, today]);
  const kg = Number(draft.replace(',', '.'));
  const valid = draft.trim() !== '' && isValidKg(kg) && day <= today;
  return (
    <Modal open={open} onClose={onClose} title="Poids">
      <div className="stack">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input aria-label="Poids en kg" type="text" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ fontSize: '1.6rem', fontWeight: 700 }} />
          <span className="muted">kg</span>
        </div>
        <div className="chips" role="group" aria-label="Fiabilité">
          {(['mesuré', 'estimé'] as const).map((s) => (
            <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'mesuré' ? 'Balance' : '≈ Estimé'}
            </button>
          ))}
        </div>
        <button className="chip" aria-pressed={fasting} onClick={() => setFasting(!fasting)} style={{ alignSelf: 'flex-start' }}>
          <Sunrise size={14} aria-hidden="true" /> À jeun
        </button>
        <input aria-label="Date de la pesée" type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} />
        <button className="btn primary block" disabled={!valid} onClick={() => valid && onSave(Math.round(kg * 10) / 10, status, day, fasting)}>
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}

/** Courbe minimaliste : points (pesées) + ligne de moyenne 7 jours. */
function Chart({ days }: { days: WeighIn[] }) {
  const pts = days.slice(-30);
  if (pts.length < 2) return null;
  const W = 320;
  const H = 120;
  const kgs = pts.map((p) => p.kg);
  const min = Math.min(...kgs) - 0.5;
  const max = Math.max(...kgs) + 0.5;
  const t0 = Date.parse(pts[0]!.day);
  const span = Math.max(1, Date.parse(pts[pts.length - 1]!.day) - t0);
  const x = (d: string) => 8 + ((Date.parse(d) - t0) / span) * (W - 16);
  const y = (kg: number) => 8 + (1 - (kg - min) / (max - min)) * (H - 16);
  const avg = pts.map((p) => ({ d: p.day, kg: average7(days, p.day)!.kg }));
  const path = avg.map((a, i) => `${i ? 'L' : 'M'}${x(a.d).toFixed(1)},${y(a.kg).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Courbe du poids sur les dernières pesées">
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p) => (
        <circle key={p.day} cx={x(p.day)} cy={y(p.kg)} r="3" fill={p.status === 'mesuré' ? 'var(--text)' : 'none'} stroke="var(--text)" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

const TREND_LABEL = { baisse: '↘ Baisse', stable: '→ Stable', hausse: '↗ Hausse', 'données insuffisantes': '… Pas assez de pesées' } as const;

/** Carte complète pour l'écran Progrès. */
export function WeightCard({ repo }: { repo: Repository }) {
  const { days, add, remove } = useWeightLog(repo);
  const [open, setOpen] = useState(false);
  const today = localDay(Date.now(), deviceTimeZone());
  const last = days[days.length - 1];
  const t = trend(days, today);
  const avg = average7(days, today);
  return (
    <section className="hero-card" aria-label="Poids">
      <div className="spread">
        <span className="tile-label"><Scale size={14} aria-hidden="true" /> Poids à jeun</span>
        <button className="btn primary icon" aria-label="Ajouter une pesée" onClick={() => setOpen(true)}>
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span className="tile-value num">{last ? fmtKg(last.kg) : '—'}</span>
        <span className="muted">kg</span>
        {last && <span className="badge">{last.status === 'mesuré' ? 'balance' : 'estimé'}</span>}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <span className={`badge ${t.status === 'données insuffisantes' ? '' : 'ok'}`}>
          {TREND_LABEL[t.status]}
          {t.deltaKg !== undefined ? ` ${t.deltaKg > 0 ? '+' : ''}${fmtKg(t.deltaKg)} kg / 7 j` : ''}
        </span>
        {avg && <span className="badge num">moy. 7 j {fmtKg(avg.kg)} kg</span>}
      </div>
      <Chart days={days} />
      {days.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>Historique ({days.length})</summary>
          <ul className="habits">
            {[...days].reverse().map((w) => (
              <li key={w.day} className="spread" style={{ minHeight: 48 }}>
                <span className="num">{new Date(`${w.day}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {fmtKg(w.kg)} kg {w.status === 'estimé' ? '≈' : ''}
                </span>
                <button className="btn ghost icon" aria-label={`Supprimer la pesée du ${w.day}`} onClick={() => window.confirm('Supprimer cette pesée ?') && remove(w.day)}>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <WeightModal
        open={open}
        onClose={() => setOpen(false)}
        last={last?.kg}
        onSave={async (kg, status, day, fasting) => {
          await add(kg, status, day, fasting);
          setOpen(false);
        }}
      />
    </section>
  );
}

const SKIP = (day: string) => `weighin.skip.${day}`;

/**
 * Pesée du matin : à la première ouverture d'une nouvelle journée, l'écran entier demande le poids.
 * On peut seulement dire « pas de balance aujourd'hui » avec une raison : rien n'est inventé, rien n'est puni.
 */
export function WeighInGate({ repo }: { repo: Repository }) {
  const { days, add } = useWeightLog(repo);
  const { prefs } = useTracking(repo);
  const today = localDay(Date.now(), deviceTimeZone());
  const [ready, setReady] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [draft, setDraft] = useState('');
  const [fasting, setFasting] = useState(true);
  const [why, setWhy] = useState(false);
  useEffect(() => {
    repo.getKv<string>(SKIP(today)).then((v) => {
      setSkipped(!!v);
      setReady(true);
    });
  }, [repo, today]);
  const last = days[days.length - 1];
  useEffect(() => {
    if (last && !draft) setDraft(String(last.kg).replace('.', ','));
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready || skipped || !prefs.weighGate || days.some((d) => d.day === today)) return null;
  const kg = Number(draft.replace(',', '.'));
  const valid = draft.trim() !== '' && isValidKg(kg);
  return (
    <div className="weigh-gate" role="dialog" aria-modal="true" aria-label="Pesée du matin">
      <p className="weigh-eyebrow">
        <Sunrise size={16} aria-hidden="true" /> {new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h1 className="weigh-title">Ton poids</h1>
      <div className="weigh-input">
        <input aria-label="Poids en kg" type="text" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
        <span>kg</span>
      </div>
      {last && <p className="weigh-last num">Dernière pesée : {fmtKg(last.kg)} kg</p>}
      <button className={`chip ${fasting ? 'on' : ''}`} aria-pressed={fasting} onClick={() => setFasting(!fasting)}>
        <Sunrise size={14} aria-hidden="true" /> À jeun
      </button>
      <button className="btn primary big block weigh-save" disabled={!valid} onClick={() => valid && add(Math.round(kg * 10) / 10, 'mesuré', today, fasting)}>
        Valider
      </button>
      {!why ? (
        <button className="weigh-skip" onClick={() => setWhy(true)}>
          Pas de balance aujourd’hui
        </button>
      ) : (
        <div className="chips" style={{ justifyContent: 'center' }}>
          {['Déplacement', 'Pas à jeun', 'Balance indisponible'].map((r) => (
            <button key={r} className="chip" onClick={async () => (await repo.setKv(SKIP(today), r), setSkipped(true))}>
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
