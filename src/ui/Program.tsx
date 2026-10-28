import { useEffect, useState } from 'react';
import { Dumbbell, Layers, Pencil, Play, Plus, Timer, Trash2 } from 'lucide-react';
import { EXERCISES, findVariant } from '../catalog/exercises';
import type { SetRole } from '../engine/types';
import type { Repository } from '../storage/db';
import { ProgramTabs } from './common';
import { newId } from './support';
import { loadTemplates, saveTemplates, type SessionTemplate, type TemplateLine } from './templates';
import { previewTemplate, startSessionFromTemplate } from './actions';
import { estimateLineMinutes } from '../engine/programBuilder';
import type { SessionPlan } from '../engine/types';
import { Help } from './common';
import type { Route } from './App';
import { RunCard } from './RunCard';

const ROLE_LABEL: Record<SetRole, string> = {
  warmup: 'Échauffement',
  work: 'Travail',
  technique: 'Technique',
  test: 'Test',
};

export function Program({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [editing, setEditing] = useState<SessionTemplate | null>(null);
  /** Prescription effective au lancement, par modèle (charges réelles, adaptations de gêne, phase allégée). */
  const [effective, setEffective] = useState<Record<string, SessionPlan>>({});

  useEffect(() => {
    loadTemplates(repo).then(async (list) => {
      setTemplates(list);
      const entries = await Promise.all(list.map(async (t) => [t.id, await previewTemplate(repo, t).catch(() => undefined)] as const));
      setEffective(Object.fromEntries(entries.filter((e): e is readonly [string, SessionPlan] => !!e[1])));
    });
  }, [repo]);

  const persist = async (list: SessionTemplate[]) => {
    await saveTemplates(repo, list);
    setTemplates(list);
  };

  if (editing) {
    return (
      <TemplateEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={async (t) => {
          const exists = templates.some((x) => x.id === t.id);
          await persist(exists ? templates.map((x) => (x.id === t.id ? t : x)) : [...templates, t]);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <>
      <h1>Entraînement</h1>
      <ProgramTabs current="program" go={go} />
      {templates.map((t) => {
        const plan = effective[t.id];
        // Lignes effectives (une par exercice) d'après l'aperçu ; en attendant l'aperçu, le modèle.
        const eff = plan
          ? [...new Map(plan.sets.map((s) => [s.blockId, plan.sets.filter((x) => x.blockId === s.blockId)])).values()].map((g) => ({ first: g[0]!, count: g.length }))
          : undefined;
        const sets = eff ? eff.reduce((n, g) => n + g.count, 0) : t.lines.reduce((n, l) => n + l.sets, 0);
        const minutes = eff ? estimateLineMinutes(eff.map((g) => ({ ...g.first, sets: g.count })) as never) : estimateLineMinutes(t.lines as never);
        return (
          <section key={t.id} className="ui-card tpl" aria-label={t.title}>
            <div className="tpl-head">
              <div className="grow">
                <h2 className="tpl-title">{t.title}</h2>
                <div className="tpl-meta">
                  <span className="pill num"><Dumbbell size={12} aria-hidden="true" /> {eff ? eff.length : t.lines.length}</span>
                  <span className="pill num"><Layers size={12} aria-hidden="true" /> {sets}</span>
                  <span className="pill num"><Timer size={12} aria-hidden="true" /> ≈ {minutes} min</span>
                </div>
              </div>
              <button
                className="tpl-play"
                aria-label={`Commencer ${t.title}`}
                disabled={t.lines.length === 0}
                onClick={async () => go({ name: 'session', id: await startSessionFromTemplate(repo, t) })}
              >
                <Play size={22} aria-hidden="true" />
              </button>
            </div>
            <ol className="tpl-list">
              {(eff ?? t.lines.map((l) => ({ first: { ...l, blockId: l.id } as never, count: l.sets }))).map((g, i) => {
                const l = g.first as unknown as TemplateLine & { role?: SetRole; progression?: string };
                const test = l.role === 'test';
                const adapted = !!l.progression && /Adaptée à ta gêne|Phase allégée|Pas de test maximal|sous-maximale|Charge reprise/.test(l.progression);
                return (
                  <li key={`${l.id}-${i}`} className="tpl-ex">
                    <span className="tpl-n">{i + 1}</span>
                    <span className="tpl-name">{findVariant(l.variantId)?.variant.name ?? l.variantId}</span>
                    <span className="tpl-stat">
                      {test ? `${g.count}× ${(l.targetRir ?? 0) >= 3 ? `sous-max · ${l.targetRir} en réserve` : 'max'}` : `${g.count}×${l.kind === 'reps' ? (l.repRange ? `${l.repRange[0]}–${l.repRange[1]}` : l.targetReps ?? '?') : `${l.targetSeconds ?? '?'} s`}`}
                      {l.loadKg ? <b>+{l.loadKg} kg</b> : null}
                      {adapted ? <b>adaptée · {l.targetRir} en réserve</b> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            <Help>Prescription au lancement : charges réelles, adaptations de gêne et phase allégée comprises. Durée = échauffement compris ; exercices un bras ou une jambe : travail des deux côtés compté. « Modifier » change le modèle de base.</Help>
            <div className="tpl-actions">
              <button className="btn sm" onClick={() => setEditing(t)}>
                <Pencil size={16} aria-hidden="true" /> Modifier
              </button>
              <button
                className="icon-btn"
                aria-label={`Supprimer le modèle ${t.title}`}
                onClick={async () => {
                  if (confirm(`Supprimer le modèle « ${t.title} » ? Les séances déjà réalisées restent dans l’historique.`)) {
                    await persist(templates.filter((x) => x.id !== t.id));
                  }
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </section>
        );
      })}
      {templates.length === 0 && <p className="muted">Aucune séance.</p>}
      <RunCard repo={repo} go={go} />
      <div className="row" style={{ marginTop: 4 }}>
        <button className="btn primary" onClick={() => setEditing({ id: newId(), title: '', lines: [], updatedAt: Date.now() })}>
          <Plus size={18} aria-hidden="true" /> Nouvelle
        </button>
      </div>
      <button className="ui-card list-row" onClick={() => go({ name: 'coachProgram' })} style={{ marginTop: 10 }}>
        <div className="grow">
          <p className="eyebrow">Programme sur plusieurs semaines</p>
          <p className="row-title">Construit par le coach</p>
        </div>
      </button>
    </>
  );
}


function TemplateEditor({ initial, onSave, onCancel }: { initial: SessionTemplate; onSave: (t: SessionTemplate) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial.title);
  const [lines, setLines] = useState<TemplateLine[]>(initial.lines);
  const [error, setError] = useState<string | null>(null);

  const addLine = (variantId: string) => {
    const kind = findVariant(variantId)?.variant.kind ?? 'reps';
    setLines([
      ...lines,
      { id: newId(), variantId, kind, role: 'work', sets: 3, targetReps: kind === 'reps' ? 8 : undefined, targetSeconds: kind === 'hold' ? 20 : undefined, restSeconds: 90 },
    ]);
  };
  const update = (id: string, patch: Partial<TemplateLine>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const save = () => {
    if (!title.trim()) return setError('Donne un nom à la séance.');
    if (lines.length === 0) return setError('Ajoute au moins un exercice.');
    const bad = lines.find((l) => l.sets < 1 || l.restSeconds < 0 || (l.kind === 'reps' ? !(l.targetReps! > 0) : !(l.targetSeconds! > 0)));
    if (bad) return setError('Chaque exercice doit avoir au moins 1 série et une cible supérieure à 0.');
    onSave({ id: initial.id, title: title.trim(), lines, updatedAt: Date.now() });
  };

  return (
    <>
      <h1>{initial.title ? 'Modifier la séance' : 'Nouvelle séance'}</h1>
      <div className="card stack">
        <label className="field">
          Nom de la séance
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Haut du corps A" />
        </label>
      </div>

      {lines.map((l, i) => {
        const found = findVariant(l.variantId);
        return (
          <div key={l.id} className="card stack">
            <div className="spread">
              <strong>
                {i + 1}. {found?.variant.name ?? l.variantId}
              </strong>
              <button className="btn ghost icon" aria-label="Retirer cet exercice" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="grid2">
              <label className="field">
                Séries
                <input type="number" inputMode="numeric" min={1} value={l.sets} onChange={(e) => update(l.id, { sets: Number(e.target.value) })} />
              </label>
              {l.kind === 'reps' ? (
                <label className="field">
                  Répétitions cibles
                  <input type="number" inputMode="numeric" min={1} value={l.targetReps ?? ''} onChange={(e) => update(l.id, { targetReps: num(e.target.value) })} />
                </label>
              ) : (
                <label className="field">
                  Durée cible (s)
                  <input type="number" inputMode="numeric" min={1} value={l.targetSeconds ?? ''} onChange={(e) => update(l.id, { targetSeconds: num(e.target.value) })} />
                </label>
              )}
              <label className="field">
                Repos (s)
                <input type="number" inputMode="numeric" min={0} value={l.restSeconds} onChange={(e) => update(l.id, { restSeconds: Number(e.target.value) })} />
              </label>
              <label className="field">
                Type
                <select value={l.role} onChange={(e) => update(l.id, { role: e.target.value as SetRole })}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Lest (kg)
                <span className="hint">Optionnel</span>
                <input type="number" inputMode="decimal" min={0} step="0.5" value={l.loadKg ?? ''} onChange={(e) => update(l.id, { loadKg: num(e.target.value) })} />
              </label>
              <label className="field">
                Assistance
                <span className="hint">ex. élastique rouge</span>
                <input value={l.assistance ?? ''} onChange={(e) => update(l.id, { assistance: e.target.value || undefined })} />
              </label>
            </div>
            <label className="field">
              Consigne
              <span className="hint">ex. prise neutre, tempo 3-1-1</span>
              <input value={l.cue ?? ''} onChange={(e) => update(l.id, { cue: e.target.value || undefined })} />
            </label>
          </div>
        );
      })}

      <div className="card">
        <label className="field">
          Ajouter un exercice
          <select value="" onChange={(e) => e.target.value && addLine(e.target.value)}>
            <option value="">Choisir…</option>
            {EXERCISES.map((ex) => (
              <optgroup key={ex.id} label={ex.name}>
                {ex.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--danger)', fontWeight: 600 }}>
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn primary" onClick={save}>
          Enregistrer
        </button>
        <button className="btn ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </>
  );
}
