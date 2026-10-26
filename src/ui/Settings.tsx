import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Download, Upload, X } from 'lucide-react';
import { availableLoads } from '../engine/progression';
import { loadKettlebells, loadPieces, saveKettlebells, savePieces } from './equipment';
import type { Repository } from '../storage/db';
import { Notice } from './common';
import { GOAL_LABELS, goalChanges, type GoalVersion } from '../engine/profile';
import { STEPS } from './Onboarding';
import { useBackgrounds, type BgSlot } from './backgrounds';
import { useWinterMode, type WinterMode } from './winterArc';
import { loadGoals, loadOnboarding } from './profileStore';

type Status = 'testé' | 'non testé sur iPhone' | 'non implémenté' | 'à valider';

const FEATURES: { name: string; status: Status; note?: string }[] = [
  { name: 'Mode séance (séries, repos, interruptions)', status: 'testé', note: 'Moteur testé automatiquement ; interface vérifiée dans un navigateur de bureau.' },
  { name: 'Saisie des résultats, correction, annulation', status: 'testé' },
  { name: 'Stockage local et reprise après fermeture', status: 'testé', note: 'Testé avec une base simulée ; à confirmer sur Safari iOS.' },
  { name: 'Export / import JSON', status: 'testé' },
  { name: 'Fonctionnement hors ligne', status: 'non testé sur iPhone' },
  { name: 'Écran maintenu allumé', status: 'non testé sur iPhone' },
  { name: 'Consignes des exercices', status: 'à valider', note: 'Rédigées sans relecture professionnelle.' },
  { name: 'Démonstrations (images, animations)', status: 'non implémenté' },
  { name: 'Défi de novembre (saisie déclarée)', status: 'testé', note: 'Calculs testés automatiquement ; pas, sommeil et course sont déclarés, pas importés.' },
  { name: 'Onboarding et profil', status: 'testé', note: 'Sauvegarde et reprise vérifiées dans le navigateur ; objectifs versionnés testés automatiquement.' },
  { name: 'Planning de la semaine', status: 'testé', note: 'Conflits et conséquences testés automatiquement ; placement manuel uniquement.' },
  { name: 'Imprévus du planning', status: 'testé', note: 'Options et versions adaptées testées ; durées adaptées = estimations (règle produit).' },
  { name: 'Nutrition', status: 'non implémenté' },
  { name: 'Course à pied', status: 'non implémenté' },
  { name: 'Apple Santé / Apple Watch', status: 'non implémenté', note: 'Impossible dans une app web ; prévu dans l’app native.' },
  { name: 'Coach IA', status: 'non implémenté' },
  { name: 'Notifications', status: 'non implémenté' },
];

export function Settings({ repo, onBack, onEditProfile }: { repo: Repository; onBack: () => void; onEditProfile: () => void }) {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const exportData = async () => {
    const data = await repo.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coach-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: 'info', text: `Export créé : ${data.events.length} événements.` });
  };

  const importData = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) return setMessage({ tone: 'danger', text: 'Fichier trop volumineux (max 20 Mo).' });
    try {
      const res = await repo.importAll(JSON.parse(await file.text()));
      setMessage({ tone: 'info', text: `Import terminé : ${res.events} nouveaux événements (les doublons sont ignorés).` });
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Import impossible.' });
    }
  };

  return (
    <>
      <button className="btn ghost" onClick={onBack}>
        <ChevronLeft size={20} aria-hidden="true" /> Retour
      </button>
      <h1 style={{ marginTop: 12 }}>Réglages et données</h1>

      <ProfileCard repo={repo} onEdit={onEditProfile} />

      <BackgroundCard />

      <WinterCard repo={repo} />

      <LoadCard repo={repo} />

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Mes données</h2>
        <span className="badge ok" style={{ alignSelf: 'flex-start' }}>100 % sur cet appareil</span>
        {persisted === false && (
          <Notice tone="warn">
            Le navigateur peut effacer ces données : exporte souvent.
          </Notice>
        )}
        {persisted === true && <Notice>Stockage persistant accordé par le navigateur.</Notice>}
        <button className="btn primary block" onClick={exportData}>
          <Download size={18} aria-hidden="true" /> Exporter mes données (JSON)
        </button>
        <button className="btn block" onClick={() => fileRef.current?.click()}>
          <Upload size={18} aria-hidden="true" /> Importer un export
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importData(f);
            e.target.value = '';
          }}
        />
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </div>

      <div className="card">
        <h2>État réel des fonctions</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack">
          {FEATURES.map((f) => (
            <li key={f.name} className="spread" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{f.name}</div>
                {f.note && <div className="muted" style={{ fontSize: '0.9rem' }}>{f.note}</div>}
              </div>
              <span className={`badge ${f.status === 'testé' ? 'ok' : f.status === 'non implémenté' ? '' : 'warn'}`} style={{ flex: 'none' }}>
                {f.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}


const FIELD_LABEL: Record<string, string> = {
  main: 'objectif principal',
  secondary: 'objectifs secondaires',
  description: 'description',
  why: 'motivation',
  measure: 'critère de réussite',
  targetDate: 'date souhaitée',
  limits: 'limites',
};

function ProfileCard({ repo, onEdit }: { repo: Repository; onEdit: () => void }) {
  const [goals, setGoals] = useState<GoalVersion[]>([]);
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    loadGoals(repo).then(setGoals);
    loadOnboarding(repo).then((o) => setDone(!!o.completedAt));
  }, [repo]);

  const edit = async () => {
    const ob = await loadOnboarding(repo);
    // Une configuration terminée s'ouvre sur le récapitulatif ; sinon on reprend où on en était.
    await repo.setKv('onboarding', { ...ob, step: ob.completedAt ? STEPS.length : ob.step, updatedAt: Date.now() });
    onEdit();
  };

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Mon profil et mon objectif</h2>
      {done === false && <Notice tone="warn">Configuration non terminée.</Notice>}
      <button className="btn primary block" onClick={edit}>
        {done ? 'Modifier mon profil' : 'Reprendre la configuration'}
      </button>
      {goals.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Historique de l’objectif ({goals.length} version{goals.length > 1 ? 's' : ''})</summary>
          <ol style={{ margin: '8px 0 0', paddingLeft: 18 }} className="stack">
            {goals.map((g, i) => {
              const changes = goalChanges(goals[i - 1], g);
              return (
                <li key={g.version}>
                  <strong>v{g.version}</strong> · {new Date(g.at).toLocaleDateString('fr-BE')} · {g.reason}
                  <div className="muted" style={{ fontSize: '0.9rem' }}>
                    {g.main ? GOAL_LABELS[g.main] : 'sans objectif principal'}
                    {g.targetDate ? ` · pour le ${g.targetDate}` : ''}
                    {changes.length > 0 && ` · modifié : ${changes.map((c) => FIELD_LABEL[c] ?? c).join(', ')}`}
                  </div>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </div>
  );
}

function BackgroundCard() {
  const { images, setImage } = useBackgrounds();
  const [error, setError] = useState<string | null>(null);
  const slots: { slot: BgSlot; label: string }[] = [
    { slot: 'jour', label: 'Jour' },
    { slot: 'nuit', label: 'Nuit' },
  ];
  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Fond d’écran</h2>
      <span className="badge" style={{ alignSelf: 'flex-start' }}>Fond uni par défaut · 🔒 sur l’appareil</span>
      {slots.map(({ slot, label }) => (
        <div key={slot} className="spread">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <div
              className="thumb"
              style={{ width: 56, height: 56, background: images[slot] ? `center / cover url(${images[slot]})` : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {!images[slot] && '＋'}
            </div>
            <strong>{label}</strong>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Choisir
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  if (f.size > 20 * 1024 * 1024) return setError('Image trop lourde (max 20 Mo).');
                  try {
                    await setImage(slot, f);
                    setError(null);
                  } catch {
                    setError('Image illisible.');
                  }
                }}
              />
            </label>
            {images[slot] && (
              <button className="btn ghost" aria-label={`Retirer le fond ${slot}`} onClick={() => setImage(slot, null)}>
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

function WinterCard({ repo }: { repo: Repository }) {
  const { mode, setMode } = useWinterMode(repo);
  const options: { v: WinterMode; l: string }[] = [
    { v: 'auto', l: 'Auto (novembre)' },
    { v: 'on', l: 'Activé' },
    { v: 'off', l: 'Désactivé' },
  ];
  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Winter Arc</h2>
      <div className="chips" role="group" aria-label="Thème Winter Arc">
        {options.map((o) => (
          <button key={o.v} className="chip" aria-pressed={mode === o.v} onClick={() => setMode(o.v)}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Liste de poids éditable (pièces de lest ou kettlebells). */
function WeightsEditor({ label, values, onSave }: { label: string; values: number[]; onSave: (v: number[]) => void }) {
  const [draft, setDraft] = useState('');
  const kg = Number(draft.replace(',', '.'));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="eyebrow" style={{ margin: 0 }}>{label}</p>
      <div className="chips">
        {values.map((p, i) => (
          <button key={`${p}-${i}`} className="chip num" aria-label={`Retirer ${p} kg`} onClick={() => onSave(values.filter((_, j) => j !== i))}>
            {p.toLocaleString('fr-BE')} kg <X size={12} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input aria-label={`Ajouter (${label}) en kg`} placeholder="kg" type="text" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button
          className="btn"
          disabled={!(kg > 0 && kg <= 60)}
          onClick={() => {
            onSave([...values, kg].sort((a, b) => a - b));
            setDraft('');
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

/** Mon matériel de charge : lest (pièces combinables) et kettlebells (une à la fois). */
function LoadCard({ repo }: { repo: Repository }) {
  const [pieces, setPieces] = useState<number[] | null>(null);
  const [kbs, setKbs] = useState<number[] | null>(null);
  useEffect(() => {
    loadPieces(repo).then(setPieces);
    loadKettlebells(repo).then(setKbs);
  }, [repo]);
  if (!pieces || !kbs) return null;
  const loads = availableLoads(pieces).filter((l) => l > 0);
  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Mon matériel</h2>
      <WeightsEditor label="Ceinture de lest : pièces" values={pieces} onSave={async (v) => (await savePieces(repo, v), setPieces(v))} />
      <p className="muted num" style={{ margin: 0, fontSize: '0.85rem' }}>
        Lest possible : {loads.map((l) => l.toLocaleString('fr-BE')).join(' · ')} kg
      </p>
      <WeightsEditor label="Kettlebells" values={kbs} onSave={async (v) => (await saveKettlebells(repo, v), setKbs(v))} />
    </div>
  );
}
