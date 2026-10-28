// Retour épaule et coudes : explicite, jamais déduit d'un silence.
// « Aucune gêne » répondu après la séance ET « rien » le lendemain = mouvement toléré ; sans réponse, il reste « tolérance inconnue ».

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { project } from '../engine/session';
import { isUpperLoaded, type JointFeedback } from '../engine/tolerance';
import type { SessionState } from '../engine/types';
import { localDay } from '../engine/derive';
import type { Repository } from '../storage/db';
import { Help } from './common';
import { loadComplement } from './profileComplement';

export const jointFeedbackKey = (sessionId: string) => `joint.feedback.${sessionId}`;

export async function loadFeedback(repo: Pick<Repository, 'getKv'>, sessionId: string): Promise<JointFeedback> {
  return (await repo.getKv<JointFeedback>(jointFeedbackKey(sessionId))) ?? {};
}

export async function saveFeedback(repo: Pick<Repository, 'getKv' | 'setKv'>, sessionId: string, patch: JointFeedback): Promise<JointFeedback> {
  const next = { ...(await loadFeedback(repo, sessionId)), ...patch };
  await repo.setKv(jointFeedbackKey(sessionId), next);
  return next;
}

const worked = (st: SessionState | null | undefined) => !!st && st.sets.some((s) => s.planned.role === 'work' && s.status === 'done' && isUpperLoaded(s.planned.variantId));

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="chip" aria-pressed={on} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {on && <Check size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Après la séance : épaule et coudes. Affiché seulement si une gêne est déclarée et si du travail du haut du corps a été fait. */
export function SessionJointFeedback({ repo, st }: { repo: Repository; st: SessionState }) {
  const [declared, setDeclared] = useState(false);
  const [fb, setFb] = useState<JointFeedback>({});
  useEffect(() => {
    (async () => {
      setDeclared(((await loadComplement(repo)).joints?.length ?? 0) > 0);
      setFb(await loadFeedback(repo, st.sessionId));
    })();
  }, [repo, st.sessionId]);
  if (!declared || !worked(st)) return null;
  return (
    <section className="ui-card stack" aria-label="Épaule et coudes après la séance">
      <p className="eyebrow" style={{ margin: 0 }}>Épaule · coudes après la séance</p>
      <div className="chips" role="group" aria-label="Gêne pendant la séance">
        {([['aucune', 'aucune gêne'], ['legere', 'gêne légère'], ['marquee', 'gêne marquée']] as const).map(([v, l]) => (
          <Chip key={v} on={fb.during === v} onClick={async () => setFb(await saveFeedback(repo, st.sessionId, { during: v, duringAt: Date.now() }))}>{l}</Chip>
        ))}
      </div>
      <Help>Réponse explicite : sans elle, un mouvement reste « tolérance inconnue », même sans douleur saisie. Le retour du lendemain complète.</Help>
    </section>
  );
}

/** Le lendemain d'une séance du haut du corps : retour sur l'épaule et les coudes. */
export function NextDayJointCheck({ repo, today, tz }: { repo: Repository; today: string; tz: string }) {
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    (async () => {
      try {
      if (((await loadComplement(repo)).joints?.length ?? 0) === 0) return setTarget(null);
      const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
      for (const r of (await repo.listSessions()).filter((x) => localDay(x.startedAt, tz) === yesterday && x.outcome !== 'in_progress')) {
        const st = project(await repo.sessionEvents(r.id));
        if (worked(st) && (await loadFeedback(repo, r.id)).next === undefined) return setTarget({ id: r.id, title: r.title });
      }
      setTarget(null);
      } catch {
        setTarget(null); // un retour manquant ne doit jamais bloquer l'écran du jour
      }
    })();
  }, [repo, today, tz]);
  if (!target) return null;
  return (
    <section className="ui-card stack" aria-label="Épaule et coudes, le lendemain">
      <p className="eyebrow" style={{ margin: 0 }}>Épaule · coudes, le lendemain de « {target.title} »</p>
      <div className="chips" role="group" aria-label="Gêne le lendemain">
        {([['rien', 'rien'], ['legere', 'gêne légère'], ['dure', 'elle dure']] as const).map(([v, l]) => (
          <Chip key={v} on={false} onClick={async () => { await saveFeedback(repo, target.id, { next: v, nextAt: Date.now() }); setTarget(null); }}>{l}</Chip>
        ))}
      </div>
      <Help>Sans réponse, rien n’est supposé : le mouvement reste « tolérance inconnue ».</Help>
    </section>
  );
}
