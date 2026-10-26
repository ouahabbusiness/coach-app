// Contrôle avant séance : 5 questions, une décision expliquée (normale, adaptée, reporter, arrêt).

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { readiness, type PainState, type ReadinessDecision, type ReadinessInput } from '../engine/readiness';

export function ReadinessCheck({ onDone }: { onDone: (input: ReadinessInput, d: ReadinessDecision) => void }) {
  const [i, setI] = useState<ReadinessInput>({ sleepBad: false, fatigue: false, pain: 'aucune', ill: false, shortTime: false, redFlag: false });
  const yes = (k: 'sleepBad' | 'fatigue' | 'ill' | 'shortTime', label: string) => (
    <div className="rc-q">
      <span>{label}</span>
      <div className="seg2">
        <button aria-pressed={!i[k]} onClick={() => setI({ ...i, [k]: false })}>
          Non
        </button>
        <button aria-pressed={i[k]} onClick={() => setI({ ...i, [k]: true })}>
          Oui
        </button>
      </div>
    </div>
  );
  const d = readiness(i);
  return (
    <div className="rc" role="dialog" aria-modal="true" aria-label="Contrôle avant séance">
      <p className="cq-who">Contrôle avant séance</p>
      {yes('sleepBad', 'Nuit inhabituellement mauvaise ?')}
      {yes('fatigue', 'Fatigue inhabituelle ?')}
      <div className="rc-q">
        <span>Douleur nouvelle ou aggravée ?</span>
        <div className="seg3">
          {(['aucune', 'nouvelle', 'aggravée'] as PainState[]).map((p) => (
            <button key={p} aria-pressed={i.pain === p} onClick={() => setI({ ...i, pain: p })}>
              {p}
            </button>
          ))}
        </div>
      </div>
      {yes('ill', 'Malade ou symptômes ?')}
      {yes('shortTime', 'Peu de temps aujourd’hui ?')}
      <button className={`rc-red ${i.redFlag ? 'on' : ''}`} onClick={() => setI({ ...i, redFlag: !i.redFlag })}>
        <ShieldAlert size={14} aria-hidden="true" /> Douleur thoracique, malaise ou essoufflement anormal
      </button>
      <div className={`rc-decision d-${d.decision}`}>
        <strong>Séance {d.decision}</strong>
        <span>{d.reason}</span>
      </div>
      <button className="btn dark main block" onClick={() => onDone(i, d)}>
        {d.decision === 'normale' || d.decision === 'adaptée' ? 'C’est parti' : 'Compris'}
      </button>
    </div>
  );
}
