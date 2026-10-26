import { useMemo, useState } from 'react';
import { EXERCISES, findVariant } from '../catalog/exercises';
import {
  REASON_LABELS,
  disruptionOptions,
  estimateMinutes,
  keepFeasible,
  lighten,
  reasonNotice,
  shorten,
  type Adapted,
  type DisruptionReason,
  type OptionId,
} from '../engine/disruption';
import type { PlannedItem } from '../engine/planning';
import { Notice } from './common';
import type { SessionTemplate, TemplateLine } from './templates';

const nameOf = (variantId: string) => findVariant(variantId)?.variant.name ?? variantId;
const equipmentOf = (variantId: string) => findVariant(variantId)?.variant.equipment ?? [];
const ALL_EQUIPMENT = [...new Set(EXERCISES.flatMap((e) => e.variants.flatMap((v) => v.equipment)))];

function Preview({ adapted }: { adapted: Adapted<TemplateLine> }) {
  return (
    <div className="card soft" style={{ margin: 0 }}>
      <strong>Version adaptée</strong>
      {adapted.lines.length === 0 ? (
        <p style={{ margin: '6px 0 0', color: 'var(--warn)', fontWeight: 600 }}>Aucun exercice ne reste : reporte ou annule plutôt.</p>
      ) : (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {adapted.lines.map((l, i) => (
            <li key={i}>
              {nameOf(l.variantId)} — {l.sets} × {l.kind === 'reps' ? `${l.targetReps ?? '?'} rép.` : `${l.targetSeconds ?? '?'} s`}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.88rem' }}>
        ≈ {adapted.estimatedMin} min (estimation : 45 s par série à répétitions + repos prévus).
      </p>
      {adapted.removed.length > 0 && (
        <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.88rem' }}>
          Retiré : {adapted.removed.join(' ; ')}.
        </p>
      )}
    </div>
  );
}

/**
 * Déclarer un imprévu sur un élément prévu : raison → options → aperçu → confirmation.
 * Rien n'est appliqué sans confirmation, et la raison est conservée.
 */
export function DisruptionPanel({
  item,
  template,
  onCancel,
  onApply,
  onReschedule,
}: {
  item: PlannedItem;
  template?: SessionTemplate;
  onCancel: () => void;
  onApply: (next: PlannedItem) => void;
  onReschedule: (reason: DisruptionReason) => void;
}) {
  const [reason, setReason] = useState<DisruptionReason | null>(null);
  const [option, setOption] = useState<OptionId | null>(null);
  const baseLines = template?.lines ?? [];
  const fullMin = estimateMinutes(baseLines);
  const [minutes, setMinutes] = useState(() => Math.max(5, Math.round(fullMin / 2)));
  const [onSite, setOnSite] = useState<string[]>([]);
  const isWorkout = item.kind === 'seance' && !!template;

  const options = reason ? disruptionOptions(reason).filter((o) => isWorkout || !['raccourcir', 'alleger', 'sans_materiel'].includes(o.id)) : [];
  const neededEquipment = [...new Set(baseLines.flatMap((l) => equipmentOf(l.variantId)))].filter((e) => ALL_EQUIPMENT.includes(e));

  const adapted = useMemo((): Adapted<TemplateLine> | null => {
    if (!isWorkout) return null;
    if (option === 'raccourcir') return shorten(baseLines, minutes, nameOf);
    if (option === 'alleger') return lighten(baseLines, nameOf);
    if (option === 'sans_materiel') return keepFeasible(baseLines, equipmentOf, onSite, nameOf);
    return null;
  }, [option, minutes, onSite, baseLines, isWorkout]);

  const apply = () => {
    if (!reason || !option) return;
    const at = Date.now();
    if (option === 'garder') return onCancel();
    if (option === 'reporter') return onReschedule(reason);
    if (option === 'annuler') {
      const decision = reason === 'maladie' || reason === 'douleur' ? 'suspendue' : 'annulée';
      return onApply({ ...item, adjustment: { reason, decision, at } });
    }
    if (option === 'remplacer_marche') {
      return onApply({ ...item, kind: 'marche', title: 'Marche', templateId: undefined, adapted: undefined, adjustment: { reason, decision: 'remplacée', at, note: `remplace « ${item.title} »` } });
    }
    if (adapted && adapted.lines.length > 0) {
      onApply({
        ...item,
        adapted: { lines: adapted.lines, estimatedMin: adapted.estimatedMin, removed: adapted.removed },
        adjustment: { reason, decision: 'adaptée', at },
      });
    }
  };

  const notice = reason ? reasonNotice(reason) : undefined;
  const canApply = !!reason && !!option && (!adapted || adapted.lines.length > 0);

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        {item.title} · {item.start} · {item.durationMin} min prévues
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 6 }}>Que se passe-t-il ?</legend>
        <div className="chips">
          {(Object.keys(REASON_LABELS) as DisruptionReason[]).map((r) => (
            <button
              key={r}
              className="chip"
              aria-pressed={reason === r}
              onClick={() => {
                setReason(r);
                setOption(null);
              }}
            >
              {REASON_LABELS[r]}
            </button>
          ))}
        </div>
      </fieldset>

      {notice && <Notice tone={reason === 'maladie' || reason === 'douleur' ? 'warn' : 'info'}>{notice}</Notice>}

      {reason && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>Que veux-tu faire ?</legend>
          <div className="stack" style={{ gap: 8 }}>
            {options.map((o) => (
              <button
                key={o.id}
                className="btn block"
                aria-pressed={option === o.id}
                onClick={() => setOption(o.id)}
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  height: 'auto',
                  padding: '10px 16px',
                  borderRadius: 16,
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  borderColor: option === o.id ? 'var(--accent)' : undefined,
                  borderWidth: option === o.id ? 2 : 1,
                }}
              >
                <span>{o.label}</span>
                <span className="muted" style={{ fontWeight: 400, fontSize: '0.85rem' }}>{o.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {option === 'raccourcir' && (
        <label className="field">
          Temps disponible (min)
          <span className="hint">Séance complète estimée à {fullMin} min.</span>
          <input type="number" inputMode="numeric" min={5} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      )}
      {option === 'sans_materiel' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 500, marginBottom: 6 }}>Coche ce que tu as sur place</legend>
          {neededEquipment.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Cette séance ne demande aucun matériel.</p>
          ) : (
            <div className="chips">
              {neededEquipment.map((e) => (
                <button key={e} className="chip" aria-pressed={onSite.includes(e)} onClick={() => setOnSite(onSite.includes(e) ? onSite.filter((x) => x !== e) : [...onSite, e])}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      )}
      {adapted && <Preview adapted={adapted} />}

      <div className="row">
        <button className="btn primary" disabled={!canApply} onClick={apply}>
          {option === 'reporter' ? 'Choisir le nouveau créneau' : 'Confirmer'}
        </button>
        <button className="btn ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}
