// Matériel : inventaire (ce que tu as) et recommandations d'achat notées pour toi (« Game changer pour… »).
// Aucun lien d'achat, aucune marque : un nom générique, un ordre de prix indicatif, et la raison.

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, Luggage, ShoppingBag } from 'lucide-react';
import { GEAR, recommendGear, type GearContext } from '../engine/gear';
import type { ProgramAnswers } from '../engine/programBuilder';
import type { Repository } from '../storage/db';
import { loadBoughtGear, loadKettlebells, loadOwned, loadPieces, saveBoughtGear, saveKettlebells, saveOwned, savePieces } from './equipment';
import type { Route } from './App';

/** Matériel courant qu'on peut cocher (noms utilisés par le catalogue d'exercices). */
const KNOWN = ['barre fixe', 'barres parallèles', 'barre basse', 'banc', 'kettlebell', 'ceinture de lest', 'élastique', 'tapis', 'corde à sauter', 'roue abdominale', 'mini-bande', 'rouleau'];

export function GearPage({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [ctx, setCtx] = useState<GearContext | null>(null);
  const [bought, setBought] = useState<string[]>([]);

  const load = async () => {
    const p = await repo.getKv<{ answers: ProgramAnswers }>('program.current');
    const a = p?.answers;
    setCtx({
      owned: await loadOwned(repo),
      pieces: await loadPieces(repo),
      kettlebells: await loadKettlebells(repo),
      priority: a?.priority,
      fatZones: a?.fatZones ?? [],
      muscleZones: a?.muscleZones ?? [],
      pains: a?.pains ?? [],
      runsPerWeek: a?.runsPerWeek,
    });
    setBought(await loadBoughtGear(repo));
  };
  useEffect(() => {
    load();
  }, [repo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ctx) return null;
  const recs = recommendGear(ctx, bought);

  const toggleOwned = async (name: string) => {
    const v = ctx.owned.includes(name) ? ctx.owned.filter((x) => x !== name) : [...ctx.owned, name];
    await saveOwned(repo, v);
    setCtx({ ...ctx, owned: v });
  };

  const buy = async (id: string) => {
    const g = GEAR.find((x) => x.id === id)!;
    await saveBoughtGear(repo, [...bought, id]);
    await saveOwned(repo, [...new Set([...ctx.owned, ...g.provides])]);
    if (g.addsPieces) await savePieces(repo, [...ctx.pieces, ...g.addsPieces].sort((a, b) => a - b));
    if (g.addsKettlebell && !ctx.kettlebells.includes(g.addsKettlebell)) await saveKettlebells(repo, [...ctx.kettlebells, g.addsKettlebell].sort((a, b) => a - b));
    await load();
  };

  return (
    <>
      <button className="btn ghost" onClick={() => go({ name: 'coach' })}>
        <ChevronLeft size={20} aria-hidden="true" /> Coach
      </button>
      <h1 style={{ marginTop: 8 }}>Matériel</h1>

      <section className="ui-card stack" aria-label="Mon matériel">
        <p className="eyebrow" style={{ margin: 0 }}>Mon matériel</p>
        <div className="chips">
          {[...new Set([...KNOWN, ...ctx.owned])].map((n) => (
            <button key={n} className="chip" aria-pressed={ctx.owned.includes(n)} onClick={() => toggleOwned(n)}>
              {n}
            </button>
          ))}
        </div>
        <p className="muted num" style={{ margin: 0, fontSize: '0.8rem' }}>
          Lest : {ctx.pieces.map((p) => p.toLocaleString('fr-BE')).join(' + ')} kg · Kettlebells : {ctx.kettlebells.join(' et ')} kg (Réglages)
        </p>
      </section>

      <p className="eyebrow" style={{ margin: '14px 0 8px' }}>
        <ShoppingBag size={13} aria-hidden="true" /> Matériel conseillé pour toi
      </p>
      {recs.map((r) => (
        <section key={r.gear.id} className={`ui-card gear v-${r.verdict === 'Game changer' ? 'gc' : r.verdict === 'Utile' ? 'ok' : 'bonus'}`} aria-label={r.gear.name}>
          <div className="spread">
            <span className="gear-verdict">{r.verdict}</span>
            <span className="gear-score num" aria-label={`Note ${r.score} sur 10`}>
              {r.score}/10
            </span>
          </div>
          <p className="row-title" style={{ margin: '6px 0 2px' }}>{r.gear.name}</p>
          <p className="gear-for">
            {r.verdict === 'Game changer' ? 'Game changer pour ' : 'Pour '}
            <strong>{r.gear.muscles.join(', ')}</strong>
          </p>
          <p className="gear-why">{r.why}</p>
          <ul className="gear-unlocks">
            {r.gear.unlocks.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <div className="spread">
            <span className="pill num">
              ≈ {r.gear.price[0]}–{r.gear.price[1]} €{r.gear.portable ? '' : ''}
            </span>
            {r.gear.portable && (
              <span className="pill">
                <Luggage size={12} aria-hidden="true" /> séjours
              </span>
            )}
            <button className="btn sm" onClick={() => buy(r.gear.id)}>
              <Check size={14} aria-hidden="true" /> Je l’ai acheté
            </button>
          </div>
        </section>
      ))}
      <p className="muted" style={{ fontSize: '0.75rem' }}>Prix indicatifs (entrée de gamme, neuf). Note calculée sur ton programme, tes zones et tes blocages actuels.</p>
    </>
  );
}
