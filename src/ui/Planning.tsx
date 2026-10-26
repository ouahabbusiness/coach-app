import { useEffect, useMemo, useState } from 'react';
import { Briefcase, CalendarDays, CalendarX, ChevronLeft, ChevronRight, CircleCheck, Clock, CloudLightning, Moon, MoreHorizontal, Play, Plus, RotateCw, Timer, Zap } from 'lucide-react';
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
import { busy, replanDay, ONE_OFF_LABELS, type Move, type OneOff, type OneOffKind } from '../engine/availability';
import { loadAllFixed, loadOneOffs, saveOneOffs } from './agenda';
import { REASON_LABELS, type DisruptionReason } from '../engine/disruption';
import type { Strictness } from '../engine/programBuilder';
import type { Route } from './App';

const KEY = 'planning.items';

export async function loadPlanning(repo: Repository): Promise<PlannedItem[]> {
  return (await repo.getKv<PlannedItem[]>(KEY)) ?? [];
}

/** Lance la séance prévue (version adaptée si un imprévu l'a modifiée) et la lie à l'élément par identifiant. */
export async function startPlanned(repo: Repository, item: PlannedItem, tpl: SessionTemplate): Promise<string> {
  const source: SessionTemplate = item.adapted ? { ...tpl, title: `${tpl.title} (adaptée)`, lines: item.adapted.lines as SessionTemplate['lines'] } : tpl;
  const sessionId = await startSessionFromTemplate(repo, source);
  const all = await loadPlanning(repo);
  await repo.setKv(KEY, all.map((x) => (x.id === item.id ? { ...x, sessionId } : x)));
  return sessionId;
}

const KIND_LABEL: Record<ItemKind, string> = { seance: 'Séance', course: 'Course', marche: 'Marche' };

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
  const [oneOffs, setOneOffs] = useState<OneOff[]>([]);
  const [busyDraft, setBusyDraft] = useState<OneOff | null>(null);
  const [moved, setMoved] = useState<Move[]>([]);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [sessions, setSessions] = useState<SessionSummaryRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [disrupting, setDisrupting] = useState<PlannedItem | null>(null);
  const [menu, setMenu] = useState<PlannedItem | null>(null);
  const [program, setProgram] = useState<{ id: string; strictness?: Strictness } | null>(null);

  useEffect(() => {
    loadPlanning(repo).then(setItems);
    loadTemplates(repo).then(setTemplates);
    repo.listSessions().then(setSessions);
    loadAllFixed(repo).then(setFixed);
    loadOneOffs(repo).then(setOneOffs);
    repo.getKv<{ id: string; answers: { strictness?: Strictness } }>('program.current').then((p) => p && setProgram({ id: p.id, strictness: p.answers.strictness }));
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

  const addOneOff = async (o: OneOff) => {
    const list = [...oneOffs.filter((x) => x.id !== o.id), o];
    await saveOneOffs(repo, list);
    setOneOffs(list);
    const r = replanDay(items, o.date, fixed ?? [], list, Date.now());
    if (r.moves.length) await persist(r.items);
    setMoved(r.moves);
    setBusyDraft(null);
  };

  const removeOneOff = async (id: string) => {
    const list = oneOffs.filter((x) => x.id !== id);
    await saveOneOffs(repo, list);
    setOneOffs(list);
  };

  const replaceItem = async (next: PlannedItem) => {
    await persist(items.map((i) => (i.id === next.id ? next : i)));
  };

  const startFromItem = async (i: PlannedItem, tpl: SessionTemplate) => {
    go({ name: 'session', id: await startPlanned(repo, i, tpl) });
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

      <div className="week-sum">
        <span className="pill num"><CalendarDays size={12} aria-hidden="true" /> {planned} prévues</span>
        <span className="pill num"><CircleCheck size={12} aria-hidden="true" /> {realized} faites</span>
        <button className="pill" onClick={() => setBusyDraft({ id: newId(), date: today >= week && today <= dateOf(week, 6) ? today : week, start: '19:00', end: '22:00', kind: 'soiree', label: ONE_OFF_LABELS.soiree })}>
          <CalendarX size={12} aria-hidden="true" /> Indispo
        </button>
        <button className="pill" onClick={() => go({ name: 'agenda' })}>
          <Clock size={12} aria-hidden="true" /> Ma semaine
        </button>
        {fixed && fixed.length === 0 && (
          <button className="pill" onClick={() => go({ name: 'onboarding' })}>
            <Clock size={12} aria-hidden="true" /> Horaires ?
          </button>
        )}
      </div>

      {moved.length > 0 && (
        <div className="moved" role="status">
          {moved.map((m) => (
            <p key={m.itemId}>
              <RotateCw size={12} aria-hidden="true" /> {m.title} : {m.from} → {m.to ?? 'aucun créneau libre ce jour'} <span className="muted">({m.because})</span>
            </p>
          ))}
          <button className="btn ghost sm" onClick={() => setMoved([])}>
            OK
          </button>
        </div>
      )}

      {DAY_NAMES.map((name, day) => {
        const date = dateOf(week, day);
        const work = (fixed ?? []).find((ev) => ev.kind === 'travail' && ev.days.includes(day));
        const sleep = (fixed ?? []).find((ev) => ev.kind === 'sommeil');
        const dayItems = weekItems.filter((i) => i.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));
        const daySessions = sessionsByDate.get(date) ?? [];
        const unplanned = daySessions.filter((s) => s.outcome !== 'in_progress' && !dayItems.some((i) => (i.sessionId ? i.sessionId === s.id : i.title === s.title)));
        const isToday = date === today;
        return (
          <section key={day} className={`day ${isToday ? 'today' : ''}`} aria-label={`${name} ${fmtDate(date, { day: 'numeric', month: 'long' })}`}>
            <div className="day-head">
              <div className="day-date">
                <span className="day-name">{name.slice(0, 3)}</span>
                <span className="day-num num">{fmtDate(date, { day: 'numeric' })}</span>
              </div>
              <div className="day-meta">
                {isToday && <span className="pill accent">Aujourd’hui</span>}
                {work && (
                  <span className="meta-ico num" title="Travail">
                    <Briefcase size={12} aria-hidden="true" /> {work.start.slice(0, 2)}–{work.end.slice(0, 2)}
                  </span>
                )}
                {sleep && (
                  <span className="meta-ico num" title="Coucher">
                    <Moon size={12} aria-hidden="true" /> {sleep.start}
                  </span>
                )}
              </div>
              <button className="icon-btn" aria-label={`Ajouter le ${name}`} onClick={() => setDraft({ kind: 'seance', templateId: templates[0]?.id, day, start: '18:00', durationMin: 45 })}>
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>

            <GapBar spans={busy(date, day, fixed ?? [], oneOffs)} items={dayItems} />
            {oneOffs.filter((o) => o.date === date).map((o) => (
              <button key={o.id} className="busy-chip" onClick={() => window.confirm(`Retirer « ${o.label} » ?`) && removeOneOff(o.id)}>
                <CalendarX size={12} aria-hidden="true" /> {o.start}–{o.end} · {o.label}
              </button>
            ))}
            {(dayItems.length > 0 || unplanned.length > 0) && (
              <ul className="slots">
                {dayItems.map((i) => {
                  const st = itemStatus(i, date, today, daySessions);
                  const tpl = templates.find((t) => t.id === i.templateId);
                  return (
                    <li key={i.id} className={`slot st-${st.replace(' ', '-')}`}>
                      <span className="slot-time num">{i.start}</span>
                      <span className="slot-title">
                        {i.title}
                        {i.adapted && <Zap className="slot-flag" size={13} aria-label="Version adaptée" />}
                        {i.moves.length > 0 && <RotateCw className="slot-flag" size={13} aria-label="Déplacé" />}
                        {i.detail && <small className="slot-detail">{i.detail}</small>}
                      </span>
                      {st !== 'prévu' && <span className="slot-status">{st}</span>}
                      {isToday && st === 'prévu' && tpl && (
                        <button className="icon-btn primary" aria-label={`Commencer ${i.title}`} onClick={() => startFromItem(i, tpl)}>
                          <Play size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button className="icon-btn ghost" aria-label={`Options pour ${i.title}`} onClick={() => setMenu(i)}>
                        <MoreHorizontal size={16} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
                {unplanned.map((s) => (
                  <li key={s.id} className="slot">
                    <span className="slot-time num">—</span>
                    <span className="slot-title">{s.title}</span>
                    <OutcomeBadge outcome={s.outcome} />
                  </li>
                ))}
              </ul>
            )}
            {dayItems.length === 0 && unplanned.length === 0 && <span className="day-free">Libre</span>}
          </section>
        );
      })}

      <Modal open={!!busyDraft} onClose={() => setBusyDraft(null)} title="Indisponible">
        {busyDraft && (
          <div className="stack">
            <div className="chips" role="group" aria-label="Type">
              {(Object.keys(ONE_OFF_LABELS) as OneOffKind[]).map((k) => (
                <button key={k} className="chip" aria-pressed={busyDraft.kind === k} onClick={() => setBusyDraft({ ...busyDraft, kind: k, label: ONE_OFF_LABELS[k] })}>
                  {ONE_OFF_LABELS[k]}
                </button>
              ))}
            </div>
            <label className="field">
              Libellé
              <input value={busyDraft.label} onChange={(e) => setBusyDraft({ ...busyDraft, label: e.target.value })} />
            </label>
            <label className="field">
              Jour
              <input type="date" value={busyDraft.date} min={today} onChange={(e) => setBusyDraft({ ...busyDraft, date: e.target.value })} />
            </label>
            <div className="grid2">
              <label className="field">
                De
                <input type="time" value={busyDraft.start} onChange={(e) => setBusyDraft({ ...busyDraft, start: e.target.value })} />
              </label>
              <label className="field">
                À
                <input type="time" value={busyDraft.end} onChange={(e) => setBusyDraft({ ...busyDraft, end: e.target.value })} />
              </label>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Ce qui tombe dessus est déplacé au créneau libre le plus proche, le même jour.</p>
            <button className="btn primary block" disabled={!busyDraft.label.trim() || !busyDraft.date} onClick={() => addOneOff(busyDraft)}>
              Enregistrer et replacer
            </button>
          </div>
        )}
      </Modal>

      <Modal open={!!menu} onClose={() => setMenu(null)} title={menu?.title ?? ''}>
        {menu &&
          (() => {
            const date = dateOf(week, menu.day);
            const st = itemStatus(menu, date, today, sessionsByDate.get(date) ?? []);
            const tpl = templates.find((t) => t.id === menu.templateId);
            const close = () => setMenu(null);
            return (
              <div className="stack">
                <div className="row" style={{ gap: 6 }}>
                  <span className="pill num"><Clock size={12} aria-hidden="true" /> {menu.start}</span>
                  <span className="pill num"><Timer size={12} aria-hidden="true" /> {menu.adapted ? `≈ ${menu.adapted.estimatedMin}` : menu.durationMin} min</span>
                  <span className="pill">{st}</span>
                </div>
                {menu.adjustment && (
                  <ul className="mini-list">
                    <li><Zap size={12} aria-hidden="true" /> {REASON_LABELS[menu.adjustment.reason]} → {menu.adjustment.decision === 'adaptée' ? 'version adaptée' : menu.adjustment.decision}</li>
                    {menu.adapted?.removed.map((r) => <li key={r}>− {r}</li>)}
                  </ul>
                )}
                {menu.moves.some((m) => m.reason) && (
                  <ul className="mini-list">
                    <li><RotateCw size={12} aria-hidden="true" /> Reporté : {[...new Set(menu.moves.filter((m) => m.reason).map((m) => REASON_LABELS[m.reason!]))].join(', ')}</li>
                  </ul>
                )}
                {date === today && st === 'prévu' && tpl && (
                  <button className="btn primary block" onClick={() => { close(); startFromItem(menu, tpl); }}>
                    <Play size={16} aria-hidden="true" /> Commencer
                  </button>
                )}
                {st === 'prévu' && date >= today && (
                  <button className="btn block" onClick={() => { close(); setDisrupting(menu); }}>
                    <CloudLightning size={16} aria-hidden="true" /> Imprévu
                  </button>
                )}
                {st === 'prévu' && (
                  <button className="btn block" onClick={() => { close(); setDraft({ id: menu.id, kind: menu.kind, templateId: menu.templateId, day: menu.day, start: menu.start, durationMin: menu.durationMin }); }}>
                    Déplacer
                  </button>
                )}
                {(st === 'annulé' || st === 'suspendu' || (st === 'prévu' && menu.adapted)) && menu.adjustment?.decision !== 'remplacée' && (
                  <button className="btn block" onClick={() => { replaceItem({ ...menu, adjustment: undefined, adapted: undefined }); close(); }}>
                    Rétablir
                  </button>
                )}
                {st !== 'réalisé' && st !== 'partiel' && st !== 'adapté' && (
                  <button
                    className="btn ghost block"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => {
                      if (window.confirm(`Retirer « ${menu.title} » ?`)) {
                        persist(items.filter((x) => x.id !== menu.id));
                        close();
                      }
                    }}
                  >
                    Retirer
                  </button>
                )}
              </div>
            );
          })()}
      </Modal>

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
            strictness={program && disrupting.programId === program.id ? program.strictness : undefined}
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

/** Journée de 06:00 à 23:00 : occupé (gris), séances/courses (accent), trous libres (blanc) avec leur durée. */
export function GapBar({ spans, items }: { spans: [number, number][]; items: PlannedItem[] }) {
  const from = 360;
  const to = 1380;
  const span = to - from;
  const clip = ([s, e]: [number, number]): [number, number] | null => (e <= from || s >= to ? null : [Math.max(s, from), Math.min(e, to)]);
  const busyC = spans.map(clip).filter((x): x is [number, number] => !!x).sort((a, b) => a[0] - b[0]);
  const itemsC = items.map((i) => clip([toMin(i.start), toMin(i.start) + i.durationMin])).filter((x): x is [number, number] => !!x);
  // Trous : complément des occupations (≥ 30 min).
  const merged: [number, number][] = [];
  for (const b of [...busyC, ...itemsC].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else merged.push([...b]);
  }
  const gaps: [number, number][] = [];
  let cur = from;
  for (const [s, e] of merged) {
    if (s - cur >= 30) gaps.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (to - cur >= 30) gaps.push([cur, to]);
  const free = gaps.reduce((t, [s, e]) => t + e - s, 0);
  const pct = (m: number) => `${((m - from) / span) * 100}%`;
  const w = ([s, e]: [number, number]) => `${((e - s) / span) * 100}%`;
  const fmtH = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
  return (
    <div className="gapbar-wrap" aria-label={`Temps libre : ${fmtH(free)}`}>
      <div className="gapbar" aria-hidden="true">
        {busyC.map((b, i) => (
          <span key={`b${i}`} className="gb-busy" style={{ left: pct(b[0]), width: w(b) }} />
        ))}
        {itemsC.map((b, i) => (
          <span key={`i${i}`} className="gb-item" style={{ left: pct(b[0]), width: w(b) }} />
        ))}
      </div>
      <div className="gapbar-legend num">
        <span>6 h</span>
        <span className="gb-free-txt">libre {fmtH(free)}</span>
        <span>23 h</span>
      </div>
    </div>
  );
}
