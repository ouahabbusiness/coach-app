// Nutrition : entretien avec le coach (goûts, horaires, compléments déclarés) puis plan du jour à cocher.
// Cocher une prise d'eau l'ajoute au compteur d'eau du jour. Quantités = estimations.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bed, Moon, Sunset, Camera, ChefHat, Check, ChevronLeft, ChevronRight, Droplet, Dumbbell, Minus, Plus, Pill, Refrigerator, Scale, ShoppingCart, Shuffle, Utensils } from 'lucide-react';
import { Modal } from './common';
import { parseMeal, totalOf } from '../engine/kitchen';
import { useKitchen } from './Kitchen';
import { useTracking } from './trackingPrefs';
import { timesFor, usePrayer } from './prayerStore';
import { saveProof } from './Habits';
import { addWater, dailyKey, type DailyMetrics } from '../engine/daily';
import { BREAKFAST_SHARES, reviewBreakfast } from '../engine/breakfastReview';
import { loadBreakfastToday, saveBreakfastToday } from './breakfastToday';
import { buildDayPlan, EGG_CALIBRES, EGG_COUNT_G, EGG_SOURCE, freezeConfirmed, shoppingList, estimateUnplanned, FOODS, planTotals, UNPLANNED_LABELS, type BreakfastDetails, type CustomFood, type UsualItem, type Food, type DeclaredSupplement, type EatenMeal, knownIntake, DOC_LABEL, type FoodGroup, type NutritionAnswers, type PlanEntry, type UnplannedKind, type UnplannedSize } from '../engine/dayPlan';
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
const confirmedKey = (day: string) => `dayplan.confirmed.${day}`;
const snapshotKey = (day: string) => `dayplan.snapshot.${day}`;

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


const MILKS = [
  { k: 'entier', label: 'Entier' },
  { k: 'demi', label: 'Demi-écrémé' },
  { k: 'ecreme', label: 'Écrémé' },
  { k: 'vegetal', label: 'Végétal' },
] as const;

/** Champ numérique libre (g ou ml) : vide = pas précisé. */
function QtyInput({ label, value, unit, onChange }: { label: string; value?: number; unit: string; onChange: (v?: number) => void }) {
  return (
    <label className="row" style={{ gap: 6, alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: '0.8rem' }}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        style={{ width: 72 }}
        aria-label={`${label} (${unit})`}
        value={value ?? ''}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'));
          onChange(e.target.value.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n);
        }}
      />
      <span className="muted">{unit}</span>
    </label>
  );
}

/** Petit-déjeuner habituel : ce qu'on mange d'ordinaire, quantités, café, cuisson. Une quantité inconnue reste « inconnue » (jamais 0). */
function UsualBreakfast({ a, set, products }: { a: NutritionAnswers; set: (p: Partial<NutritionAnswers>) => void; products: CustomFood[] }) {
  const value = a.usualBreakfast ?? [];
  const coffee = !!a.breakfastCoffee;
  const d: BreakfastDetails = a.breakfastDetails ?? {};
  // Les œufs sont comptés par nombre (enregistré × 60) : changer de calibre ou de poids ne change pas le nombre d'œufs.
  const unitOf = (id: string, f?: { unitG?: number }) => (id === 'oeuf' ? EGG_COUNT_G : f?.unitG);
  const stepOf = (id: string, f?: { unitG?: number }) => unitOf(id, f) ?? 25;
  const startOf = (id: string, f?: { unitG?: number }) => (id === 'oeuf' ? 4 * EGG_COUNT_G : unitOf(id, f) ? 2 * unitOf(id, f)! : 100);
  const qty = (id: string, f: { unitG?: number } | undefined, g: number) => (unitOf(id, f) ? `${Math.round(g / unitOf(id, f)!)}` : `${g} g`);
  const setValue = (v: UsualItem[]) => set({ usualBreakfast: v });
  const setDetails = (p: Partial<BreakfastDetails>) => set({ breakfastDetails: { ...d, ...p } });
  const change = (id: string, f: { unitG?: number } | undefined, delta: number) => {
    const cur = value.find((x) => x.foodId === id);
    if (!cur) return;
    const grams = cur.grams + delta * stepOf(id, f);
    setValue(grams <= 0 ? value.filter((x) => x.foodId !== id) : value.map((x) => (x.foodId === id ? { ...x, grams } : x)));
  };
  const row = (id: string, f: { name: string; unitG?: number }) => {
    const cur = value.find((x) => x.foodId === id);
    return (
      <div key={id} className="spread">
        <button className="cq-opt" style={{ flex: 1 }} aria-pressed={!!cur} onClick={() => setValue(cur ? value.filter((x) => x.foodId !== id) : [...value, { foodId: id, grams: startOf(id, f) }])}>
          <span className="cq-opt-l">{f.name}</span>
        </button>
        {cur && (
          <span className="row" style={{ gap: 6, marginLeft: 8 }}>
            <button className="icon-btn" aria-label={`Moins de ${f.name}`} onClick={() => change(id, f, -1)}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <strong className="num" style={{ minWidth: 44, textAlign: 'center' }}>{qty(id, f, cur.grams)}</strong>
            <button className="icon-btn" aria-label={`Plus de ${f.name}`} onClick={() => change(id, f, 1)}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    );
  };

  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} className="chip" aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );
  const noir = d.milkMl === 0 && d.sugarG === 0 && !d.coffeeUnknown;

  return (
    <div className="stack">
      {FOODS.filter((f) => f.breakfast).map((f) => row(f.id, f))}
      {products.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: '6px 0 0' }}>Mes produits · valeurs de l’étiquette</p>
          {products.map((p) => row(p.id, p))}
        </>
      )}

      {value.some((x) => x.foodId === 'oeuf') && (
        <>
          <p className="eyebrow" style={{ margin: '6px 0 0' }}>Œuf · calibre (poids avec coquille)</p>
          <div className="chips" role="group" aria-label="Calibre de l’œuf">
            {(Object.keys(EGG_CALIBRES) as (keyof typeof EGG_CALIBRES)[]).map((c) =>
              chip(!d.eggG && d.eggCalibre === c, `${c} · ${EGG_CALIBRES[c].shell} → ≈ ${EGG_CALIBRES[c].edibleG} g`, () => setDetails({ eggCalibre: c, eggG: undefined })),
            )}
            {chip(!d.eggG && !d.eggCalibre, 'Je ne sais pas · M supposé', () => setDetails({ eggCalibre: undefined, eggG: undefined }))}
          </div>
          <p className="eyebrow" style={{ margin: '6px 0 0' }}>Ou : contenu pesé sans coquille</p>
          <QtyInput label="Poids d’un œuf pesé" unit="g" value={d.eggG} onChange={(v) => setDetails({ eggG: v && v > 0 ? v : undefined })} />
          <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>{EGG_SOURCE}</p>
        </>
      )}

      {value.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: '6px 0 0' }}>Matière grasse de cuisson</p>
          <div className="chips" role="group" aria-label="Type de matière grasse">
            {chip(d.fatKind === 'huile', 'Huile', () => setDetails({ fatKind: 'huile', fatUnknown: false }))}
            {chip(d.fatKind === 'beurre', 'Beurre', () => setDetails({ fatKind: 'beurre', fatUnknown: false }))}
            {chip(d.fatKind === 'autre', 'Autre', () => setDetails({ fatKind: 'autre', fatUnknown: false }))}
          </div>
          <div className="chips" role="group" aria-label="Quantité de matière grasse">
            {chip(d.fatG === 0 && !d.fatUnknown, 'Aucune', () => setDetails({ fatG: 0, fatUnknown: false }))}
            {[5, 10, 15].map((g) => chip(d.fatG === g && !d.fatUnknown, `${g} g`, () => setDetails({ fatG: g, fatUnknown: false })))}
            {chip(!!d.fatUnknown, 'Inconnu', () => setDetails({ fatG: undefined, fatUnknown: true }))}
          </div>
          <QtyInput label="Autre quantité" unit="g" value={d.fatG !== undefined && ![0, 5, 10, 15].includes(d.fatG) ? d.fatG : undefined} onChange={(v) => setDetails({ fatG: v, fatUnknown: false })} />
        </>
      )}

      <button className="cq-opt" aria-pressed={coffee} onClick={() => set({ breakfastCoffee: !coffee })}>
        <span className="cq-opt-l">Café</span>
      </button>
      {coffee && (
        <>
          <p className="eyebrow" style={{ margin: '6px 0 0' }}>Dans le café</p>
          <div className="chips" role="group" aria-label="Café">
            {chip(noir, 'Noir', () => setDetails({ milkMl: 0, sugarG: 0, coffeeUnknown: false }))}
            {chip(!!d.coffeeUnknown, 'Inconnu', () => setDetails({ milkMl: undefined, sugarG: undefined, coffeeUnknown: true }))}
          </div>
          <div className="chips" role="group" aria-label="Type de lait">
            {MILKS.map((m) => chip(d.milkKind === m.k, m.label, () => setDetails({ milkKind: m.k, coffeeUnknown: false })))}
          </div>
          <div className="chips" role="group" aria-label="Quantité de lait">
            {[0, 30, 50, 100].map((ml) => chip(d.milkMl === ml && !d.coffeeUnknown, `${ml} ml`, () => setDetails({ milkMl: ml, coffeeUnknown: false })))}
          </div>
          <QtyInput label="Autre quantité de lait" unit="ml" value={d.milkMl !== undefined && ![0, 30, 50, 100].includes(d.milkMl) ? d.milkMl : undefined} onChange={(v) => setDetails({ milkMl: v, coffeeUnknown: false })} />
          <div className="chips" role="group" aria-label="Sucre">
            {[0, 4, 8].map((g) => chip(d.sugarG === g && !d.coffeeUnknown, g === 0 ? 'Sans sucre' : `${g} g sucre`, () => setDetails({ sugarG: g, coffeeUnknown: false })))}
          </div>
          <QtyInput label="Autre quantité de sucre" unit="g" value={d.sugarG !== undefined && ![0, 4, 8].includes(d.sugarG) ? d.sugarG : undefined} onChange={(v) => setDetails({ sugarG: v, coffeeUnknown: false })} />
        </>
      )}

      <p className="eyebrow" style={{ margin: '6px 0 0' }}>Appétit le matin</p>
      <div className="chips" role="group" aria-label="Appétit le matin">
        {BREAKFAST_SHARES.map((s) => chip(a.breakfastShare === s.pct, `${s.label} · ${s.pct} %`, () => set({ breakfastShare: s.pct })))}
        {chip(a.breakfastShare === undefined, 'Standard', () => set({ breakfastShare: undefined }))}
      </div>
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
  render: (a: NutritionAnswers, set: (p: Partial<NutritionAnswers>) => void, products: CustomFood[]) => React.ReactNode;
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
    id: 'petitdej',
    say: 'Ton petit-déjeuner habituel, si tu en as un. Je le garde tel quel et j’ajuste les autres repas. Passe si tu n’en as pas.',
    done: () => true,
    render: (a, set, products) => <UsualBreakfast a={a} set={set} products={products} />,
  },
  {
    id: 'maison',
    say: 'Ce que tu as déjà à la maison. Je te prépare tes plats avec ça d’abord ; le reste ira dans tes courses.',
    done: () => true,
    render: (a, set) => (
      <div className="cq-grid">
        {FOODS.filter((f) => f.group !== 'legume').map((f) => (
          <button key={f.id} className="cq-opt" aria-pressed={(a.pantry ?? []).includes(f.id)} onClick={() => set({ pantry: (a.pantry ?? []).includes(f.id) ? (a.pantry ?? []).filter((x) => x !== f.id) : [...(a.pantry ?? []), f.id] })}>
            <span className="cq-opt-l">{f.name}</span>
          </button>
        ))}
      </div>
    ),
  },
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
  const kitchen = useKitchen(repo);
  const products = useMemo<CustomFood[]>(() => kitchen.mine.map((m) => ({ id: m.id, name: m.name, kcal: m.kcal, protein: m.protein, unitG: m.unitG, unitName: m.unitName })), [kitchen.mine]);
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
          <div className="card ob-card">{cur.render(a, set, products)}</div>
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
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [bfToday, setBfToday] = useState<UsualItem[] | undefined>();
  const [snapshot, setSnapshot] = useState<Record<string, PlanEntry>>({});
  const kitchen = useKitchen(repo);
  const customFoods = useMemo<CustomFood[]>(() => kitchen.mine.map((m) => ({ id: m.id, name: m.name, kcal: m.kcal, protein: m.protein, unitG: m.unitG, unitName: m.unitName })), [kitchen.mine]);
  const targets = useTargets(repo, weight.days, workout?.durationMin ?? 0);
  const { settings: prayer } = usePrayer(repo);
  const prayers = prayer?.enabled ? { times: timesFor(today, prayer), wakeAtFajr: prayer.wakeAtFajr } : undefined;

  useEffect(() => {
    (async () => {
      setAnswers((await loadNutrition(repo)) ?? null);
      setDone((await repo.getKv<string[]>(doneKey(today))) ?? []);
      setEatenState((await repo.getKv<Record<string, EatenMeal>>(eatenKey(today))) ?? {});
      setConfirmed((await repo.getKv<string[]>(confirmedKey(today))) ?? []);
      setBfToday(await loadBreakfastToday(repo, today));
      setSnapshot((await repo.getKv<Record<string, PlanEntry>>(snapshotKey(today))) ?? {});
      const day = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
      const monday = new Date(Date.parse(`${today}T12:00:00Z`) - day * 86_400_000).toISOString().slice(0, 10);
      const item = (await loadPlanning(repo)).filter((i) => i.weekStart === monday && i.day === day && (i.kind === 'seance' || i.kind === 'course') && (!i.adjustment || i.adjustment.decision === 'adaptée')).sort((x, y) => toMin(x.start) - toMin(y.start))[0];
      if (item) setWorkout({ start: item.start, durationMin: item.durationMin, title: item.title });
    })();
  }, [repo, today]);

  const plan = useMemo(() => {
    if (!answers || !targets.calories.value || !targets.water.value) return undefined;
    const dayIndex = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    return freezeConfirmed(buildDayPlan({ answers, kcal: targets.calories.value.kcal, proteinG: targets.calories.value.proteinG, waterMl: targets.water.value, workout, dayIndex, eaten, prayers, customFoods, breakfastOverride: bfToday }), snapshot, confirmed);
  }, [answers, targets.calories.value, targets.water.value, workout, today, eaten, prayer, customFoods, bfToday, snapshot, confirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apport CONNU (détaillé ou « exactement le plan ») : seule base du bilan calorique. Coché ou estimé ≠ connu.
  const intake = useMemo(() => (plan ? knownIntake(plan, done, confirmed) : undefined), [plan, done, confirmed]);
  useEffect(() => {
    if (intake) repo.setKv(`intake.${today}`, intake);
  }, [intake, repo, today]);

  /** « Exactement le plan » : composition et portions du plan confirmées pour ce repas. */
  const confirmPlan = useCallback(
    async (id: string, on: boolean) => {
      const next = on ? [...new Set([...confirmed, id])] : confirmed.filter((x) => x !== id);
      // Photo du repas au moment de la confirmation : un réglage ou une habitude changés plus tard ne la réécrivent pas.
      const snap = { ...snapshot };
      if (on) {
        const entry = plan?.find((e) => e.id === id);
        if (entry) snap[id] = entry;
      } else delete snap[id];
      await repo.setKv(snapshotKey(today), snap);
      setSnapshot(snap);
      await repo.setKv(confirmedKey(today), next);
      setConfirmed(next);
    },
    [confirmed, repo, today, snapshot, plan],
  );

  /** Imprévu : un repas remplacé par autre chose (estimation), les suivants sont recalculés. */
  const setEaten = useCallback(
    async (id: string, m: EatenMeal | undefined) => {
      const next = { ...eaten };
      if (m) next[id] = m;
      else delete next[id];
      await repo.setKv(eatenKey(today), next);
      setEatenState(next);
      if (confirmed.includes(id)) await confirmPlan(id, false);
    },
    [eaten, repo, today, confirmed, confirmPlan],
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
    return Array.from({ length: 7 }, (_, k) => buildDayPlan({ answers, kcal: targets.calories.value!.kcal, proteinG: targets.calories.value!.proteinG, waterMl: targets.water.value!, dayIndex: (d0 + k) % 7, customFoods }));
  }, [answers, targets.calories.value, targets.water.value, today, customFoods]);

  /** « Utiliser aujourd'hui » : change seulement le petit-déjeuner du jour ; l'habitude reste intacte. */
  const setBreakfastToday = async (items: UsualItem[] | undefined) => {
    await saveBreakfastToday(repo, today, items);
    setBfToday(items?.length ? items : undefined);
  };
  const saveAnswers = async (next: NutritionAnswers) => {
    await repo.setKv(KEY, next);
    setAnswers(next);
  };
  return { answers, plan, done, toggle, targets, next, setEaten, week, today, confirmed, confirmPlan, intake, saveAnswers, bfToday, setBreakfastToday, customFoods };
}

export function NutritionPage({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const { answers, plan, done, toggle, targets, next, setEaten, week, today, confirmed, confirmPlan, intake, saveAnswers, bfToday, setBreakfastToday, customFoods } = useDayPlan(repo);
  const kitchen = useKitchen(repo);
  const [ate, setAte] = useState<PlanEntry | null>(null);
  const [text, setText] = useState('');
  const [shot, setShot] = useState<File | undefined>();
  const [shopping, setShopping] = useState(false);
  const showKcal = useTracking(repo).prefs.showCalories;
  const [got, setGot] = useState<string[]>([]);
  const [unplanned, setUnplanned] = useState<PlanEntry | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [fridge, setFridge] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uk, setUk] = useState<UnplannedKind>('maison');
  const [us, setUs] = useState<UnplannedSize>('normale');
  if (answers === undefined) return null;
  const kcal = targets.calories.value;
  const totals = plan ? planTotals(plan) : undefined;
  return (
    <>
      <h1>Nutrition</h1>
      {notice && (
        <p role="status" className="pill" style={{ marginBottom: 8, height: 'auto', padding: '6px 10px', whiteSpace: 'normal' }} onClick={() => setNotice(null)}>{notice}</p>
      )}
      <div className="kpi-grid">
        <div className="ui-card kpi">
          <span className="kpi-label">Calories cible</span>
          <span className="kpi-value num">{!showKcal ? 'off' : kcal ? kcal.kcal.toLocaleString('fr-BE') : '—'}</span>
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
          {answers && (
            <button className="btn sm" onClick={() => setFridge(true)}>
              <Refrigerator size={14} aria-hidden="true" /> Frigo
            </button>
          )}
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
                      {e.kcal && showKcal ? <span className="num tl-kcal">{e.kcal} kcal · {e.protein} g P</span> : null}
                    </p>
                    <p className="tl-items">{e.items.join(' · ')}</p>
                    {(() => {
                      const m = intake?.meals.find((x) => x.id === e.id);
                      if (!m || m.doc === 'non noté' || m.doc === 'plan confirmé') return null;
                      return (
                        <span className="pill">
                          {m.level} · {DOC_LABEL[m.doc]} · {m.counted ? 'compté' : 'exclu, apport inconnu'}
                        </span>
                      );
                    })()}
                    {e.kind === 'repas' && !e.unplanned && confirmed.includes(e.id) && (
                      <button className="pill" onClick={() => confirmPlan(e.id, false)}>
                        documenté · plan confirmé · compté ✕
                      </button>
                    )}
                    {e.kind === 'repas' && !e.unplanned && isDone && !confirmed.includes(e.id) && (
                      <button className="tl-alt" onClick={() => confirmPlan(e.id, true)}>
                        <Check size={12} aria-hidden="true" /> Exactement le plan (portions comprises)
                      </button>
                    )}
                    {e.adjusted && <span className="pill">{e.adjusted} après imprévu</span>}
                    {e.missing?.length ? (
                      <button className="pill" style={{ height: 'auto', padding: '4px 8px', whiteSpace: 'normal' }} onClick={() => setReviewing(true)}>
                        Manque à la maison : {e.missing.join(', ')} · voir l’avis
                      </button>
                    ) : null}
                    {e.id === 'petit_dej' && answers?.usualBreakfast?.length ? (
                      <button className="tl-alt" onClick={() => setReviewing(true)}>
                        <Scale size={12} aria-hidden="true" /> Avis
                      </button>
                    ) : null}
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
          {intake && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.78rem' }}>
              {intake.complete
                ? `Journée documentée : comptée dans le bilan.${showKcal ? ` Apport ≈ ${intake.kcal} kcal · ${intake.documentedProtein} g P.` : ''}`
                : `Journée incomplète : apport total inconnu, pas compté dans le bilan.${showKcal ? ` Repas documentés seulement : ${intake.documentedKcal} kcal (pas le total du jour).` : ''}`}
              {intake.excluded.length ? ` Exclus, apport inconnu (pas 0) : ${intake.excluded.join(', ')}.` : ''}
            </p>
          )}
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
                        await setEaten(ate.id, { label: r.items.map((i) => i.label).join(', '), kcal: t.kcal, protein: t.protein, source: 'portions déclarées' });
                        setAte(null);
                      }}
                    >
                      Enregistrer et recalculer ma journée
                    </button>
                  </div>
                );
              })()}
          </Modal>
          <Modal open={fridge} onClose={() => setFridge(false)} title="Frigo">
            {(() => {
              if (!answers) return null;
              const groups: { g: FoodGroup; label: string }[] = [
                { g: 'proteine', label: 'Protéines' },
                { g: 'glucide', label: 'Glucides' },
                { g: 'lipide', label: 'Lipides' },
                { g: 'fruit', label: 'Fruits' },
              ];
              // Première ouverture : on propose ce que tu manges d'habitude ; rien n'est enregistré avant ton premier geste.
              const suggested = [...new Set([...answers.proteins, ...answers.carbs, ...answers.fats, ...answers.fruits, ...(answers.usualBreakfast ?? []).map((u) => u.foodId)])];
              const have = answers.pantry?.length ? answers.pantry : suggested;
              const toggle = async (id: string) => {
                const next = have.includes(id) ? have.filter((x) => x !== id) : [...have, id];
                await saveAnswers({ ...answers, pantry: next });
              };
              const row = (id: string, name: string) => (
                <button key={id} className="cq-opt" aria-pressed={have.includes(id)} onClick={() => toggle(id)}>
                  <span className="cq-opt-l">{name}</span>
                </button>
              );
              return (
                <div className="stack">
                  <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Coche ce que tu as à la maison. Décoche ce que tu n’as plus : tes plats et ton petit-déjeuner le savent.</p>
                  {!answers.pantry?.length && <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Pré-coché avec ce que tu manges d’habitude. Ton premier geste l’enregistre.</p>}
                  {groups.map(({ g, label }) => (
                    <div key={g} className="stack">
                      <p className="eyebrow" style={{ margin: '4px 0 0' }}>{label}</p>
                      <div className="cq-grid">{FOODS.filter((f) => f.group === g).map((f) => row(f.id, f.name))}</div>
                    </div>
                  ))}
                  {customFoods.length > 0 && (
                    <div className="stack">
                      <p className="eyebrow" style={{ margin: '4px 0 0' }}>Mes produits</p>
                      <div className="cq-grid">{customFoods.map((c) => row(c.id, c.name))}</div>
                    </div>
                  )}
                  <button className="btn primary" onClick={() => setFridge(false)}>Terminé</button>
                </div>
              );
            })()}
          </Modal>
          <Modal open={reviewing} onClose={() => setReviewing(false)} title="Avis · petit-déjeuner">
            {(() => {
              const r = answers && kcal ? reviewBreakfast(answers, kcal.kcal, kcal.proteinG, { custom: customFoods }) : undefined;
              if (!answers || !r) return <p className="muted">Pas assez de données pour comparer.</p>;
              const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
              const done = (msg: string) => {
                setReviewing(false);
                setNotice(msg);
              };
              return (
                <div className="stack">
                  <div>
                    <p className="num" style={{ margin: 0, fontWeight: 700 }}>Repère ≈ {r.target.kcal} kcal · {r.target.protein} g P</p>
                    <p className="muted" style={{ margin: '2px 0 6px', fontSize: '0.78rem' }}>{r.target.how}</p>
                    <div className="chips" role="group" aria-label="Appétit le matin">
                      {BREAKFAST_SHARES.map((s) => (
                        <button key={s.pct} className="chip" aria-pressed={r.target.sharePct === s.pct} onClick={() => saveAnswers({ ...answers, breakfastShare: s.pct })}>
                          {s.label} · {s.pct} %
                        </button>
                      ))}
                    </div>
                    <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.78rem' }}>Si tu es en dessous ou au-dessus, les autres repas s’ajustent : tu ne manges pas sans faim pour atteindre un chiffre.</p>
                  </div>
                  {r.missingNames.length > 0 && (
                    <span className="pill" style={{ height: 'auto', padding: '4px 8px', whiteSpace: 'normal' }}>Manque à la maison : {r.missingNames.join(', ')}</span>
                  )}
                  {bfToday && <span className="pill">Version d’aujourd’hui seulement · ton habituel reste inchangé</span>}
                  {r.missing.length > 0 && (
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {r.missing.map((m) => (
                        <span key={m} className="pill" style={{ height: 'auto', padding: '4px 8px', whiteSpace: 'normal' }}>À préciser : {m}</span>
                      ))}
                      <button className="btn sm" onClick={() => (setReviewing(false), go({ name: 'nutritionSetup' }))}>Préciser</button>
                    </div>
                  )}
                  {r.unknownNotCounted.length > 0 && (
                    <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Quantité inconnue, non comptée (pas zéro) : {r.unknownNotCounted.join(', ')}.</p>
                  )}
                  <div className="ui-card" style={{ margin: 0 }} aria-label="Recommandation">
                    <p className="eyebrow" style={{ margin: 0 }}>Recommandé</p>
                    <p className="row-title" style={{ margin: 0, whiteSpace: 'normal' }}>{r.options.find((o) => o.id === r.recommendedId)?.label}</p>
                    <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>{r.recommendedWhy}</p>
                    <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>{r.criteria}</p>
                  </div>
                  {r.options.map((o) => (
                    <section key={o.id} className="ui-card" style={{ margin: 0 }} aria-label={o.label}>
                      <div className="spread">
                        <strong>{o.label}</strong>
                        {o.id === r.recommendedId && <span className="pill">recommandé</span>}
                      </div>
                      <p className="tl-items" style={{ margin: 0 }}>{o.items.join(' · ')}</p>
                      <p className="num" style={{ margin: 0 }}>
                        ≈ {o.kcal} kcal · {o.protein} g P
                        {o.id !== 'habituel' && <span className="muted"> ({sign(o.dKcal)} kcal · {sign(o.dProtein)} g P vs habituel)</span>}
                      </p>
                      {o.changes.length > 0 && (
                        <ul className="mini-list">
                          {o.changes.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      )}
                      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{o.why}</p>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {o.id !== 'habituel' && (
                          <button
                            className="btn sm"
                            onClick={async () => {
                              await setBreakfastToday(o.parts);
                              done('Version choisie pour aujourd’hui seulement. Rien n’est noté comme mangé.');
                            }}
                          >
                            Utiliser aujourd’hui
                          </button>
                        )}
                        {o.id !== 'habituel' && (
                          <button
                            className="btn sm"
                            onClick={async () => {
                              if (!window.confirm(`Enregistrer « ${o.label} » comme ton nouveau petit-déjeuner habituel ? Les prochains jours changent.`)) return;
                              await saveAnswers({ ...answers, usualBreakfast: o.parts });
                              await setBreakfastToday(undefined);
                              done('Nouvelle habitude enregistrée. Rien n’est noté comme mangé.');
                            }}
                          >
                            Enregistrer comme habitude
                          </button>
                        )}
                        <button
                          className="btn sm primary"
                          onClick={async () => {
                            await setEaten('petit_dej', { label: o.label, kcal: o.kcal, protein: o.protein, source: 'estimé' });
                            done('Noté comme mangé (estimation). Les autres repas sont recalculés.');
                          }}
                        >
                          Confirmer ce que j’ai mangé
                        </button>
                      </div>
                    </section>
                  ))}
                  {r.eggAssumption && <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>{r.eggAssumption} {r.eggSource}</p>}
                  {r.generic.length > 0 && (
                    <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
                      Calcul avec des valeurs génériques (moyennes) : {r.generic.join(', ')}. Scanne ton produit dans Ma cuisine, puis ajoute-le dans « Mes produits » de l’entretien, pour utiliser ses valeurs.
                    </p>
                  )}
                  {r.notes.map((n) => (
                    <p key={n} className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>{n}</p>
                  ))}
                  <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>Comparaison chiffrée avec un repère ajustable, pas un avis médical. Choisir une version ne veut pas dire que tu l’as mangée.</p>
                </div>
              );
            })()}
          </Modal>
          <Modal open={shopping} onClose={() => setShopping(false)} title="Courses · 7 jours">
            {(() => {
              const list = shoppingList(week, answers?.pantry);
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
                            {l.home && <span className="pill">maison</span>}
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
