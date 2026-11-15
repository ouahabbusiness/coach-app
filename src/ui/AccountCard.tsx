// Carte « Compte & synchro » dans Réglages. Connexion par lien e-mail, synchro manuelle assumée.

import { useCallback, useEffect, useState } from 'react';
import { LogOut, Mail, RefreshCw } from 'lucide-react';
import type { Repository } from '../storage/db';
import { backendConfigured } from '../backend/supabase';
import { syncAll, type SyncState } from '../backend/sync';
import { resetEverything } from '../backend/reset';
import { sendMagicLink, signInWithPassword, signOut, useSession } from './account';

type Message = { tone: 'info' | 'danger'; text: string } | null;

const fmtTime = (at: number) =>
  new Date(at).toLocaleString('fr-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function AccountCard({ repo }: { repo: Repository }) {
  const { session, ready, configured } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [last, setLast] = useState<SyncState | null>(null);

  useEffect(() => {
    repo.getKv<SyncState>('sync.last').then((v) => v && setLast(v));
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const authError =
      params.get('error_description') ??
      hash.get('error_description') ??
      params.get('error') ??
      hash.get('error');
    if (authError) setMessage({ tone: 'danger', text: decodeURIComponent(authError.replace(/\+/g, ' ')) });
  }, [repo]);

  const requestLink = useCallback(async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await sendMagicLink(email);
      setSent(true);
      setMessage({ tone: 'info', text: `Lien envoyé à ${email.trim()}. Ouvre-le sur cet appareil.` });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Envoi impossible.' });
    } finally {
      setBusy(false);
    }
  }, [busy, email]);

  const sync = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncAll(repo);
      setLast(result);
      setMessage({
        tone: 'info',
        text: `Synchronisé : ${result.pulledEvents} séance(s) reçue(s), ${result.pushedEvents} envoyée(s), ${result.pulledKv + result.pushedKv} réglage(s) échangé(s). Recharge l’app pour voir les séances importées.`,
      });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Synchronisation impossible.' });
    } finally {
      setBusy(false);
    }
  }, [busy, repo]);

  const loginPassword = useCallback(async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await signInWithPassword(email, password);
      setMessage({ tone: 'info', text: 'Connecté. Tu peux synchroniser.' });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Connexion impossible.' });
    } finally {
      setBusy(false);
    }
  }, [busy, email, password]);

  const resetAll = useCallback(async () => {
    const ok = window.confirm(
      'Effacer toutes tes données ? Séances, réglages, profil, poids et historique Ippo seront supprimés sur cet appareil et dans Supabase. Cette action est définitive.',
    );
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await resetEverything(repo);
      window.location.reload();
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Réinitialisation impossible.' });
      setBusy(false);
    }
  }, [repo]);

  const logout = useCallback(async () => {
    await signOut();
    setMessage({ tone: 'info', text: 'Déconnecté. Les données restent sur cet appareil.' });
  }, []);

  if (!configured) {
    return (
      <div className="card stack">
        <h2 style={{ margin: 0 }}>Compte &amp; synchro</h2>
        <p className="muted" style={{ margin: 0 }}>
          Backend non configuré. Ajoute <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans
          <code> .env.local</code>, puis reconstruis l’app.
        </p>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Compte &amp; synchro</h2>
        <span className={`chip ${session ? 'ok' : ''}`}>{session ? 'Connecté' : 'Local'}</span>
      </div>

      {!ready && <p className="muted" style={{ margin: 0 }}>Vérification de la session…</p>}

      {session ? (
        <>
          <p style={{ margin: 0 }}>
            <strong>{session.user.email}</strong>
          </p>
          <p className="muted" style={{ margin: 0, fontSize: '0.95rem' }}>
            {last ? `Dernière synchro : ${fmtTime(last.at)} · ${last.pulledEvents} reçue(s), ${last.pushedEvents} envoyée(s).` : 'Aucune synchro pour l’instant.'}
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => void sync()} disabled={busy}>
              <RefreshCw size={16} aria-hidden="true" /> {busy ? 'Synchro…' : 'Synchroniser'}
            </button>
            <button className="btn ghost" onClick={() => void logout()} disabled={busy}>
              <LogOut size={16} aria-hidden="true" /> Se déconnecter
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Connexion par lien e-mail, sans mot de passe. Tes données restent d’abord sur cet appareil : la synchro est
            manuelle pour l’instant.
          </p>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-label="Adresse e-mail"
              placeholder="ton@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void requestLink();
              }}
            />
            <button className="btn primary" onClick={() => void requestLink()} disabled={busy || !email.trim()}>
              <Mail size={16} aria-hidden="true" /> {busy ? 'Envoi…' : 'Recevoir le lien'}
            </button>
          </div>
          {sent && <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>Pense à vérifier les indésirables. Sur iPhone, ouvre le lien dans Safari (pas dans l’aperçu de l’app mail).</p>}
          <details className="stack" style={{ marginTop: 4 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>J’ai déjà un mot de passe</summary>
            <div className="row" style={{ flexWrap: 'nowrap', marginTop: 8 }}>
              <input
                type="password"
                autoComplete="current-password"
                aria-label="Mot de passe"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void loginPassword();
                }}
              />
              <button className="btn" onClick={() => void loginPassword()} disabled={busy || !email.trim() || !password}>
                Se connecter
              </button>
            </div>
          </details>
        </>
      )}

      {message && (
        <p className={message.tone === 'danger' ? 'notice danger' : 'notice'} role="status" style={{ margin: 0 }}>
          {message.text}
        </p>
      )}

      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Envoyés à ton projet Supabase : séances, réglages, profil, poids, nutrition, historique Ippo. La clé API Ippo
        n’est jamais synchronisée. L’e-mail sert uniquement à la connexion.
      </p>

      <details className="stack" style={{ marginTop: 4 }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>Tout recommencer</summary>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
          Efface séances, réglages, profil et historique Ippo — sur cet appareil{session ? ' et dans Supabase' : ''}. Définitif.
        </p>
        <button className="btn danger" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={() => void resetAll()} disabled={busy}>
          Repartir de zéro
        </button>
      </details>
    </div>
  );
}
