// Écran Compte & synchro, accessible depuis l'accueil (raccourci) et les Réglages.
// Affiche la version réellement chargée : c'est le repère pour savoir si l'app a été mise à jour.

import { ChevronLeft } from 'lucide-react';
import type { Repository } from '../storage/db';
import { AccountCard } from './AccountCard';

export function AccountScreen({ repo, onBack }: { repo: Repository; onBack: () => void }) {
  return (
    <>
      <button className="btn ghost" onClick={onBack}>
        <ChevronLeft size={20} aria-hidden="true" /> Retour
      </button>
      <h1 style={{ marginTop: 12 }}>Compte &amp; synchro</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Version installée : <b>{__APP_VERSION__}</b> · construite le {__APP_BUILT_AT__.slice(0, 16).replace('T', ' ')} UTC
      </p>
      <AccountCard repo={repo} />
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Si cette page affiche « Backend non configuré », l’app chargée n’est pas encore la version Supabase : recharge-la
        (deux fois si nécessaire, le service worker met la page en cache).
      </p>
    </>
  );
}
