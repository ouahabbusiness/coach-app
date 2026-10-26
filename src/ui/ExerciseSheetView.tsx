// Fiche d'exercice : variante, consignes, effort attendu, repos, condition d'arrêt, alternative, progression.

import type { ExerciseSheet } from '../engine/exerciseSheet';

export function ExerciseSheetView({ s }: { s: ExerciseSheet }) {
  const row = (label: string, body: React.ReactNode) => (
    <div className="sheet-row">
      <p className="eyebrow" style={{ margin: 0 }}>{label}</p>
      {body}
    </div>
  );
  return (
    <div className="stack sheet">
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        {s.exercise} · variante {s.level}/{s.levels}
        {s.equipment.length ? ` · ${s.equipment.join(', ')}` : ''}
      </p>
      {row('Effort attendu', <p style={{ margin: 0 }}>{s.effort}</p>)}
      {row('Repos', <p style={{ margin: 0 }}>{s.rest}</p>)}
      {row(
        'Consignes',
        <ul className="mini-list">
          {s.cues.map((c) => (
            <li key={c}>• {c}</li>
          ))}
          {s.errors.map((c) => (
            <li key={c} className="muted">✕ {c}</li>
          ))}
        </ul>,
      )}
      {row(
        'Arrête la série si',
        <ul className="mini-list">
          {s.stop.map((c) => (
            <li key={c}>• {c}</li>
          ))}
        </ul>,
      )}
      {row(
        'Alternative',
        <ul className="mini-list">
          {s.alternatives.map((a) => (
            <li key={a.variantId}>
              <span>
                • {a.name} <span className="muted">— {a.why}</span>
              </span>
            </li>
          ))}
        </ul>,
      )}
      {row('Progression', <p style={{ margin: 0 }}>{s.progression}</p>)}
      <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>
        {s.reviewed ? 'Consignes relues par un professionnel.' : 'Consignes rédigées par l’assistant, non relues par un professionnel. Pas de média.'}
      </p>
    </div>
  );
}
