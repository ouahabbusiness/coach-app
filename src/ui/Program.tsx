import { useEffect, useState } from 'react';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { EXERCISES, findVariant } from '../catalog/exercises';
import type { SetRole } from '../engine/types';
import type { Repository } from '../storage/db';
import { NotBuilt, ProgramTabs } from './common';
import { newId } from './support';
import { loadTemplates, saveTemplates, type SessionTemplate, type TemplateLine } from './templates';
import { startSessionFromTemplate } from './actions';
import type { Route } from './App';

const ROLE_LABEL: Record<SetRole, string> = {
  warmup: 'Échauffement',
  work: 'Travail',
  technique: 'Technique',
  test: 'Test',
};

export function Program({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [editing, setEditing] = useState<SessionTemplate | null>(null);

  useEffect(() => {
    loadTemplates(repo).then(setTemplates);
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
      <h1>Programme</h1>
      <ProgramTabs current="program" go={go} />
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Mes séances</h2>
          <button
            className="btn primary"
            onClick={() => setEditing({ id: newId(), title: '', lines: [], updatedAt: Date.now() })}
          >
            <Plus size={18} aria-hidden="true" /> Nouvelle
          </button>
        </div>
        {templates.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Aucune séance enregistrée.</p>}
        <div className="stack" style={{ marginTop: 12 }}>
          {templates.map((t) => (
            <div key={t.id} className="card soft" style={{ margin: 0 }}>
              <strong>{t.title}</strong>
              <ul className="muted" style={{ margin: '4px 0 12px', paddingLeft: 18 }}>
                {t.lines.map((l) => (
                  <li key={l.id}>
                    {findVariant(l.variantId)?.variant.name ?? l.variantId} — {l.sets} × {l.kind === 'reps' ? `${l.targetReps ?? '?'} rép.` : `${l.targetSeconds ?? '?'} s`}
                    {l.loadKg ? ` · +${l.loadKg} kg` : ''}
                    {l.assistance ? ` · ${l.assistance}` : ''}
                  </li>
                ))}
              </ul>
              <div className="row">
                <button
                  className="btn primary"
                  disabled={t.lines.length === 0}
                  onClick={async () => go({ name: 'session', id: await startSessionFromTemplate(repo, t) })}
                >
                  <Play size={18} aria-hidden="true" /> Commencer
                </button>
                <button className="btn" onClick={() => setEditing(t)}>
                  <Pencil size={18} aria-hidden="true" /> Modifier
                </button>
                <button
                  className="btn ghost"
                  aria-label={`Supprimer le modèle ${t.title}`}
                  onClick={async () => {
                    if (confirm(`Supprimer le modèle « ${t.title} » ? Les séances déjà réalisées restent dans l’historique.`)) {
                      await persist(templates.filter((x) => x.id !== t.id));
                    }
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <NotBuilt title="Programme sur plusieurs semaines" phase="phase 1 (suite)">
      </NotBuilt>
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
