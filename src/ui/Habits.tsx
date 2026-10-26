// Objectifs du jour : une fenêtre, un objectif = une icône + sa photo-preuve.
// Règle demandée par l'utilisateur : sans photo du jour, un objectif réussi n'est pas compté.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BookOpen, Camera, Check, Footprints, GlassWater, Moon, NotebookPen, Salad, Trash2, X } from 'lucide-react';
import { NOVEMBER_2026, habitStatus, type DailyHabit } from '../engine/challenge';
import { challengeValues, dailyKey, type DailyMetrics } from '../engine/daily';
import { DAILY_PAGES } from '../engine/reading';
import { proofKey, takenOnDay, withProofs, type ProofDay } from '../engine/proof';
import type { Repository } from '../storage/db';
import { useChallengeEntries } from './Challenge';
import { Modal } from './common';
import { deviceTimeZone } from './support';

/** Redimensionne une photo (≤ 480 px) pour la garder légère dans la base locale. */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ko;
      i.src = url;
    });
    const s = Math.min(1, 480 / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Enregistre la preuve d'un objectif ; refuse une photo qui n'est pas du jour. Renvoie un message d'erreur ou rien. */
export async function saveProof(repo: Repository, day: string, habitId: string, file: File): Promise<string | undefined> {
  if (!takenOnDay(file.lastModified, day, deviceTimeZone())) return 'Photo d’un autre jour : refusée';
  const photo = await shrinkPhoto(file);
  const proofs = (await repo.getKv<ProofDay>(proofKey(day))) ?? {};
  await repo.setKv(proofKey(day), { ...proofs, [habitId]: { habitId, photo, takenAt: file.lastModified, savedAt: Date.now() } });
}

/** Charge les preuves d'une liste de jours (pages défi et Winter Arc). */
export function useProofMap(repo: Repository, days: string[], version = 0) {
  const [map, setMap] = useState<Record<string, ProofDay>>({});
  useEffect(() => {
    (async () => {
      const m: Record<string, ProofDay> = {};
      for (const d of days) {
        const v = await repo.getKv<ProofDay>(proofKey(d));
        if (v) m[d] = v;
      }
      setMap(m);
    })();
  }, [repo, days, version]);
  return map;
}

/** État complet d'un jour : données du jour, cases du défi, preuves. */
export function useDayHabits(repo: Repository, day: string) {
  const { entries, update } = useChallengeEntries(repo);
  const [daily, setDaily] = useState<DailyMetrics | undefined>();
  const [proofs, setProofs] = useState<ProofDay>({});

  useEffect(() => {
    (async () => {
      setDaily(await repo.getKv<DailyMetrics>(dailyKey(day)));
      setProofs((await repo.getKv<ProofDay>(proofKey(day))) ?? {});
    })();
  }, [repo, day]);

  const saveDaily = useCallback(
    async (next: DailyMetrics) => {
      await repo.setKv(dailyKey(day), next);
      setDaily(next);
    },
    [repo, day],
  );

  const raw = challengeValues(entries[day]?.values, daily);
  const entry = { values: withProofs(raw, proofs), excused: entries[day]?.excused, updatedAt: 0 };
  const done = NOVEMBER_2026.daily.filter((h) => habitStatus(h, entry) === 'done').length;

  const setCheck = (id: string, v: boolean | undefined) =>
    update(day, (e) => {
      const values = { ...e.values };
      if (v === undefined) delete values[id];
      else values[id] = v;
      return { ...e, values };
    });

  const prove = async (id: string, file: File) => {
    const err = await saveProof(repo, day, id, file);
    if (!err) setProofs((await repo.getKv<ProofDay>(proofKey(day))) ?? {});
    return err;
  };

  const unprove = async (id: string) => {
    const next = { ...proofs };
    delete next[id];
    await repo.setKv(proofKey(day), next);
    setProofs(next);
  };

  return { day, daily, saveDaily, raw, entry, done, proofs, setCheck, prove, unprove };
}

export type DayHabits = ReturnType<typeof useDayHabits>;

const ICON: Record<string, ReactNode> = {
  water_only: <GlassWater size={18} aria-hidden="true" />,
  no_junk: <Salad size={18} aria-hidden="true" />,
  sleep: <Moon size={18} aria-hidden="true" />,
  steps: <Footprints size={18} aria-hidden="true" />,
  journal: <NotebookPen size={18} aria-hidden="true" />,
  read: <BookOpen size={18} aria-hidden="true" />,
};

/** Ce que la photo doit montrer. */
const SHOT: Record<string, string> = {
  water_only: 'Ta boisson',
  no_junk: 'Ton repas',
  sleep: 'Ta montre : sommeil',
  steps: 'Ta montre : pas',
  journal: 'Ta page écrite',
  read: 'La page du livre',
};

const fmtVal = (h: DailyHabit, v: unknown) =>
  typeof v !== 'number' ? '—' : h.id === 'sleep' ? `${Math.floor(v)} h ${String(Math.round((v % 1) * 60)).padStart(2, '0')}` : v.toLocaleString('fr-BE');

/** Bouton appareil photo : la caméra s'ouvre directement sur téléphone (pas la galerie). */
export function ShotButton({ onFile, label }: { onFile: (f: File) => void; label: string }) {
  return (
    <label className="btn primary shot-btn">
      <Camera size={18} aria-hidden="true" /> {label}
      <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

export function HabitsSheet({ open, onClose, h, onReading }: { open: boolean; onClose: () => void; h: DayHabits; onReading: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [num, setNum] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const total = NOVEMBER_2026.daily.length;
  const ring = 2 * Math.PI * 30;

  const pick = (id: string) => {
    setErr(null);
    setSel(sel === id ? null : id);
    const v = h.raw[id];
    setNum(typeof v === 'number' ? String(v).replace('.', ',') : '');
  };

  const shoot = async (id: string, file: File, thenCheck: boolean) => {
    const e = await h.prove(id, file);
    setErr(e ?? null);
    if (!e && thenCheck) await h.setCheck(id, true);
  };

  return (
    <Modal open={open} onClose={onClose} title="Objectifs du jour">
      <div className="hs">
        <div className="hs-head">
          <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
            <circle cx="38" cy="38" r="30" fill="none" stroke="var(--accent-soft)" strokeWidth="7" />
            <circle className="hs-ring" cx="38" cy="38" r="30" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - h.done / total)} transform="rotate(-90 38 38)" />
          </svg>
          <div className="hs-count num">
            {h.done}
            <span>/{total}</span>
          </div>
          <span className="pill">
            <Camera size={12} aria-hidden="true" /> 1 photo = 1 preuve
          </span>
          {h.entry.excused && <span className="pill">Jour excusé</span>}
        </div>

        <ul className="hs-list">
          {NOVEMBER_2026.daily.map((hb, i) => {
            const st = habitStatus(hb, h.entry);
            const proof = h.proofs[hb.id];
            const rawV = h.raw[hb.id];
            const waiting = st !== 'done' && !proof && (rawV === true || (typeof rawV === 'number' && rawV >= (hb.min ?? 0)));
            const open = sel === hb.id;
            return (
              <li key={hb.id} className={`hs-item ${st === 'done' ? 'done' : ''} ${open ? 'open' : ''}`} style={{ animationDelay: `${i * 45}ms` }}>
                <button className="hs-row" onClick={() => pick(hb.id)} aria-expanded={open}>
                  <span className="hs-icon">{ICON[hb.id]}</span>
                  <span className="hs-label">
                    {hb.label}
                    {hb.kind === 'number' && <small className="num">{fmtVal(hb, rawV)}</small>}
                    {hb.id === 'read' && <small className="num">{h.daily?.readPages ?? 0}/{DAILY_PAGES} p.</small>}
                    {waiting && <small className="hs-wait">preuve manquante</small>}
                    {rawV === false && <small>pas fait</small>}
                  </span>
                  {proof ? <img className="hs-thumb" src={proof.photo} alt="" /> : <Camera className="hs-cam" size={16} aria-hidden="true" />}
                  <span className={`check ${st === 'done' ? 'on' : ''}`} aria-hidden="true">
                    {st === 'done' ? '✓' : ''}
                  </span>
                </button>

                {open && (
                  <div className="hs-panel">
                    {proof && (
                      <figure className="hs-proof">
                        <img src={proof.photo} alt={`Preuve : ${hb.label}`} />
                        <figcaption className="num">
                          {new Date(proof.takenAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                        </figcaption>
                      </figure>
                    )}
                    <p className="hs-shot">
                      <Camera size={13} aria-hidden="true" /> {SHOT[hb.id]}
                    </p>

                    {hb.id === 'read' ? (
                      <button className="btn primary" onClick={onReading}>
                        <BookOpen size={16} aria-hidden="true" /> Lecture
                      </button>
                    ) : hb.kind === 'number' ? (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <input aria-label={hb.label} type="text" inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value)} placeholder={hb.unit} />
                        <button
                          className="btn"
                          onClick={() => {
                            const n = Number(num.replace(',', '.'));
                            if (num.trim() === '' || !Number.isFinite(n) || n < 0) return;
                            h.saveDaily({ ...(h.daily ?? {}), [hb.id === 'sleep' ? 'sleepH' : 'steps']: n, updatedAt: Date.now() });
                          }}
                        >
                          <Check size={16} aria-hidden="true" />
                        </button>
                        {!proof && <ShotButton label="" onFile={(f) => shoot(hb.id, f, false)} />}
                      </div>
                    ) : (
                      !proof && (
                        <div className="row">
                          <ShotButton label="Preuve" onFile={(f) => shoot(hb.id, f, true)} />
                          <button className="btn ghost" aria-pressed={rawV === false} onClick={() => h.setCheck(hb.id, rawV === false ? undefined : false)}>
                            <X size={16} aria-hidden="true" /> Pas fait
                          </button>
                        </div>
                      )
                    )}

                    {proof && hb.id !== 'read' && (
                      <button
                        className="btn ghost sm"
                        onClick={async () => {
                          await h.unprove(hb.id);
                          if (hb.kind === 'check') await h.setCheck(hb.id, undefined);
                        }}
                      >
                        <Trash2 size={14} aria-hidden="true" /> Retirer
                      </button>
                    )}
                    {err && <p className="hs-err" role="alert">{err}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
