import { useEffect, useRef, type ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { SessionOutcome } from '../engine/types';
import { OUTCOME_LABEL } from './support';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="modal-title">
      <h2 id="modal-title">{title}</h2>
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
