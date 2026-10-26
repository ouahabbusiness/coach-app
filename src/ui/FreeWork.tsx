// Séance libre / EMOM : on déclare ce qui a été fait, le coach l'intègre au travail de la semaine
// sans le transformer en maximum. Rien n'est prérempli comme réussi.

import { useEffect, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { EXERCISES, findVariant } from '../catalog/exercises';
import { localDay } from '../engine/derive';
import { nextEmom, summarize, type FreeBlock, type Grip } from '../engine/freeWork';
import type { WeighIn } from '../engine/weight';
import type { Repository } from '../storage/db';
import { loadsFor, useEquipment } from './equipment';
import { deviceTimeZone, newId } from './support';
import type { Route } from './App';

const KEY = 'free.log';

export async function loadFree(repo: Repository): Promise<FreeBlock[]> {
  return (await repo.getKv<FreeBlock[]>(KEY)) ?? [];
}

const VARIANTS = EXERCISES.flatMap((e) => e.variants.filter((v) => v.kind === 'reps').map((v) => ({ id: v.id, name: v.name })));
const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s.replace(',', '.'))) ? undefined : Number(s.replace(',', '.')));

function Scale({ value, onChange, label }: { value?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="kpi-label">{label}</span>
      <div className="effort">
        {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button key={n} className="chip num" aria-pressed={value === n} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FreeWorkPage({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const today = localDay(Date.now(), deviceTimeZone());
  const eq = useEquipment(repo);
  const [log, setLog] = useState<FreeBlock[]>([]);
  const [b, setB] = useState<FreeBlock | null>(null);
  const [minutes, setMinutes] = useState('12');
  const [load, setLoad] = useState('');
  const [secs, setSecs] = useState('');

  useEffect(() => {
    loadFree(repo).then(setLog);
  }, [repo]);

  const start = async () => {
    const w = ((await repo.getKv<WeighIn[]>('weight.log')) ?? []).filter((x) => x.day === today).pop();
    setB({ id: newId(), day: today, at: Date.now(), format: 'emom', variantId: 'pullup-weighted', grip: 'pronation', targetPerRound: 6, rounds: Array(12).fill(null), bodyWeightKg: w?.kg });
    setMinutes('12');
    setLoad('');
    setSecs('');
  };

  const save = async () => {
    if (!b) return;
    const next = [...log, { ...b, loadKg: num(load), secondsPerRound: num(secs) }];
    await repo.setKv(KEY, next);
    setLog(next);
    setB(null);
  };

  const setRecovered = async (id: string, v: boolean) => {
    const next = log.map((x) => (x.id === id ? { ...x, note: v ? 'récupéré' : 'récupération difficile' } : x));
    await repo.setKv(KEY, next);
    setLog(next);
  };

  if (b) {
    const n = Math.max(1, Math.min(60, num(minutes) ?? 12));
    const rounds = b.rounds.length === n ? b.rounds : Array.from({ length: n }, (_, i) => b.rounds[i] ?? null);
    const set = (p: Partial<FreeBlock>) => setB({ ...b, ...p, rounds: p.rounds ?? rounds });
    return (
      <>
        <button className="btn ghost" onClick={() => setB(null)}>
          <ChevronLeft size={20} aria-hidden="true" /> Annuler
        </button>
        <h1 className="page-title" style={{ margin: '8px 0 12px' }}>Séance libre</h1>
        <section className="ui-card stack">
          <div className="seg2">
            <button aria-pressed={b.format === 'emom'} onClick={() => set({ format: 'emom' })}>
              EMOM
            </button>
            <button aria-pressed={b.format === 'series'} onClick={() => set({ format: 'series', targetPerRound: undefined })}>
              Séries
            </button>
          </div>
          <label className="field">
            Exercice
            <select value={b.variantId} onChange={(e) => set({ variantId: e.target.value })}>
              {VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <div className="chips" role="group" aria-label="Prise">
            {(['pronation', 'supination', 'neutre'] as Grip[]).map((g) => (
              <button key={g} className="chip" aria-pressed={b.grip === g} onClick={() => set({ grip: g })}>
                {g}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Amplitude">
            <button className="chip" aria-pressed={b.strict === true} onClick={() => set({ strict: true })}>
              Stricte, complète
            </button>
            <button className="chip" aria-pressed={b.strict === false} onClick={() => set({ strict: false })}>
              Partielle / élan
            </button>
          </div>
          <div className="grid2">
            <label className="field">
              Lest (kg)
              <input inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} placeholder="0" />
            </label>
            <label className="field">
              {b.format === 'emom' ? 'Minutes' : 'Séries'}
              <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
          </div>
          {b.format === 'emom' && (
            <div className="grid2">
              <label className="field">
                Rép. visées / minute
                <input inputMode="numeric" value={b.targetPerRound ?? ''} onChange={(e) => set({ targetPerRound: num(e.target.value) })} />
              </label>
              <label className="field">
                Temps pour les faire (s)
                <input inputMode="numeric" value={secs} onChange={(e) => setSecs(e.target.value)} placeholder="ex. 20" />
              </label>
            </div>
          )}
          <p className="kpi-label" style={{ margin: 0 }}>Répétitions réellement faites</p>
          <div className="rounds">
            {rounds.map((r, i) => (
              <label key={i} className="round">
                <small className="num">{i + 1}</small>
                <input inputMode="numeric" value={r ?? ''} aria-label={`${b.format === 'emom' ? 'Minute' : 'Série'} ${i + 1}`} onChange={(e) => set({ rounds: rounds.map((x, j) => (j === i ? num(e.target.value) ?? null : x)) })} />
              </label>
            ))}
          </div>
          {b.format === 'emom' && b.targetPerRound !== undefined && (
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ rounds: rounds.map(() => b.targetPerRound!) })}>
              Je confirme : {b.targetPerRound} à chaque minute
            </button>
          )}
          <Scale label="Difficulté au début" value={b.difficultyStart} onChange={(v) => set({ difficultyStart: v })} />
          <Scale label="Difficulté à la fin" value={b.difficultyEnd} onChange={(v) => set({ difficultyEnd: v })} />
          <label className="field">
            Douleur ou gêne (laisser vide si aucune)
            <input value={b.pain ?? ''} onChange={(e) => set({ pain: e.target.value.trim() || undefined })} placeholder="ex. coude droit" />
          </label>
          {b.bodyWeightKg && <p className="muted num" style={{ margin: 0, fontSize: '0.8rem' }}>Poids du jour : {b.bodyWeightKg} kg (contexte)</p>}
          <button className="btn primary block" disabled={rounds.every((r) => r === null)} onClick={save}>
            Enregistrer comme travail effectué
          </button>
        </section>
      </>
    );
  }

  const recent = [...log].reverse().slice(0, 8);
  return (
    <>
      <button className="btn ghost" onClick={() => go({ name: 'coach' })}>
        <ChevronLeft size={20} aria-hidden="true" /> Coach
      </button>
      <div className="spread" style={{ margin: '8px 0 12px' }}>
        <h1 className="page-title">Séances libres</h1>
        <button className="btn sm primary" onClick={start}>
          <Plus size={14} aria-hidden="true" /> Ajouter
        </button>
      </div>
      {recent.length === 0 && <p className="muted">EMOM ou séries hors programme : ajoute-les ici, elles comptent dans ta semaine.</p>}
      {recent.map((x) => {
        const s = summarize(x);
        const comparable = log.filter((y) => y.variantId === x.variantId && y.grip === x.grip && y.format === x.format && y.at <= x.at).reverse();
        const rec = x.note === 'récupéré' ? true : x.note === 'récupération difficile' ? false : undefined;
        const d = x.format === 'emom' ? nextEmom(comparable, loadsFor(x.variantId, eq), rec) : undefined;
        return (
          <section key={x.id} className="ui-card stack" aria-label="Bloc libre">
            <div className="spread">
              <p className="row-title" style={{ margin: 0 }}>
                {x.format === 'emom' ? `EMOM ${x.rounds.length} min` : `${x.rounds.length} séries`} · {findVariant(x.variantId)?.variant.name}
              </p>
              <span className="pill num">{x.day.slice(5)}</span>
            </div>
            <p className="num" style={{ margin: 0, fontWeight: 700 }}>
              {s.totalReps} rép.{x.loadKg ? ` · ${x.loadKg} kg` : ''}
              {x.targetPerRound ? ` · ${s.roundsDone}/${s.roundsTotal} min réussies` : ''}
              {s.restSeconds !== undefined ? ` · repos réel ${s.restSeconds} s` : ''}
            </p>
            {s.uncertain.map((u) => (
              <p key={u} className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
                ≈ {u}
              </p>
            ))}
            {rec === undefined && x.day < today && (
              <div className="row" style={{ gap: 6 }}>
                <span className="kpi-label">Récupéré les jours suivants ?</span>
                <button className="chip" onClick={() => setRecovered(x.id, true)}>
                  Oui
                </button>
                <button className="chip" onClick={() => setRecovered(x.id, false)}>
                  Non
                </button>
              </div>
            )}
            {d && (
              <div className="free-decision">
                <span className="cq-who">Coach · prochaine fois</span>
                <strong>{d.action}</strong>
                <span>{d.reason}</span>
                {d.missing.length > 0 && <small className="muted">Manque : {d.missing.join(', ')}</small>}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
