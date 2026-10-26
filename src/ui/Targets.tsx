// Cibles du jour calculées par l'app (eau, calories, course) et saisie d'une course avec preuve.

import { useCallback, useEffect, useState } from 'react';
import { Camera, Check, Info, UserRound } from 'lucide-react';
import { localDay } from '../engine/derive';
import { calorieTarget, runTarget, waterTarget, type Computed, type FormulaSex, type RunEntry } from '../engine/targets';
import { trend, type WeighIn } from '../engine/weight';
import type { Repository } from '../storage/db';
import { Modal } from './common';
import { saveProof } from './Habits';
import { loadGoals, loadOnboarding } from './profileStore';
import { deviceTimeZone, newId } from './support';

const SEX = 'targets.sex';
const RUNS = 'run.log';

export function useTargets(repo: Repository, weights: WeighIn[], trainingMin: number) {
  const today = localDay(Date.now(), deviceTimeZone());
  const [sex, setSexState] = useState<FormulaSex | undefined>();
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [profile, setProfile] = useState<{ age?: number; heightCm?: number; weightKg?: number; spw?: number; goal?: Parameters<typeof calorieTarget>[0]['goal'] }>({});

  useEffect(() => {
    (async () => {
      setSexState(await repo.getKv<FormulaSex>(SEX));
      setRuns((await repo.getKv<RunEntry[]>(RUNS)) ?? []);
      const a = (await loadOnboarding(repo)).answers;
      const goals = await loadGoals(repo);
      setProfile({
        age: a.body.age.value,
        heightCm: a.body.heightCm.value,
        weightKg: a.body.weightKg.value,
        spw: a.sleep.sessionsPerWeek,
        goal: goals[goals.length - 1]?.main ?? a.goal.main,
      });
    })();
  }, [repo]);

  const setSex = useCallback(
    async (s: FormulaSex) => {
      await repo.setKv(SEX, s);
      setSexState(s);
    },
    [repo],
  );

  const addRun = useCallback(
    async (r: RunEntry) => {
      const next = [...runs, r];
      await repo.setKv(RUNS, next);
      setRuns(next);
    },
    [repo, runs],
  );

  // Poids : dernière pesée, sinon celui déclaré à l'onboarding.
  const weightKg = weights[weights.length - 1]?.kg ?? profile.weightKg;
  const water = waterTarget(weightKg, trainingMin);
  const calories = calorieTarget({ sex, age: profile.age, heightCm: profile.heightCm, weightKg, sessionsPerWeek: profile.spw, goal: profile.goal, trend: trend(weights, today).status });
  const run = runTarget(runs, today);
  const ranToday = runs.some((r) => r.day === today);
  return { today, water, calories, run, runs, ranToday, sex, setSex, addRun };
}

export type Targets = ReturnType<typeof useTargets>;

/** Fenêtre « pourquoi ce chiffre » : résultat + calcul, ou indicateur unique de ce qui manque. */
export function WhyModal({
  open,
  onClose,
  title,
  c,
  result,
  profileFields = [],
  onComplete,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  c: Computed<unknown>;
  result?: React.ReactNode;
  /** Champs du profil requis (pour l'indicateur « Profil x/n »). */
  profileFields?: string[];
  onComplete?: () => void;
  children?: React.ReactNode;
}) {
  const missingProfile = profileFields.filter((f) => c.missing.includes(f));
  const otherMissing = c.missing.filter((m) => !profileFields.includes(m));
  const have = profileFields.length - missingProfile.length;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="why">
        {c.missing.length === 0 ? (
          <section className="why-card">
            {result && <div className="why-result num">{result}</div>}
            <ol className="why-list">
              {c.why.map((w) => (
                <li key={w} className="num">
                  {w}
                </li>
              ))}
            </ol>
          </section>
        ) : (
          profileFields.length > 0 && (
            <section className="why-card">
              <div className="why-head">
                <span className="icon-chip sm">
                  <UserRound size={14} aria-hidden="true" />
                </span>
                <span className="why-label">Profil</span>
                <strong className="num">
                  {have}/{profileFields.length}
                </strong>
              </div>
              <div className="why-bar" aria-hidden="true">
                <span style={{ width: `${(have / profileFields.length) * 100}%` }} />
              </div>
              {missingProfile.length > 0 && <p className="why-missing">À compléter : {missingProfile.join(' · ')}</p>}
              {missingProfile.length > 0 && onComplete && (
                <button className="btn primary block" onClick={onComplete}>
                  Compléter mon profil
                </button>
              )}
            </section>
          )
        )}
        {c.missing.length > 0 && profileFields.length === 0 && otherMissing.length > 0 && (
          <section className="why-card">
            <p className="why-missing">À compléter : {otherMissing.join(' · ')}</p>
          </section>
        )}
        {children}
        <p className="why-foot">
          <Info size={12} aria-hidden="true" /> Estimation · pas un avis médical
        </p>
      </div>
    </Modal>
  );
}

/** Saisie d'une course : distance, durée, effort, photo de la montre (obligatoire). */
export function RunModal({ open, onClose, repo, t, onProved }: { open: boolean; onClose: () => void; repo: Repository; t: Targets; onProved: () => void }) {
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [effort, setEffort] = useState<number | undefined>();
  const [shot, setShot] = useState<File | undefined>();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setKm('');
      setMin('');
      setEffort(undefined);
      setShot(undefined);
      setErr(null);
    }
  }, [open]);
  const k = Number(km.replace(',', '.'));
  const m = min.trim() === '' ? undefined : Number(min.replace(',', '.'));
  const valid = km.trim() !== '' && k > 0 && k < 100 && (m === undefined || (m > 0 && m < 1000)) && effort !== undefined && !!shot;
  const target = t.run.value?.km;
  return (
    <Modal open={open} onClose={onClose} title="J’ai couru">
      <div className="stack">
        {target !== undefined && (
          <p className="run-goal num">
            cible <strong>{target.toLocaleString('fr-BE')} km</strong>
          </p>
        )}
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input aria-label="Distance en km" placeholder="km" type="text" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} style={{ fontSize: '1.4rem', fontWeight: 700 }} />
          <input aria-label="Durée en minutes" placeholder="min" type="text" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
        <div className="effort" role="group" aria-label="Effort ressenti sur 10">
          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button key={n} className="chip num" aria-pressed={effort === n} onClick={() => setEffort(n)}>
              {n}
            </button>
          ))}
        </div>
        <label className={`chip ${shot ? 'on' : ''}`} style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
          {shot ? <Check size={14} aria-hidden="true" /> : <Camera size={14} aria-hidden="true" />} Photo de la montre
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setShot(e.target.files?.[0])} />
        </label>
        {err && <p className="hs-err" role="alert">{err}</p>}
        <button
          className="btn primary block"
          disabled={!valid}
          onClick={async () => {
            if (!valid) return;
            const e = await saveProof(repo, t.today, 'run', shot!);
            if (e) return setErr(e);
            await t.addRun({ id: newId(), day: t.today, km: k, minutes: m, effort, at: Date.now() });
            onProved();
            onClose();
          }}
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}
