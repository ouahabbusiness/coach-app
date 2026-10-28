// Cibles du jour calculées par l'app (eau, calories, course) et saisie d'une course avec preuve.

import { useCallback, useEffect, useState } from 'react';
import { Camera, Check, Info, UserRound } from 'lucide-react';
import { localDay } from '../engine/derive';
import { calorieTarget, reviewCalories, runTarget, waterTarget, type CalorieAdjust, type Computed, type FormulaSex, type RunEntry, type Strategy } from '../engine/targets';
import type { WeighIn } from '../engine/weight';
import type { Repository } from '../storage/db';
import { Modal } from './common';
import { saveProof } from './Habits';
import { COMPLEMENT_EVENT, loadComplement, loadTraining } from './profileComplement';
import type { ActivityAnswers, Training } from '../engine/activity';
import { loadGoals, loadOnboarding, patchAnswers } from './profileStore';
import { deviceTimeZone, newId } from './support';

const SEX = 'targets.sex';
const RUNS = 'run.log';

/** Objectif calorique déduit du programme validé avec le coach (sèche → déficit, muscle → surplus, gras + muscle → recomposition). */
/** Stratégie issue du programme validé avec le coach : muscle → développement, sèche → réduction, le reste → maintien (observation). */
export function programStrategy(p?: { answers: { priority?: string } }): Strategy | undefined {
  const pr = p?.answers.priority;
  if (!pr) return undefined;
  return pr === 'muscle' ? 'développement' : pr === 'seche' ? 'réduction' : 'maintien';
}

const ADJUST = 'nutrition.adjust';
const REVIEWED = 'nutrition.reviewedOn';
/** Un seul bilan à la fois, même si plusieurs écrans utilisent les cibles. */
let reviewLock: Promise<void> | null = null;

export function useTargets(repo: Repository, weights: WeighIn[], trainingMin: number) {
  const today = localDay(Date.now(), deviceTimeZone());
  const [sex, setSexState] = useState<FormulaSex | undefined>();
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [profile, setProfile] = useState<{ age?: number; heightCm?: number; weightKg?: number; spw?: number; goal?: Parameters<typeof calorieTarget>[0]['goal']; strategy?: Strategy }>({});
  const [adjustments, setAdjustments] = useState<CalorieAdjust[]>([]);
  const [review, setReview] = useState<{ reason: string; uncertain: boolean } | null>(null);
  const [energy, setEnergy] = useState<{ activity?: ActivityAnswers; training?: Training; treadmillDays: number; workDays: number }>({ treadmillDays: 0, workDays: 0 });

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const a0 = (await loadOnboarding(repo)).answers;
      setSexState(a0.body.formulaSex ?? (await repo.getKv<FormulaSex>(SEX)));
      setRuns((await repo.getKv<RunEntry[]>(RUNS)) ?? []);
      const a = (await loadOnboarding(repo)).answers;
      const goals = await loadGoals(repo);
      setProfile({
        age: a.body.age.value,
        heightCm: a.body.heightCm.value,
        weightKg: a.body.weightKg.value,
        spw: a.sleep.sessionsPerWeek,
        goal: goals[goals.length - 1]?.main ?? a.goal.main,
        strategy: programStrategy(await repo.getKv<{ answers: { priority?: string } }>('program.current')),
      });
      setAdjustments((await repo.getKv<CalorieAdjust[]>(ADJUST)) ?? []);
      const loadEnergy = async () => {
        const ob = (await loadOnboarding(repo)).answers.schedule;
        const comp = await loadComplement(repo);
        setEnergy({ activity: comp.validated ? comp.activity : undefined, training: await loadTraining(repo), treadmillDays: ob.treadmillDays?.length ?? 0, workDays: ob.workDays?.length ?? 0 });
      };
      await loadEnergy();
      window.addEventListener(COMPLEMENT_EVENT, loadEnergy);
      cleanup = () => window.removeEventListener(COMPLEMENT_EVENT, loadEnergy);
    })();
    return () => cleanup?.();
  }, [repo]);

  const setSex = useCallback(
    async (s: FormulaSex) => {
      await repo.setKv(SEX, s);
      await patchAnswers(repo, (x) => void (x.body.formulaSex = s));
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
  const lastW = weights[weights.length - 1];
  const weightKg = lastW?.kg ?? profile.weightKg;
  // Statut de la donnée : observée (pesée), déclarée (configuration), à confirmer (pesée de plus de 30 jours).
  const weightStatus = lastW ? (Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lastW.day}T12:00:00Z`)) / 864e5) > 30 ? 'à confirmer' : lastW.status === 'estimé' ? 'estimée' : 'observée') : profile.weightKg ? 'déclarée' : undefined;
  const water = waterTarget(weightKg, trainingMin);
  const calories = calorieTarget({ sex, age: profile.age, heightCm: profile.heightCm, weightKg, sessionsPerWeek: profile.spw, goal: profile.goal, strategy: profile.strategy, adjustments, activity: energy.activity, training: energy.training, treadmillDaysPerWeek: energy.treadmillDays, workDaysPerWeek: energy.workDays });

  // Bilan calorique : une fois par jour ; un ajustement est SAUVEGARDÉ avant d'être affiché.
  useEffect(() => {
    const strat = calories.value?.strategy;
    if (!strat || weights.length === 0) return;
    if (reviewLock) return;
    reviewLock = (async () => {
      if ((await repo.getKv<string>(REVIEWED)) === today) return;
      const last = adjustments[adjustments.length - 1]?.at;
      const days = Array.from({ length: 14 }, (_, k) => new Date(Date.parse(`${today}T12:00:00Z`) - k * 864e5).toISOString().slice(0, 10));
      const intake: { day: string; kcal: number }[] = [];
      for (const d of days) {
        // Seules les journées entièrement connues comptent (repas détaillés ou « exactement le plan »).
        // Journée incomplète = apport inconnu : exclue (jamais comptée comme 0 ni comme apport partiel).
        const x = await repo.getKv<{ kcal: number | null; complete?: boolean }>(`intake.${d}`);
        if (x?.complete === true && typeof x.kcal === 'number') intake.push({ day: d, kcal: x.kcal });
      }
      const rlog = (await repo.getKv<{ day: string; tired: boolean }[]>('readiness.log')) ?? [];
      const fatigueDays = new Set(rlog.filter((x) => x.tired && days.includes(x.day)).map((x) => x.day)).size;
      const r = reviewCalories(strat, weights, today, last, { intake, targetKcal: calories.value?.kcal ?? 0, fatigueDays });
      if (r.delta) {
        const next = [...adjustments, { at: today, delta: r.delta, reason: r.reason }];
        await repo.setKv(ADJUST, next);
        setAdjustments(next);
      }
      await repo.setKv(REVIEWED, today);
      setReview({ reason: r.reason, uncertain: r.uncertain });
    })().finally(() => {
      reviewLock = null;
    });
  }, [calories.value?.strategy, weights.length, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = runTarget(runs, today);
  const ranToday = runs.some((r) => r.day === today);
  if (weightStatus && calories.value) calories.why.unshift(`poids ${weightKg} kg · donnée ${weightStatus}`);
  if (weightStatus && water.value) water.why.push(`poids : donnée ${weightStatus}`);
  return { today, water, calories, run, runs, ranToday, sex, setSex, addRun, review, weightStatus };
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
  const valid = km.trim() !== '' && k > 0 && k < 100 && (m === undefined || (m > 0 && m < 1000)) && effort !== undefined;
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
          {shot ? <Check size={14} aria-hidden="true" /> : <Camera size={14} aria-hidden="true" />} Photo de la montre (facultatif)
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setShot(e.target.files?.[0])} />
        </label>
        {!shot && <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Sans photo : course déclarée, pas comptée dans le défi. Avec « Go », le GPS sert de preuve.</p>}
        {err && <p className="hs-err" role="alert">{err}</p>}
        <button
          className="btn primary block"
          disabled={!valid}
          onClick={async () => {
            if (!valid) return;
            // Avec photo du jour : compte pour le défi. Sans photo : course déclarée (utilisée pour la progression).
            if (shot) {
              const e = await saveProof(repo, t.today, 'run', shot);
              if (e) return setErr(e);
            }
            await t.addRun({ id: newId(), day: t.today, km: k, minutes: m, effort, at: Date.now() });
            if (shot) onProved();
            onClose();
          }}
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}
