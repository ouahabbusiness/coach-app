import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Car, ChevronLeft, ChevronRight, CloudLightning, Moon, Play, Plus } from 'lucide-react';
import { weekStart as mondayOf } from '../engine/challenge';
import { localDay } from '../engine/derive';
import {
  DAY_NAMES,
  consequencesOf,
  dateOf,
  fixedEventsFromAnswers,
  itemStatus,
  shiftWeek,
  spansOf,
  toMin,
  type FixedEvent,
  type ItemKind,
  type ItemStatus,
  type PlannedItem,
} from '../engine/planning';
import type { Repository, SessionSummaryRow } from '../storage/db';
import { Modal, Notice, OutcomeBadge, ProgramTabs } from './common';
import { loadOnboarding } from './profileStore';
import { deviceTimeZone, newId } from './support';
import { loadTemplates, type SessionTemplate } from './templates';
import { startSessionFromTemplate } from './actions';
import { DisruptionPanel } from './Disruption';
import { REASON_LABELS, type DisruptionReason } from '../engine/disruption';
import type { Route } from './App';

const KEY = 'planning.items';

export async function loadPlanning(repo: Repository): Promise<PlannedItem[]> {
  return (await repo.getKv<PlannedItem[]>(KEY)) ?? [];
}

const KIND_LABEL: Record<ItemKind, string> = { seance: 'Séance', course: 'Course', marche: 'Marche' };
const STATUS_TONE: Record<ItemStatus, string> = { prévu: '', réalisé: 'ok', adapté: 'ok', partiel: 'warn', annulé: '', suspendu: 'warn', 'non confirmé': '' };
const FIXED_ICON = { travail: Briefcase, trajet: Car, sommeil: Moon, autre: Briefcase };

function fmtDate(day: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('fr-BE', { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}

interface Draft {
  id?: string;
  kind: ItemKind;
  templateId?: string;
  day: number;
  start: string;
  durationMin: number;
  /** Raison du report quand il vient d'un imprévu. */
  reason?: DisruptionReason;
}

export function Planning({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const tz = deviceTimeZone();
  const today = localDay(Date.now(), tz);
  const [week, setWeek] = useState(() => mondayOf(today));
  const [items, setItems] = useState<PlannedItem[]>([]);
  const [fixed, setFixed] = useState<FixedEvent[] | null>(null);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [sessions, setSessions] = useState<SessionSummaryRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [disrupting, setDisrupting] = useState<PlannedItem | null>(null);

  useEffect(() => {
    loadPlanning(repo).then(setItems);
    loadTemplates(repo).then(setTemplates);
    repo.listSessions().then(setSessions);
    loadOnboarding(repo).then((o) => setFixed(fixedEventsFromAnswers(o.answers)));
  }, [repo]);

  const persist = async (list: PlannedItem[]) => {
    await repo.setKv(KEY, list);
    setItems(list);
  };

  const weekItems = items.filter((i) => i.weekStart === week);
  const sessionsByDate = useMemo(() => {
    const m = new Map<string, SessionSummaryRow[]>();
    for (const s of sessions) {
      const d = localDay(s.startedAt, tz);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [sessions, tz]);

  const planned = weekItems.filter((i) => i.kind !== 'marche').length;
  const realized = weekItems.filter((i) => {
    const st = itemStatus(i, dateOf(week, i.day), today, sessionsByDate.get(dateOf(week, i.day)) ?? []);
    return st === 'réalisé' || st === 'adapté' || st === 'partiel';
  }).length;

  const titleOf = (d: Draft) => (d.kind === 'seance' ? templates.find((t) => t.id === d.templateId)?.title ?? 'Séance' : KIND_LABEL[d.kind]);

  const confirmDraft = async () => {
    if (!draft) return;
    if (draft.id) {
      await persist(
        items.map((i) =>
          i.id === draft.id
            ? { ...i, day: draft.day, start: draft.start, durationMin: draft.durationMin, moves: [...i.moves, { at: Date.now(), fromDay: i.day, fromStart: i.start, reason: draft.reason }] }
            : i,
        ),
      );
    } else {
      await persist([
        ...items,
        { id: newId(), weekStart: week, day: draft.day, start: draft.start, durationMin: draft.durationMin, kind: draft.kind, templateId: draft.kind === 'seance' ? draft.templateId : undefined, title: titleOf(draft), moves: [] },
      ]);
    }
    setDraft(null);
  };

  const replaceItem = async (next: PlannedItem) => {
    await persist(items.map((i) => (i.id === next.id ? next : i)));
  };

  /** Lance la séance (version adaptée si un imprévu l'a modifiée) et la lie à l'élément par identifiant. */
  const startFromItem = async (i: PlannedItem, tpl: SessionTemplate) => {
    const source: SessionTemplate = i.adapted ? { ...tpl, title: `${tpl.title} (adaptée)`, lines: i.adapted.lines as SessionTemplate['lines'] } : tpl;
    const sessionId = await startSessionFromTemplate(repo, source);
    await replaceItem({ ...i, sessionId });
    go({ name: 'session', id: sessionId });
  };

  const consequences = draft ? consequencesOf(weekItems, { id: draft.id, day: draft.day, start: draft.start, durationMin: draft.durationMin, kind: draft.kind }, fixed ?? []) : [];
  const draftValid = !!draft && draft.durationMin > 0 && /^\d\d:\d\d$/.test(draft.start) && (draft.kind !== 'seance' || !!draft.templateId);

  return (
    <>
      <h1>Programme</h1>
      <ProgramTabs current="planning" go={go} />
      <div className="spread">
        <button className="round" aria-label="Semaine précédente" onClick={() => setWeek(shiftWeek(week, -1))}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>{week === mondayOf(today) ? 'Cette semaine' : 'Semaine'}</div>
          <strong>
            {fmtDate(week, { day: 'numeric', month: 'short' })} – {fmtDate(dateOf(week, 6), { day: 'numeric', month: 'short' })}
          </strong>
        </div>
        <button className="round" aria-label="Semaine suivante" onClick={() => setWeek(shiftWeek(week, 1))}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="grid2 num">
          <div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Séances et courses prévues</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600 }}>{planned}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Réalisées (enregistrées)</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600 }}>{realized}</div>
          </div>
        </div>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
          L’app ne remplit pas tes journées : tu places toi-même tes séances. Une course ou une marche non enregistrée reste « non confirmée ».
        </p>
      </div>

      {fixed && fixed.length === 0 && (
        <Notice tone="warn">
          Tes horaires de travail et de sommeil ne sont pas renseignés : aucun conflit ne peut être détecté.{' '}
          <button className="btn ghost" style={{ minHeight: 32, padding: '0 4px' }} onClick={() => go({ name: 'onboarding' })}>
            Compléter
          </button>
        </Notice>
      )}

      {DAY_NAMES.map((name, day) => {
        const date = dateOf(week, day);
        const dayFixed = (fixed ?? [])
          .flatMap((ev) => spansOf(ev).filter((s) => s.day === day && s.start > 0).map(() => ev))
          .sort((a, b) => toMin(a.start) - toMin(b.start));
        const dayItems = weekItems.filter((i) => i.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));
        const daySessions = sessionsByDate.get(date) ?? [];
        const unplanned = daySessions.filter((s) => s.outcome !== 'in_progress' && !dayItems.some((i) => (i.sessionId ? i.sessionId === s.id : i.title === s.title)));
        return (
          <section key={day} className="card" aria-label={`${name} ${fmtDate(date, { day: 'numeric', month: 'long' })}`} style={date === today ? { borderColor: 'var(--accent)', borderWidth: 2 } : undefined}>
            <div className="spread">
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                {name} {fmtDate(date, { day: 'numeric' })}
                {date === today && <span className="badge ok" style={{ marginLeft: 8 }}>Aujourd’hui</span>}
              </h2>
              <button className="btn ghost" onClick={() => setDraft({ kind: 'seance', templateId: templates[0]?.id, day, start: '18:00', durationMin: 45 })}>
                <Plus size={18} aria-hidden="true" /> Ajouter
              </button>
            </div>

            {dayFixed.length > 0 && (
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                {dayFixed.map((ev) => {
                  const Icon = FIXED_ICON[ev.kind];
                  return (
                    <span key={ev.id} className="badge" title="Événement fixe">
                      <Icon size={13} aria-hidden="true" /> {ev.label} {ev.start}–{ev.end}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="stack" style={{ marginTop: 10 }}>
              {dayItems.map((i) => {
                const st = itemStatus(i, date, today, daySessions);
                const tpl = templates.find((t) => t.id === i.templateId);
                return (
                  <div key={i.id} className="card soft" style={{ margin: 0, padding: 12 }}>
                    <div className="spread">
                      <div>
                        <div className="num" style={{ fontWeight: 600 }}>
                          {i.start} · {i.title}
                        </div>
                        <div className="muted" style={{ fontSize: '0.85rem' }}>
                          {KIND_LABEL[i.kind]} · {i.durationMin} min{i.adapted ? ` · version adaptée ≈ ${i.adapted.estimatedMin} min (estimation)` : ''}
                          {i.moves.length > 0 ? ` · déplacé ${i.moves.length}×` : ''}
                        </div>
                      </div>
                      <span className={`badge ${STATUS_TONE[st]}`}>{st}</span>
                    </div>
                    {i.adjustment && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 6 }}>
                        Imprévu : {REASON_LABELS[i.adjustment.reason]} → {i.adjustment.decision === 'adaptée' ? 'version adaptée' : i.adjustment.decision}
                        {i.adjustment.note ? ` (${i.adjustment.note})` : ''}
                        {i.adapted && i.adapted.removed.length > 0 ? ` · retiré : ${i.adapted.removed.join(' ; ')}` : ''}
                      </div>
                    )}
                    {i.moves.some((m) => m.reason) && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                        Reporté pour : {[...new Set(i.moves.filter((m) => m.reason).map((m) => REASON_LABELS[m.reason!]))].join(', ')}
                      </div>
                    )}
                    <div className="row" style={{ marginTop: 8, gap: 6 }}>
                      {date === today && st === 'prévu' && tpl && (
                        <button className="btn primary" onClick={() => startFromItem(i, tpl)}>
                          <Play size={16} aria-hidden="true" /> {i.adapted ? 'Commencer (adaptée)' : 'Commencer'}
                        </button>
                      )}
                      {st === 'prévu' && date >= today && (
                        <button className="btn" onClick={() => setDisrupting(i)}>
                          <CloudLightning size={16} aria-hidden="true" /> Imprévu
                        </button>
                      )}
                      {(st === 'annulé' || st === 'suspendu' || (st === 'prévu' && i.adapted)) && i.adjustment?.decision !== 'remplacée' && (
                        <button className="btn ghost" onClick={() => replaceItem({ ...i, adjustment: undefined, adapted: undefined })}>
                          Rétablir
                        </button>
                      )}
                      {st === 'prévu' && (
                        <button className="btn" onClick={() => setDraft({ id: i.id, kind: i.kind, templateId: i.templateId, day: i.day, start: i.start, durationMin: i.durationMin })}>
                          Déplacer
                        </button>
                      )}
                      {st !== 'réalisé' && st !== 'partiel' && (
                        <button
                          className="btn ghost"
                          onClick={() => {
                            if (window.confirm(`Retirer « ${i.title} » du planning ?`)) persist(items.filter((x) => x.id !== i.id));
                          }}
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {unplanned.map((s) => (
                <div key={s.id} className="spread card soft" style={{ margin: 0, padding: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.title}</div>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>Séance hors planning</div>
                  </div>
                  <OutcomeBadge outcome={s.outcome} />
                </div>
              ))}
              {dayItems.length === 0 && unplanned.length === 0 && <p className="muted" style={{ margin: 0 }}>Rien de prévu.</p>}
            </div>
          </section>
        );
      })}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Déplacer' : 'Ajouter au planning'}>
        {draft && (
          <div className="stack">
            {!draft.id && (
              <div className="chips" role="group" aria-label="Type">
                {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
                  <button key={k} className="chip" aria-pressed={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            )}
            {!draft.id && draft.kind === 'seance' && (
              <label className="field">
                Séance
                {templates.length === 0 ? (
                  <span className="hint">Crée d’abord une séance dans « Mes séances ».</span>
                ) : (
                  <select value={draft.templateId ?? ''} onChange={(e) => setDraft({ ...draft, templateId: e.target.value })}>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}
            <label className="field">
              Jour
              <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}>
                {DAY_NAMES.map((n, d) => (
                  <option key={d} value={d}>
                    {n} {fmtDate(dateOf(week, d), { day: 'numeric', month: 'short' })}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid2">
              <label className="field">
                Heure
                <input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </label>
              <label className="field">
                Durée prévue (min)
                <input type="number" inputMode="numeric" min={5} value={draft.durationMin} onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })} />
              </label>
            </div>
            <div>
              <strong>Conséquences</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {consequences.map((c) => (
                  <li key={c.text} style={c.tone === 'warn' ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
                    {c.tone === 'warn' ? 'Attention : ' : ''}
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="row">
              <button className="btn primary" disabled={!draftValid} onClick={confirmDraft}>
                {draft.id ? 'Confirmer le déplacement' : 'Ajouter'}
              </button>
              <button className="btn ghost" onClick={() => setDraft(null)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!disrupting} onClose={() => setDisrupting(null)} title="Déclarer un imprévu">
        {disrupting && (
          <DisruptionPanel
            item={disrupting}
            template={templates.find((t) => t.id === disrupting.templateId)}
            onCancel={() => setDisrupting(null)}
            onApply={async (next) => {
              await replaceItem(next);
              setDisrupting(null);
            }}
            onReschedule={(reason) => {
              const i = disrupting;
              setDisrupting(null);
              setDraft({ id: i.id, kind: i.kind, templateId: i.templateId, day: i.day, start: i.start, durationMin: i.durationMin, reason });
            }}
          />
        )}
      </Modal>
    </>
  );
}
