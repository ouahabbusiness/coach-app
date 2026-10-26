// Nutrition : entretien avec le coach (goûts, horaires, compléments déclarés) puis plan du jour à cocher.
// Cocher une prise d'eau l'ajoute au compteur d'eau du jour. Quantités = estimations.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bed, Moon, Sunset, Camera, ChefHat, Check, ChevronLeft, ChevronRight, Droplet, Dumbbell, Pill, ShoppingCart, Shuffle, Utensils } from 'lucide-react';
import { Modal } from './common';
import { parseMeal, totalOf } from '../engine/kitchen';
import { useKitchen } from './Kitchen';
import { timesFor, usePrayer } from './prayerStore';
import { saveProof } from './Habits';
import { addWater, dailyKey, type DailyMetrics } from '../engine/daily';
import { buildDayPlan, shoppingList, estimateUnplanned, FOODS, planTotals, UNPLANNED_LABELS, type DeclaredSupplement, type EatenMeal, type FoodGroup, type NutritionAnswers, type PlanEntry, type UnplannedKind, type UnplannedSize } from '../engine/dayPlan';
import { localDay } from '../engine/derive';
import { toMin } from '../engine/planning';
import type { Repository } from '../storage/db';
import { loadPlanning } from './Planning';
import { loadOnboarding } from './profileStore';
import { deviceTimeZone } from './support';
import { useTargets } from './Targets';
import { useWeightLog } from './Weight';
import type { Route } from './App';

const KEY = 'nutrition.answers';
const doneKey = (day: string) => `dayplan.done.${day}`;
const eatenKey = (day: string) => `dayplan.eaten.${day}`;

/** Compléments déclarés par Hmidou le 26/10/2026 : pré-remplis, dose et valeurs à recopier de l'emballage. */
const DECLARED: DeclaredSupplement[] = [
  { id: 'creatine', name: 'Créatine Creapure®', timing: 'apres_petit_dej', waterMl: 300 },
  { id: 'whey', name: 'Whey Native Protimuscle® chocolat', timing: 'collation', waterMl: 250 },
];

export async function loadNutrition(repo: Repository) {
  return repo.getKv<NutritionAnswers>(KEY);
}

function Multi({ group, value, onChange }: { group: FoodGroup; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="cq-grid">
      {FOODS.filter((f) => f.group === group).map((f) => (
        <button key={f.id} className="cq-opt" aria-pressed={value.includes(f.id)} onClick={() => onChange(value.includes(f.id) ? value.filter((x) => x !== f.id) : [...value, f.id])}>
          <span className="cq-opt-l">{f.name}</span>
        </button>
      ))}
    </div>
  );
}

function Num({ label, value, onChange, unit }: { label: string; value?: number; onChange: (v?: number) => void; unit: string }) {
  const [d, setD] = useState(value === undefined ? '' : String(value).replace('.', ','));
  return (
    <label className="field">
      {label}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          type="text"
          inputMode="decimal"
          value={d}
          onChange={(e) => {
            setD(e.target.value);
            const n = Number(e.target.value.replace(',', '.'));
            onChange(e.target.value.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n);
          }}
        />
        <span className="muted">{unit}</span>
      </div>
    </label>
  );
}

interface NStep {
  id: string;
  say: string;
  done: (a: NutritionAnswers) => boolean;
  render: (a: NutritionAnswers, set: (p: Partial<NutritionAnswers>) => void) => React.ReactNode;
}

const NSTEPS: NStep[] = [
  {
    id: 'horaires',
    say: 'Tes horaires réels. C’est eux qui calent tes repas, ton eau et tes prises.',
    done: (a) => !!a.wake && !!a.bedtime,
    render: (a, set) => (
      <div className="stack">
        <label className="field">
          Lever
          <input type="time" value={a.wake ?? ''} onChange={(e) => set({ wake: e.target.value })} />
        </label>
        <label className="field">
          Coucher
          <input type="time" value={a.bedtime ?? ''} onChange={(e) => set({ bedtime: e.target.value })} />
        </label>
      </div>
    ),
  },
  {
    id: 'repas',
    say: 'Combien de repas par jour ? Je te conseille 4 : trois repas et une collation calée avant la séance.',
    done: (a) => !!a.meals,
    render: (a, set) => (
      <div className="cq-choices">
        {([3, 4, 5] as const).map((n) => (
          <button key={n} className={`cq-opt ${n === 4 ? 'rec' : ''}`} aria-pressed={a.meals === n} onClick={() => set({ meals: n })}>
            <span className="cq-opt-l">{n} repas</span>
            {n === 4 && <span className="cq-badge">conseil</span>}
          </button>
        ))}
      </div>
    ),
  },
  { id: 'proteines', say: 'Tes protéines. Coche ce que tu manges vraiment, pas ce que tu devrais manger.', done: (a) => a.proteins.length > 0, render: (a, set) => <Multi group="proteine" value={a.proteins} onChange={(v) => set({ proteins: v })} /> },
  { id: 'glucides', say: 'Tes glucides : c’est ton carburant pour la séance et la course.', done: (a) => a.carbs.length > 0, render: (a, set) => <Multi group="glucide" value={a.carbs} onChange={(v) => set({ carbs: v })} /> },
  { id: 'lipides', say: 'Tes bonnes graisses.', done: (a) => a.fats.length > 0, render: (a, set) => <Multi group="lipide" value={a.fats} onChange={(v) => set({ fats: v })} /> },
  { id: 'fruits', say: 'Tes fruits.', done: (a) => a.fruits.length > 0, render: (a, set) => <Multi group="fruit" value={a.fruits} onChange={(v) => set({ fruits: v })} /> },
  {
    id: 'exclus',
    say: 'Ce que tu ne manges pas : allergie, intolérance ou dégoût. Je ne te le proposerai jamais.',
    done: () => true,
    render: (a, set) => (
      <div className="cq-grid">
        {FOODS.filter((f) => f.group !== 'legume').map((f) => (
          <button key={f.id} className="cq-opt" aria-pressed={a.exclude.includes(f.id)} onClick={() => set({ exclude: a.exclude.includes(f.id) ? a.exclude.filter((x) => x !== f.id) : [...a.exclude, f.id] })}>
            <span className="cq-opt-l">{f.name}</span>
          </button>
        ))}
      </div>
    ),
  },
  {
    id: 'complements',
    say: 'Tes compléments déclarés. Je ne te recommande rien : je place ce que tu prends déjà, à la dose écrite sur ton emballage.',
    done: () => true,
    render: (a, set) => (
      <div className="stack">
        {DECLARED.map((d) => {
          const cur = a.supplements.find((s) => s.id === d.id);
          const upd = (p: Partial<DeclaredSupplement>) => set({ supplements: a.supplements.map((s) => (s.id === d.id ? { ...s, ...p } : s)) });
          return (
            <div key={d.id} className="card soft stack">
              <button className="cq-opt" aria-pressed={!!cur} onClick={() => set({ supplements: cur ? a.supplements.filter((s) => s.id !== d.id) : [...a.supplements, d] })}>
                <span className="cq-opt-l">{d.name}</span>
                <span className="cq-opt-sub">{cur ? 'Je le prends' : 'Je ne le prends pas'}</span>
              </button>
              {cur && (
                <>
                  <Num label="Dose (étiquette)" unit="g" value={cur.doseG} onChange={(v) => upd({ doseG: v })} />
                  {d.id === 'whey' && (
                    <>
                      <Num label="Calories par dose (étiquette)" unit="kcal" value={cur.kcalPerDose} onChange={(v) => upd({ kcalPerDose: v })} />
                      <Num label="Protéines par dose (étiquette)" unit="g" value={cur.proteinPerDose} onChange={(v) => upd({ proteinPerDose: v })} />
                      <div className="seg2">
                        <button aria-pressed={cur.timing === 'collation'} onClick={() => upd({ timing: 'collation' })}>
                          Collation
                        </button>
                        <button aria-pressed={cur.timing === 'apres_seance'} onClick={() => upd({ timing: 'apres_seance' })}>
                          Après séance
                        </button>
                      </div>
                    </>
                  )}
                  {d.id === 'creatine' && <p className="cq-opt-sub" style={{ margin: 0 }}>Prise : juste après le petit-déjeuner, avec 300 ml d’eau.</p>}
                </>
              )}
            </div>
          );
        })}
      </div>
    ),
  },
];

export function NutritionSetup({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [a, setA] = useState<NutritionAnswers | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    (async () => {
      const prev = await loadNutrition(repo);
      if (prev) return setA(prev);
      const ob = (await loadOnboarding(repo)).answers;
      setA({ wake: ob.sleep.wake, bedtime: ob.sleep.bedtime, proteins: [], carbs: [], fats: [], fruits: [], exclude: [], supplements: DECLARED });
    })();
  }, [repo]);
  if (!a) return null;
  const set = (p: Partial<NutritionAnswers>) => setA({ ...a, ...p });
  const cur = NSTEPS[step]!;
  const last = step === NSTEPS.length - 1;
  return (
    <div className="app ob cq">
      <main className="content" style={{ paddingBottom: 140 }}>
        <div className="ob-head">
          <span className="ob-step num">
            <i aria-hidden="true" /> Nutrition · {String(step + 1).padStart(2, '0')}/{NSTEPS.length}
          </span>
          <button className="btn ghost ob-later" onClick={() => go({ name: 'nutrition' })}>
            Quitter
          </button>
        </div>
        <div className="ob-progress" aria-hidden="true">
          {NSTEPS.map((s, i) => (
            <span key={s.id} className={i < step ? 'done' : i === step ? 'now' : ''} />
          ))}
        </div>
        <section className="cq-say" key={cur.id}>
          <p className="cq-who">Coach</p>
          <p className="cq-q">{cur.say}</p>
          <div className="card ob-card">{cur.render(a, set)}</div>
        </section>
      </main>
      <div className="controls">
        <button className="btn side" aria-label="Retour" onClick={() => (step === 0 ? go({ name: 'nutrition' }) : setStep(step - 1))}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <button
          className="btn dark main"
          disabled={!cur.done(a)}
          onClick={async () => {
            if (!last) return setStep(step + 1);
            await repo.setKv(KEY, a);
            go({ name: 'nutrition' });
          }}
        >
          {last ? 'Créer mon plan' : 'Suivant'} <ChevronRight size={20} aria-hidden="true" />
        </button>
        <span style={{ width: 56 }} />
      </div>
    </div>
  );
}

const ICON: Record<PlanEntry['kind'], React.ReactNode> = {
  eau: <Droplet size={15} aria-hidden="true" />,
  repas: <Utensils size={15} aria-hidden="true" />,
  complement: <Pill size={15} aria-hidden="true" />,
  seance: <Dumbbell size={15} aria-hidden="true" />,
  sommeil: <Moon size={15} aria-hidden="true" />,
  priere: <Sunset size={15} aria-hidden="true" />,
  coucher: <Bed size={15} aria-hidden="true" />,
};

/** Plan du jour calculé + cases à cocher. Utilisé par la page Nutrition et l'aperçu de l'accueil. */
export function useDayPlan(repo: Repository) {
  const today = localDay(Date.now(), deviceTimeZone());
  const weight = useWeightLog(repo);
  const [answers, setAnswers] = useState<NutritionAnswers | null | undefined>(undefined);
  const [workout, setWorkout] = useState<{ start: string; durationMin: number; title: string } | undefined>();
  const [done, setDone] = useState<string[]>([]);
  const [eaten, setEatenState] = useState<Record<string, EatenMeal>>({});
  const targets = useTargets(repo, weight.days, workout?.durationMin ?? 0);
  const { settings: prayer } = usePrayer(repo);
  const prayers = prayer?.enabled ? { times: timesFor(today, prayer), wakeAtFajr: prayer.wakeAtFajr } : undefined;

  useEffect(() => {
    (async () => {
      setAnswers((await loadNutrition(repo)) ?? null);
      setDone((await repo.getKv<string[]>(doneKey(today))) ?? []);
      setEatenState((await repo.getKv<Record<string, EatenMeal>>(eatenKey(today))) ?? {});
      const day = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
      const monday = new Date(Date.parse(`${today}T12:00:00Z`) - day * 86_400_000).toISOString().slice(0, 10);
      const item = (await loadPlanning(repo)).filter((i) => i.weekStart === monday && i.day === day && (i.kind === 'seance' || i.kind === 'course') && (!i.adjustment || i.adjustment.decision === 'adaptée')).sort((x, y) => toMin(x.start) - toMin(y.start))[0];
      if (item) setWorkout({ start: item.start, durationMin: item.durationMin, title: item.title });
    })();
  }, [repo, today]);

  const plan = useMemo(() => {
    if (!answers || !targets.calories.value || !targets.water.value) return undefined;
    const dayIndex = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    return buildDayPlan({ answers, kcal: targets.calories.value.kcal, proteinG: targets.calories.value.proteinG, waterMl: targets.water.value, workout, dayIndex, eaten, prayers });
  }, [answers, targets.calories.value, targets.water.value, workout, today, eaten, prayer]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Imprévu : un repas remplacé par autre chose (estimation), les suivants sont recalculés. */
  const setEaten = useCallback(
    async (id: string, m: EatenMeal | undefined) => {
      const next = { ...eaten };
      if (m) next[id] = m;
      else delete next[id];
      await repo.setKv(eatenKey(today), next);
      setEatenState(next);
    },
    [eaten, repo, today],
  );

  // Cocher une prise d'eau (ou un complément pris avec de l'eau) l'ajoute au compteur du jour.
  const toggle = useCallback(
    async (e: PlanEntry) => {
      const on = !done.includes(e.id);
      const next = on ? [...done, e.id] : done.filter((x) => x !== e.id);
      await repo.setKv(doneKey(today), next);
      setDone(next);
      if (e.waterMl) {
        const d = await repo.getKv<DailyMetrics>(dailyKey(today));
        await repo.setKv(dailyKey(today), addWater(d, on ? e.waterMl : -e.waterMl, Date.now()));
      }
    },
    [done, repo, today],
  );

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = plan?.find((e) => !done.includes(e.id) && toMin(e.time) >= nowMin - 60);
  /** Plans des 7 prochains jours (mêmes cibles, sans imprévu) pour la liste de courses. */
  const week = useMemo(() => {
    if (!answers || !targets.calories.value || !targets.water.value) return [];
    const d0 = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, k) => buildDayPlan({ answers, kcal: targets.calories.value!.kcal, proteinG: targets.calories.value!.proteinG, waterMl: targets.water.value!, dayIndex: (d0 + k) % 7 }));
  }, [answers, targets.calories.value, targets.water.value, today]);

  return { answers, plan, done, toggle, targets, next, setEaten, week, today };
}

export function NutritionPage({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const { answers, plan, done, toggle, targets, next, setEaten, week, today } = useDayPlan(repo);
  const kitchen = useKitchen(repo);
  const [ate, setAte] = useState<PlanEntry | null>(null);
  const [text, setText] = useState('');
  const [shot, setShot] = useState<File | undefined>();
  const [shopping, setShopping] = useState(false);
  const [got, setGot] = useState<string[]>([]);
  const [unplanned, setUnplanned] = useState<PlanEntry | null>(null);
  const [uk, setUk] = useState<UnplannedKind>('maison');
  const [us, setUs] = useState<UnplannedSize>('normale');
  if (answers === undefined) return null;
  const kcal = targets.calories.value;
  const totals = plan ? planTotals(plan) : undefined;
  return (
    <>
      <h1>Nutrition</h1>
      <div className="kpi-grid">
        <div className="ui-card kpi">
          <span className="kpi-label">Calories cible</span>
          <span className="kpi-value num">{kcal ? kcal.kcal.toLocaleString('fr-BE') : '—'}</span>
          <span className="kpi-sub num">{totals ? `plan ≈ ${totals.kcal.toLocaleString('fr-BE')} kcal` : 'estimation'}</span>
        </div>
        <div className="ui-card kpi">
          <span className="kpi-label">Protéines · eau</span>
          <span className="kpi-value num">{kcal ? `${kcal.proteinG} g` : '—'}</span>
          <span className="kpi-sub num">{targets.water.value ? `${(targets.water.value / 1000).toLocaleString('fr-BE')} L d’eau` : '—'}</span>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <button className="btn sm" onClick={() => go({ name: 'kitchen' })}>
            <ChefHat size={14} aria-hidden="true" /> Ma cuisine
          </button>
          {plan && (
          <button className="btn sm" onClick={async () => (setGot((await repo.getKv<string[]>(`shopping.${today}`)) ?? []), setShopping(true))}>
            <ShoppingCart size={14} aria-hidden="true" /> Courses de la semaine
          </button>
          )}
        </div>

      {!answers ? (
        <button className="ui-card list-row" onClick={() => go({ name: 'nutritionSetup' })}>
          <span className="icon-chip accent">
            <Utensils size={16} aria-hidden="true" />
          </span>
          <div className="grow">
            <p className="eyebrow">Entretien · {NSTEPS.length} questions</p>
            <p className="row-title">Construire mon plan alimentaire</p>
          </div>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      ) : !plan ? (
        <section className="ui-card stack">
          <p className="row-title">Il manque des données pour calculer tes quantités</p>
          <div className="row" style={{ gap: 6 }}>
            {[...new Set([...targets.calories.missing, ...targets.water.missing])].map((m) => (
              <span key={m} className="pill">
                {m}
              </span>
            ))}
          </div>
          <button className="btn primary" onClick={() => go({ name: 'onboarding', step: 'body' })}>
            Compléter mon profil
          </button>
        </section>
      ) : (
        <>
        <section className="ui-card" aria-label="Plan du jour">
          <div className="spread">
            <p className="eyebrow" style={{ margin: 0 }}>Plan du jour</p>
            <button className="btn ghost sm" onClick={() => go({ name: 'nutritionSetup' })}>
              Modifier
            </button>
          </div>
          <ol className="tl">
            {plan.map((e) => {
              const isDone = done.includes(e.id);
              return (
                <li key={e.id} className={`tl-item k-${e.kind} ${isDone ? 'done' : ''} ${next?.id === e.id ? 'next' : ''}`}>
                  <span className="tl-time num">{e.time}</span>
                  <span className="tl-dot" aria-hidden="true">
                    {ICON[e.kind]}
                  </span>
                  <div className="tl-body">
                    <p className="tl-title">
                      {e.title}
                      {e.kcal ? <span className="num tl-kcal">{e.kcal} kcal · {e.protein} g P</span> : null}
                    </p>
                    <p className="tl-items">{e.items.join(' · ')}</p>
                    {e.unplanned && <span className="pill">imprévu · estimation</span>}
                    {e.adjusted && <span className="pill">{e.adjusted} après imprévu</span>}
                    {e.kind === 'repas' && !e.unplanned && (
                      <button
                        className="tl-alt"
                        onClick={() => {
                          setText('');
                          setShot(undefined);
                          setAte(e);
                        }}
                      >
                        <Utensils size={12} aria-hidden="true" /> J’ai mangé
                      </button>
                    )}
                    {e.kind === 'repas' && (
                      <button className="tl-alt" onClick={() => (e.unplanned ? setEaten(e.id, undefined) : setUnplanned(e))}>
                        <Shuffle size={12} aria-hidden="true" /> {e.unplanned ? 'Revenir au plan' : 'Imprévu'}
                      </button>
                    )}
                  </div>
                  {e.kind !== 'seance' && e.kind !== 'coucher' && e.kind !== 'priere' && (
                    <button className={`check ${isDone ? 'on' : ''}`} aria-pressed={isDone} aria-label={`${e.title} fait`} onClick={() => toggle(e)}>
                      {isDone ? <Check size={14} aria-hidden="true" /> : null}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <Modal open={!!ate} onClose={() => setAte(null)} title={`J’ai mangé · ${ate?.title ?? ''}`}>
            {ate &&
              (() => {
                const r = parseMeal(text, kitchen.foods, kitchen.dishes);
                const t = totalOf(r.items, kitchen.foods, kitchen.dishes);
                const favs = [...kitchen.dishes.map((d) => ({ id: d.id, label: `1 portion ${d.name}` })), ...kitchen.mine.map((f) => ({ id: f.id, label: f.unitG ? `1 ${f.unitName ?? 'portion'} ${f.name}` : `100 g ${f.name}` }))];
                return (
                  <div className="stack">
                    <textarea aria-label="Ce que tu as mangé" placeholder="ex. 3 œufs, 80 g d’avoine, 1 banane" value={text} onChange={(e) => setText(e.target.value)} />
                    {favs.length > 0 && (
                      <div className="chips">
                        {favs.slice(0, 10).map((f) => (
                          <button key={f.id} className="chip" onClick={() => setText(text.trim() ? `${text.trim()}, ${f.label}` : f.label)}>
                            + {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {r.items.length > 0 && (
                      <ul className="ate-list">
                        {r.items.map((i, k) => (
                          <li key={k} className="num">
                            {i.label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.unknown.length > 0 && (
                      <p className="hs-err" style={{ color: 'var(--warn)' }}>
                        Inconnu : {r.unknown.join(' · ')} → ajoute-le dans Ma cuisine
                      </p>
                    )}
                    <p className="num" style={{ margin: 0, fontWeight: 800, fontSize: '1.2rem' }}>
                      ≈ {t.kcal} kcal · {t.protein} g P
                    </p>
                    <label className={`chip ${shot ? 'on' : ''}`} style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
                      {shot ? <Check size={14} aria-hidden="true" /> : <Camera size={14} aria-hidden="true" />} Photo de l’assiette
                      <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setShot(e.target.files?.[0])} />
                    </label>
                    <button
                      className="btn primary block"
                      disabled={!r.items.length || r.unknown.length > 0}
                      onClick={async () => {
                        if (shot) await saveProof(repo, today, `repas-${ate.id}`, shot);
                        await setEaten(ate.id, { label: r.items.map((i) => i.label).join(', '), kcal: t.kcal, protein: t.protein });
                        setAte(null);
                      }}
                    >
                      Enregistrer et recalculer ma journée
                    </button>
                  </div>
                );
              })()}
          </Modal>
          <Modal open={shopping} onClose={() => setShopping(false)} title="Courses · 7 jours">
            {(() => {
              const list = shoppingList(week);
              const aisles = [...new Set(list.map((l) => l.aisle))];
              const toggleGot = async (id: string) => {
                const next = got.includes(id) ? got.filter((x) => x !== id) : [...got, id];
                setGot(next);
                await repo.setKv(`shopping.${today}`, next);
              };
              return (
                <div className="stack">
                  {aisles.map((a) => (
                    <div key={a}>
                      <p className="eyebrow" style={{ margin: '0 0 4px' }}>{a}</p>
                      <ul className="shop">
                        {list.filter((l) => l.aisle === a).map((l) => (
                          <li key={l.foodId} className={got.includes(l.foodId) ? 'got' : ''}>
                            <button className={`check ${got.includes(l.foodId) ? 'on' : ''}`} aria-pressed={got.includes(l.foodId)} aria-label={`${l.name} pris`} onClick={() => toggleGot(l.foodId)}>
                              {got.includes(l.foodId) ? <Check size={14} aria-hidden="true" /> : null}
                            </button>
                            <span className="grow">{l.name}</span>
                            <span className="num shop-qty">{l.buy}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>Calculé sur ton plan des 7 prochains jours (estimation). Compléments non inclus.</p>
                </div>
              );
            })()}
          </Modal>
          <Modal open={!!unplanned} onClose={() => setUnplanned(null)} title={`Imprévu · ${unplanned?.title ?? ''}`}>
            <div className="stack">
              <div className="chips" role="group" aria-label="Type de repas">
                {(Object.keys(UNPLANNED_LABELS) as UnplannedKind[]).map((k) => (
                  <button key={k} className="chip" aria-pressed={uk === k} onClick={() => setUk(k)}>
                    {UNPLANNED_LABELS[k]}
                  </button>
                ))}
              </div>
              {uk !== 'saute' && (
                <div className="seg3" role="group" aria-label="Taille de la portion">
                  {(['petite', 'normale', 'grosse'] as const).map((s) => (
                    <button key={s} aria-pressed={us === s} onClick={() => setUs(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <p className="num" style={{ margin: 0, fontWeight: 700 }}>
                ≈ {estimateUnplanned(uk, us).kcal} kcal · {estimateUnplanned(uk, us).protein} g P
              </p>
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Ordre de grandeur. Les repas suivants sont recalculés pour rester dans ta cible.</p>
              <button
                className="btn primary block"
                onClick={async () => {
                  if (unplanned) await setEaten(unplanned.id, estimateUnplanned(uk, us));
                  setUnplanned(null);
                }}
              >
                Recalculer ma journée
              </button>
            </div>
          </Modal>
          <p className="muted" style={{ fontSize: '0.75rem', margin: '8px 0 0' }}>
            Quantités estimées (valeurs moyennes des aliments). Compléments : seulement ceux que tu déclares, jamais recommandés.
          </p>
        </section>
        </>
      )}
    </>
  );
}

/** Aperçu sur l'accueil : la prochaine étape du plan. */
export function NextStepCard({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const { plan, next, toggle } = useDayPlan(repo);
  if (!plan || !next) return null;
  return (
    <section className={`ui-card list-row next-step k-${next.kind}`} aria-label="Prochaine étape du plan">
      <button className="icon-chip accent" onClick={() => go({ name: 'nutrition' })} aria-label="Voir le plan du jour">
        {ICON[next.kind]}
      </button>
      <div className="grow" onClick={() => go({ name: 'nutrition' })}>
        <p className="eyebrow">
          {next.time} · {next.title}
        </p>
        <p className="row-title">{next.items.join(' · ')}</p>
      </div>
      {next.kind !== 'seance' && next.kind !== 'coucher' && next.kind !== 'priere' && (
        <button className="check" aria-label={`${next.title} fait`} onClick={() => toggle(next)} />
      )}
    </section>
  );
}
