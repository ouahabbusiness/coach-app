import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Car, ChevronLeft, ChevronRight, Moon, Play, Plus } from 'lucide-react';
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
import type { Route } from './App';

const KEY = 'planning.items';

export async function loadPlanning(repo: Repository): Promise<PlannedItem[]> {
  return (await repo.getKv<PlannedItem[]>(KEY)) ?? [];
}

const KIND_LABEL: Record<ItemKind, string> = { seance: 'Séance', course: 'Course', marche: 'Marche' };
const STATUS_TONE: Record<ItemStatus, string> = { prévu: '', réalisé: 'ok', partiel: 'warn', 'non confirmé': '' };
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
    return st === 'réalisé' || st === 'partiel';
  }).length;

  const titleOf = (d: Draft) => (d.kind === 'seance' ? templates.find((t) => t.id === d.templateId)?.title ?? 'Séance' : KIND_LABEL[d.kind]);

  const confirmDraft = async () => {
    if (!draft) return;
    if (draft.id) {
      await persist(
        items.map((i) =>
          i.id === draft.id
            ? { ...i, day: draft.day, start: draft.start, durationMin: draft.durationMin, moves: [...i.moves, { at: Date.now(), fromDay: i.day, fromStart: i.start }] }
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
        const unplanned = daySessions.filter((s) => s.outcome !== 'in_progress' && !dayItems.some((i) => i.title === s.title));
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
                          {KIND_LABEL[i.kind]} · {i.durationMin} min{i.moves.length > 0 ? ` · déplacé ${i.moves.length}×` : ''}
                        </div>
                      </div>
                      <span className={`badge ${STATUS_TONE[st]}`}>{st}</span>
                    </div>
                    <div className="row" style={{ marginTop: 8, gap: 6 }}>
                      {date === today && st === 'prévu' && tpl && (
                        <button className="btn primary" onClick={async () => go({ name: 'session', id: await startSessionFromTemplate(repo, tpl) })}>
                          <Play size={16} aria-hidden="true" /> Commencer
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
    </>
  );
}
