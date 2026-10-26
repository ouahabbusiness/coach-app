// « Ma cuisine » : tes produits (code-barres photographié → Open Food Facts, ou étiquette recopiée) et tes plats maison.
// Seul le numéro du code-barres part sur Internet (Open Food Facts, base publique et gratuite).

import { useCallback, useEffect, useState } from 'react';
import { Barcode, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { BASE_FOODS, dishNutrients, fromOpenFoodFacts, type Dish, type KitchenFood } from '../engine/kitchen';
import type { Repository } from '../storage/db';
import { Modal } from './common';
import { newId } from './support';
import type { Route } from './App';
import { useConsent } from './Privacy';

const FOODS_KEY = 'kitchen.foods';
const DISHES_KEY = 'kitchen.dishes';

export function useKitchen(repo: Repository) {
  const [mine, setMine] = useState<KitchenFood[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  useEffect(() => {
    repo.getKv<KitchenFood[]>(FOODS_KEY).then((v) => v && setMine(v));
    repo.getKv<Dish[]>(DISHES_KEY).then((v) => v && setDishes(v));
  }, [repo]);
  const saveFoods = useCallback(
    async (v: KitchenFood[]) => {
      await repo.setKv(FOODS_KEY, v);
      setMine(v);
    },
    [repo],
  );
  const saveDishes = useCallback(
    async (v: Dish[]) => {
      await repo.setKv(DISHES_KEY, v);
      setDishes(v);
    },
    [repo],
  );
  // Tes produits passent avant les moyennes (même nom → le tien).
  const foods = [...mine, ...BASE_FOODS];
  return { mine, foods, dishes, saveFoods, saveDishes };
}

/** Lit le code-barres sur une photo (dans le téléphone, rien n'est envoyé). */
export async function readBarcode(file: File): Promise<string | undefined> {
  const { BrowserMultiFormatReader } = await import('@zxing/library');
  const url = URL.createObjectURL(file);
  try {
    const r = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    return r.getText();
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Valeurs de l'étiquette depuis Open Food Facts (seul le code-barres est envoyé). */
export async function lookupBarcode(code: string): Promise<KitchenFood | undefined> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments,serving_quantity`);
  if (!res.ok) return undefined;
  const j = (await res.json()) as { status?: number; product?: Parameters<typeof fromOpenFoodFacts>[1] };
  return j.status === 1 && j.product ? fromOpenFoodFacts(code, j.product) : undefined;
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n;
};

function FoodForm({ initial, onSave }: { initial?: Partial<KitchenFood>; onSave: (f: KitchenFood) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kcal, setKcal] = useState(initial?.kcal !== undefined ? String(initial.kcal) : '');
  const [prot, setProt] = useState(initial?.protein !== undefined ? String(initial.protein) : '');
  const [unitG, setUnitG] = useState(initial?.unitG !== undefined ? String(initial.unitG) : '');
  const [unitName, setUnitName] = useState(initial?.unitName ?? '');
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(', '));
  const k = num(kcal);
  const p = num(prot);
  const valid = name.trim() !== '' && k !== undefined && p !== undefined && k < 950 && p <= 100;
  return (
    <div className="stack">
      {initial?.source === 'Open Food Facts' && <span className="pill">Open Food Facts · vérifie avec ton étiquette</span>}
      <input aria-label="Nom" placeholder="Nom (ex. Skyr nature)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid2">
        <label className="field">
          kcal / 100 g
          <input type="text" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <label className="field">
          Protéines / 100 g
          <input type="text" inputMode="decimal" value={prot} onChange={(e) => setProt(e.target.value)} />
        </label>
      </div>
      <div className="grid2">
        <label className="field">
          Une unité = (g)
          <input type="text" inputMode="decimal" placeholder="ex. 30" value={unitG} onChange={(e) => setUnitG(e.target.value)} />
        </label>
        <label className="field">
          Nom de l’unité
          <input placeholder="ex. dose, pot" value={unitName} onChange={(e) => setUnitName(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Je l’appelle aussi
        <input placeholder="ex. prot, shaker" value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </label>
      <button
        className="btn primary block"
        disabled={!valid}
        onClick={() =>
          valid &&
          onSave({
            id: initial?.id ?? newId(),
            name: name.trim(),
            kcal: k!,
            protein: p!,
            unitG: num(unitG),
            unitName: unitName.trim() || (num(unitG) ? 'portion' : undefined),
            aliases: aliases.split(',').map((x) => x.trim()).filter(Boolean),
            barcode: initial?.barcode,
            brand: initial?.brand,
            source: initial?.source === 'Open Food Facts' && k === initial.kcal && p === initial.protein ? 'Open Food Facts' : 'étiquette',
          })
        }
      >
        Enregistrer
      </button>
    </div>
  );
}

function DishForm({ foods, initial, onSave }: { foods: KitchenFood[]; initial?: Dish; onSave: (d: Dish) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [portions, setPortions] = useState(String(initial?.portions ?? 2));
  const [ings, setIngs] = useState<{ foodId: string; grams: string }[]>(initial?.ingredients.map((i) => ({ foodId: i.foodId, grams: String(i.grams) })) ?? [{ foodId: foods[0]?.id ?? '', grams: '' }]);
  const dish: Dish = { id: initial?.id ?? newId(), name: name.trim(), portions: num(portions) ?? 1, ingredients: ings.filter((i) => num(i.grams)).map((i) => ({ foodId: i.foodId, grams: num(i.grams)! })) };
  const n = dishNutrients(dish, foods);
  return (
    <div className="stack">
      <input aria-label="Nom du plat" placeholder="Nom (ex. Riz poulet de maman)" value={name} onChange={(e) => setName(e.target.value)} />
      {ings.map((ing, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <select aria-label="Ingrédient" value={ing.foodId} onChange={(e) => setIngs(ings.map((x, j) => (j === i ? { ...x, foodId: e.target.value } : x)))}>
            {foods.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <input aria-label="Grammes" placeholder="g" inputMode="decimal" style={{ maxWidth: 90 }} value={ing.grams} onChange={(e) => setIngs(ings.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))} />
        </div>
      ))}
      <button className="btn ghost" onClick={() => setIngs([...ings, { foodId: foods[0]?.id ?? '', grams: '' }])}>
        <Plus size={14} aria-hidden="true" /> Ingrédient
      </button>
      <label className="field">
        Nombre de portions de la recette
        <input type="text" inputMode="numeric" value={portions} onChange={(e) => setPortions(e.target.value)} />
      </label>
      <p className="num" style={{ margin: 0, fontWeight: 700 }}>
        1 portion ≈ {n.kcal} kcal · {n.protein} g P · {n.grams} g
      </p>
      <button className="btn primary block" disabled={!dish.name || !dish.ingredients.length} onClick={() => onSave(dish)}>
        Enregistrer le plat
      </button>
    </div>
  );
}

export function KitchenPage({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const { mine, foods, dishes, saveFoods, saveDishes } = useKitchen(repo);
  const [editFood, setEditFood] = useState<Partial<KitchenFood> | null>(null);
  const [editDish, setEditDish] = useState<Dish | 'new' | null>(null);
  const [scan, setScan] = useState<string | null>(null);
  const food = useConsent(repo, 'food');

  const onPhoto = async (file: File) => {
    setScan('Lecture du code-barres…');
    const code = await readBarcode(file);
    if (!code) return setScan('Code-barres illisible : reprends la photo bien à plat, ou saisis l’étiquette.');
    // Accord avant le premier envoi du code-barres à Open Food Facts ; sinon saisie manuelle.
    if (!(await food.ensure())) {
      setScan(`Code ${code} lu sur l’appareil, non envoyé : recopie l’étiquette.`);
      return setEditFood({ barcode: code, source: 'étiquette' });
    }
    setScan(`Code ${code} · recherche…`);
    try {
      const f = await lookupBarcode(code);
      setScan(null);
      setEditFood(f ?? { barcode: code, source: 'étiquette' });
      if (!f) setScan(`Produit ${code} absent d’Open Food Facts : recopie l’étiquette.`);
    } catch {
      setScan('Pas de connexion : recopie l’étiquette.');
      setEditFood({ barcode: code, source: 'étiquette' });
    }
  };

  return (
    <>
      <button className="btn ghost" onClick={() => go({ name: 'nutrition' })}>
        <ChevronLeft size={20} aria-hidden="true" /> Nutrition
      </button>
      <h1 style={{ marginTop: 8 }}>Ma cuisine</h1>
      {food.modal}

      <section className="ui-card stack" aria-label="Mes produits">
        <div className="spread">
          <p className="eyebrow" style={{ margin: 0 }}>Mes produits · {mine.length}</p>
          <div className="row" style={{ gap: 6 }}>
            <label className="btn sm primary shot-btn">
              <Barcode size={14} aria-hidden="true" /> Scanner
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
            </label>
            <button className="btn sm" onClick={() => setEditFood({})}>
              <Plus size={14} aria-hidden="true" /> Étiquette
            </button>
          </div>
        </div>
        {scan && <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>{scan}</p>}
        {mine.length === 0 && <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Photographie le code-barres de ce que tu achètes souvent.</p>}
        <ul className="kit-list">
          {mine.map((f) => (
            <li key={f.id}>
              <button className="kit-row" onClick={() => setEditFood(f)}>
                <span className="grow">
                  <strong>{f.name}</strong>
                  <small className="num">
                    {f.kcal} kcal · {f.protein} g P / 100 g{f.unitG ? ` · ${f.unitName} ${f.unitG} g` : ''}
                  </small>
                </span>
                <span className="pill">{f.source}</span>
              </button>
              <button className="btn ghost icon" aria-label={`Retirer ${f.name}`} onClick={() => window.confirm(`Retirer « ${f.name} » ?`) && saveFoods(mine.filter((x) => x.id !== f.id))}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ui-card stack" aria-label="Mes plats">
        <div className="spread">
          <p className="eyebrow" style={{ margin: 0 }}>Mes plats · {dishes.length}</p>
          <button className="btn sm" onClick={() => setEditDish('new')}>
            <Plus size={14} aria-hidden="true" /> Plat
          </button>
        </div>
        <ul className="kit-list">
          {dishes.map((d) => {
            const n = dishNutrients(d, foods);
            return (
              <li key={d.id}>
                <button className="kit-row" onClick={() => setEditDish(d)}>
                  <span className="grow">
                    <strong>{d.name}</strong>
                    <small className="num">
                      1 portion ≈ {n.kcal} kcal · {n.protein} g P
                    </small>
                  </span>
                </button>
                <button className="btn ghost icon" aria-label={`Retirer ${d.name}`} onClick={() => window.confirm(`Retirer « ${d.name} » ?`) && saveDishes(dishes.filter((x) => x.id !== d.id))}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <Modal open={!!editFood} onClose={() => setEditFood(null)} title={editFood?.id ? 'Produit' : 'Nouveau produit'}>
        {editFood && (
          <FoodForm
            initial={editFood}
            onSave={async (f) => {
              await saveFoods([...mine.filter((x) => x.id !== f.id), f]);
              setEditFood(null);
            }}
          />
        )}
      </Modal>
      <Modal open={!!editDish} onClose={() => setEditDish(null)} title={editDish === 'new' ? 'Nouveau plat' : 'Plat'}>
        {editDish && (
          <DishForm
            foods={foods}
            initial={editDish === 'new' ? undefined : editDish}
            onSave={async (d) => {
              await saveDishes([...dishes.filter((x) => x.id !== d.id), d]);
              setEditDish(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}
