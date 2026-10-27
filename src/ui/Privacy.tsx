// Accords (avant activation), page d'information, export et suppression vérifiée.

import { useEffect, useState } from 'react';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { CONSENTS, FLOWS, INFO_FLOWS, LIMITS, isGranted, withConsent, type ConsentKey, type Consents, type Flow } from '../engine/privacy';
import type { Repository } from '../storage/db';
import { Modal, Notice } from './common';

export async function loadConsents(repo: Repository): Promise<Consents> {
  return (await repo.getKv<Consents>(CONSENTS)) ?? {};
}

export async function setConsent(repo: Repository, key: ConsentKey, granted: boolean): Promise<Consents> {
  const c = withConsent(await loadConsents(repo), key, granted);
  await repo.setKv(CONSENTS, c);
  return c;
}

export async function hasConsent(repo: Repository, key: ConsentKey): Promise<boolean> {
  return isGranted(await loadConsents(repo), key);
}

function FlowText({ f }: { f: Flow }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <p style={{ margin: 0, fontSize: '0.88rem' }}>
        <b>Quoi :</b> {f.data}
      </p>
      <p style={{ margin: 0, fontSize: '0.88rem' }}>
        <b>Où :</b> {f.destination}
      </p>
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        <b>Quand :</b> {f.when}
      </p>
    </div>
  );
}

/**
 * Accord demandé au moment où le traitement serait activé. `ensure()` résout true seulement après « J'accepte ».
 * Rien n'est envoyé ni lu avant.
 */
export function useConsent(repo: Repository, key: ConsentKey) {
  const [granted, setGranted] = useState<boolean | undefined>(undefined);
  const [pending, setPending] = useState<((ok: boolean) => void) | null>(null);
  useEffect(() => {
    hasConsent(repo, key).then(setGranted);
  }, [repo, key]);
  const ensure = async (): Promise<boolean> => {
    if (await hasConsent(repo, key)) return true;
    return new Promise<boolean>((res) => setPending(() => res));
  };
  const answer = async (ok: boolean) => {
    await setConsent(repo, key, ok);
    setGranted(ok);
    pending?.(ok);
    setPending(null);
  };
  const f = FLOWS[key];
  const modal = (
    <Modal open={!!pending} onClose={() => pending && answer(false)} title={f.title}>
      <div className="stack">
        <FlowText f={f} />
        <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Révocable à tout moment : Réglages → Mes données.</p>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn primary" onClick={() => answer(true)}>
            J’accepte
          </button>
          <button className="btn ghost" onClick={() => answer(false)}>
            Refuser
          </button>
        </div>
      </div>
    </Modal>
  );
  return { granted, ensure, modal };
}

/** Au premier lancement (ou si le texte change) : accord pour enregistrer les données d'entraînement et de santé sur l'appareil. */
export function PrivacyGate({ repo, children }: { repo: Repository; children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | undefined>(undefined);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    hasConsent(repo, 'health').then(setOk);
  }, [repo]);
  if (ok === undefined) return null;
  if (ok) return <>{children}</>;
  return (
    <main className="stack" style={{ padding: "24px 16px", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>Tes données</h1>
      <FlowText f={FLOWS.health} />
      <p style={{ margin: 0, fontSize: '0.88rem' }}>
        Ce qui peut quitter l’appareil (spots, carte, code-barres) est demandé séparément, au moment où tu l’utilises. Le GPS aussi.
      </p>
      {refused ? (
        <>
          <Notice tone="warn">Sans cet accord, l’app ne peut rien enregistrer. Tu peux exporter ou tout supprimer.</Notice>
          <DataActions repo={repo} />
          <button className="btn ghost" onClick={() => setRefused(false)}>
            Revenir
          </button>
        </>
      ) : (
        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn primary"
            onClick={async () => {
              await setConsent(repo, 'health', true);
              setOk(true);
            }}
          >
            J’accepte
          </button>
          <button className="btn ghost" onClick={() => setRefused(true)}>
            Refuser
          </button>
        </div>
      )}
    </main>
  );
}

function DataActions({ repo }: { repo: Repository }) {
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const exportData = async () => {
    const data = await repo.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coach-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg({ tone: 'info', text: `Export créé : ${data.events.length} événements, ${data.kv.length} réglages et saisies (photos incluses).` });
  };
  const wipe = async () => {
    const left = await repo.deleteAll();
    try {
      for (const k of (await caches?.keys?.()) ?? []) await caches.delete(k);
    } catch {
      /* pas de cache */
    }
    const empty = left.events === 0 && left.sessions === 0 && left.kv === 0;
    setMsg(empty ? { tone: 'info', text: 'Supprimé et vérifié : 0 séance, 0 événement, 0 réglage. Rechargement…' } : { tone: 'danger', text: `Suppression incomplète : ${JSON.stringify(left)}.` });
    if (empty) setTimeout(() => location.reload(), 1500);
  };
  return (
    <div className="stack">
      <button className="btn primary block" onClick={exportData}>
        <Download size={18} aria-hidden="true" /> Exporter tout (JSON)
      </button>
      <button className="btn block danger" onClick={() => setConfirm(true)}>
        <Trash2 size={18} aria-hidden="true" /> Tout supprimer de cet appareil
      </button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Tout supprimer ?">
        <div className="stack">
          <p style={{ margin: 0 }}>Séances, poids, photos, programme, réglages et accords : tout est effacé de cet appareil. Irréversible sans export.</p>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>Tape SUPPRIMER</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" />
          </label>
          <button className="btn danger" disabled={typed.trim() !== 'SUPPRIMER'} onClick={wipe}>
            Supprimer définitivement
          </button>
        </div>
      </Modal>
    </div>
  );
}

/** Réglages → Mes données : où vont les données, accords révocables, export, suppression. */
export function PrivacyCard({ repo }: { repo: Repository }) {
  const [c, setC] = useState<Consents>({});
  useEffect(() => {
    loadConsents(repo).then(setC);
  }, [repo]);
  const toggle = async (k: ConsentKey) => setC(await setConsent(repo, k, !isGranted(c, k)));
  return (
    <div className="card stack" aria-label="Où vont mes données">
      <h2 style={{ margin: 0 }}>
        <ShieldCheck size={18} aria-hidden="true" /> Où vont mes données
      </h2>
      <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Pas de compte, pas de serveur à nous, pas de publicité, pas de mesure d’audience, pas d’IA externe.</p>
      {(Object.keys(FLOWS) as ConsentKey[]).map((k) => (
        <details key={k} className="privacy-flow">
          <summary>
            <span>{FLOWS[k].title}</span>
            <span className={`badge ${isGranted(c, k) ? 'ok' : ''}`}>{isGranted(c, k) ? 'accepté' : c[k] ? 'refusé' : 'pas encore demandé'}</span>
          </summary>
          <FlowText f={FLOWS[k]} />
          {c[k] && <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>Réponse du {c[k]!.at.slice(0, 10)}.</p>}
          {k === 'health' && <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Retirer cet accord = tout supprimer (bouton ci-dessous).</p>}
          {k !== 'health' && (
            <button className="btn sm" onClick={() => toggle(k)}>
              {isGranted(c, k) ? 'Retirer mon accord' : 'Accepter'}
            </button>
          )}
        </details>
      ))}
      {INFO_FLOWS.map((f) => (
        <details key={f.key} className="privacy-flow">
          <summary>
            <span>{f.title}</span>
            <span className="badge">info</span>
          </summary>
          <FlowText f={f} />
        </details>
      ))}
      {LIMITS.map((l) => (
        <details key={l.title} className="privacy-flow">
          <summary>
            <span>{l.title}</span>
            <span className="badge">limites</span>
          </summary>
          <ul className="mini-list">
            {l.items.map((i) => (
              <li key={i}>• {i}</li>
            ))}
          </ul>
        </details>
      ))}
      <DataActions repo={repo} />
    </div>
  );
}
