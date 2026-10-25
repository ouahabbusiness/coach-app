import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Download, Trash2, Upload } from 'lucide-react';
import { LEVEL_NAMES, Scene, type FighterLevel } from './Fighter';
import { CharacterArt, useCharacter } from './character';
import type { Repository } from '../storage/db';
import { Notice } from './common';

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
  { name: 'Personnage évolutif', status: 'non implémenté', note: 'Dessin et images perso disponibles ; paliers inactifs tant que les critères ne sont pas validés.' },
  { name: 'Onboarding et profil', status: 'non implémenté' },
  { name: 'Planning de la semaine', status: 'non implémenté' },
  { name: 'Nutrition', status: 'non implémenté' },
  { name: 'Course à pied', status: 'non implémenté' },
  { name: 'Apple Santé / Apple Watch', status: 'non implémenté', note: 'Impossible dans une app web ; prévu dans l’app native.' },
  { name: 'Coach IA', status: 'non implémenté' },
  { name: 'Notifications', status: 'non implémenté' },
];

export function Settings({ repo, onBack }: { repo: Repository; onBack: () => void }) {
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

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Mes données</h2>
        <p className="muted" style={{ margin: 0 }}>
          Tout est stocké uniquement sur cet appareil, dans le navigateur. Rien n’est envoyé à un serveur.
        </p>
        {persisted === false && (
          <Notice tone="warn">
            Le navigateur peut effacer ces données s’il manque de place ou si le site n’est pas utilisé. Exporte régulièrement.
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

      <CharacterSettings />

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

function CharacterSettings() {
  const { images, setImage } = useCharacter();
  const [error, setError] = useState<string | null>(null);
  const levels = Object.keys(LEVEL_NAMES).map(Number) as FighterLevel[];
  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Personnage</h2>
      <p className="muted" style={{ margin: 0 }}>
        Tu peux remplacer le personnage dessiné par tes propres images, une par palier. Elles restent sur cet appareil
        (et dans tes exports), ne sont jamais publiées ni ajoutées au code. Utilise des images que tu as le droit d’utiliser.
      </p>
      <Notice tone="warn">Les paliers ne sont pas encore actifs : les critères d’évolution restent à valider.</Notice>
      {levels.map((lvl) => (
        <div key={lvl} className="spread">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <div className="thumb" style={{ width: 56, height: 56 }}>
              <Scene kind="gym">
                <CharacterArt level={lvl} size={52} />
              </Scene>
            </div>
            <div>
              <strong>{LEVEL_NAMES[lvl]}</strong>
              <div className="muted" style={{ fontSize: '0.85rem' }}>{images[lvl] ? 'Image personnelle' : 'Personnage dessiné'}</div>
            </div>
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
                  if (f.size > 15 * 1024 * 1024) return setError('Image trop lourde (max 15 Mo).');
                  try {
                    await setImage(lvl, f);
                    setError(null);
                  } catch {
                    setError('Image illisible.');
                  }
                }}
              />
            </label>
            {images[lvl] && (
              <button className="btn ghost icon" aria-label={`Retirer l’image du palier ${LEVEL_NAMES[lvl]}`} onClick={() => setImage(lvl, null)}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ))}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
