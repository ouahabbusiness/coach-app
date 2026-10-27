import { useEffect, useRef, type ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import type { SessionOutcome } from '../engine/types';
import type { Route } from './App';
import { OUTCOME_LABEL } from './support';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Fermeture déclenchée par le code (ex. menu → autre fenêtre) : ne pas la signaler comme une fermeture par l'utilisateur,
  // sinon l'événement « close » remet l'état à zéro après l'ouverture de la fenêtre suivante.
  const programmatic = useRef(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      programmatic.current = true;
      d.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (programmatic.current) {
          programmatic.current = false;
          return;
        }
        onClose();
      }}
      aria-labelledby="modal-title"
      // Toucher en dehors de la fenêtre (sur le fond sombre) la ferme.
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-btn" aria-label="Fermer" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode }) {
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : Info;
  return (
    <div className={`notice ${tone === 'info' ? '' : tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

const OUTCOME_TONE: Record<SessionOutcome, string> = {
  in_progress: '',
  completed: 'ok',
  partial: 'warn',
  stopped_for_safety: 'danger',
};

export function OutcomeBadge({ outcome }: { outcome: SessionOutcome }) {
  return <span className={`badge ${OUTCOME_TONE[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>;
}

/** Statut honnête d'une fonction : affiché partout où une fonction n'est pas réellement disponible. */
export function NotBuilt({ title, phase, children }: { title: string; phase: string; children?: ReactNode }) {
  return (
    <div className="card soft">
      <div className="spread">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="badge">Non implémenté</span>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>Prévu en {phase}. {children}</p>
    </div>
  );
}

/** Bascule entre la semaine planifiée et les modèles de séance (onglet Programme). */
export function ProgramTabs({ current, go }: { current: 'planning' | 'program'; go: (r: Route) => void }) {
  return (
    <div className="chips" role="group" aria-label="Vue du programme" style={{ marginBottom: 16 }}>
      <button className="chip" aria-pressed={current === 'planning'} onClick={() => go({ name: 'planning' })}>
        Semaine
      </button>
      <button className="chip" aria-pressed={current === 'program'} onClick={() => go({ name: 'program' })}>
        Mes séances
      </button>
    </div>
  );
}
