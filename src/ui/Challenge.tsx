import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  NOVEMBER_2026,
  dayRange,
  habitStatus,
  summarizeWeeks,
  weekStart,
  type DayEntry,
  type Entries,
  type HabitStatus,
} from '../engine/challenge';
import { localDay } from '../engine/derive';
import type { Repository } from '../storage/db';
import { Notice } from './common';
import { deviceTimeZone } from './support';

const DEF = NOVEMBER_2026;
const KEY = `challenge.${DEF.id}`;

const STATUS_LABEL: Record<HabitStatus, string> = {
  done: 'Fait',
  not_done: 'Pas fait',
  unknown: 'Non renseigné',
  excused: 'Excusé',
};
const STATUS_TONE: Record<HabitStatus, string> = { done: 'ok', not_done: 'warn', unknown: '', excused: '' };

export function useChallengeEntries(repo: Repository) {
  const [entries, setEntries] = useState<Entries>({});
  useEffect(() => {
    repo.getKv<Entries>(KEY).then((e) => e && setEntries(e));
  }, [repo]);
  const update = async (day: string, patch: (e: DayEntry) => DayEntry) => {
    const current = entries[day] ?? { values: {}, updatedAt: 0 };
    const next = { ...entries, [day]: { ...patch(current), updatedAt: Date.now() } };
    await repo.setKv(KEY, next);
    setEntries(next);
  };
  return { entries, update };
}

function fmtDay(day: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('fr-BE', { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}

export function Challenge({ repo, onBack }: { repo: Repository; onBack: () => void }) {
  const tz = deviceTimeZone();
  const today = localDay(Date.now(), tz);
  const days = useMemo(() => dayRange(DEF.start, DEF.end), []);
  const started = today >= DEF.start;
  const [day, setDay] = useState(() => (today < DEF.start ? DEF.start : today > DEF.end ? DEF.end : today));
  const { entries, update } = useChallengeEntries(repo);
  const [appDays, setAppDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    repo.listSessions().then((rows) =>
      setAppDays(new Set(rows.filter((r) => r.outcome === 'completed' || r.outcome === 'partial').map((r) => localDay(r.startedAt, tz)))),
    );
  }, [repo, tz]);

  const editable = day <= today;
  const entry = entries[day];
  const weeks = summarizeWeeks(DEF, entries, appDays);
  const week = weeks.find((w) => w.weekStart === weekStart(day));

  const setValue = (id: string, v: boolean | number | undefined) =>
    update(day, (e) => {
      const values = { ...e.values };
      if (v === undefined) delete values[id];
      else values[id] = v;
      return { ...e, values };
    });

  return (
    <>
      <button className="btn ghost" onClick={onBack}>
        <ChevronLeft size={20} aria-hidden="true" /> Retour
      </button>
      <p className="greeting" style={{ marginTop: 8 }}>{DEF.title}</p>
      <p className="greeting-sub" style={{ fontSize: '1.1rem' }}>
        {started ? 'Du 1er au 30 novembre.' : `Commence le 1er novembre. Aperçu en lecture seule d’ici là.`}
      </p>

      <Notice tone="warn">
        {DEF.source} 4 séances de salle + 3 courses par semaine dès la reprise, c’est un gros volume : adapte si besoin.
        Un jour manqué ne se rattrape pas en double : on reprend le lendemain. Coche « jour excusé » si tu es malade ou blessé.
      </Notice>

      {week && (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>Semaine du {fmtDay(week.weekStart, { day: 'numeric', month: 'short' })}</h2>
            {week.partial && <span className="badge">Semaine partielle ({week.days.length} j)</span>}
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            {DEF.weekly.map((g) => (
              <div key={g.id}>
                <div className="muted" style={{ fontSize: '0.85rem' }}>{g.label}</div>
                <div className="num" style={{ fontSize: '1.6rem', fontWeight: 600 }}>
                  {week.counts[g.id] ?? 0} <span className="muted" style={{ fontSize: '1rem' }}>/ {g.perWeek}</span>
                </div>
              </div>
            ))}
          </div>
          {week.partial && <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.88rem' }}>Objectif hebdo non jugé sur une semaine partielle.</p>}
        </div>
      )}

      <div className="section-head">
        <h2>Jour</h2>
      </div>
      <div className="cats" role="group" aria-label="Choisir le jour">
        {days.map((d) => {
          const done = DEF.daily.filter((h) => habitStatus(h, entries[d]) === 'done').length;
          const filled = entries[d] !== undefined;
          return (
            <button
              key={d}
              className="chip"
              aria-pressed={d === day}
              onClick={() => setDay(d)}
              style={{ flex: 'none', minWidth: 64, display: 'flex', flexDirection: 'column', lineHeight: 1.1, padding: '6px 10px', opacity: d > today ? 0.55 : 1 }}
              aria-label={`${fmtDay(d, { weekday: 'long', day: 'numeric' })} : ${entries[d]?.excused ? 'excusé' : filled ? `${done} habitudes tenues sur ${DEF.daily.length}` : 'non renseigné'}`}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 500 }}>{fmtDay(d, { weekday: 'short' })}</span>
              <span>{fmtDay(d, { day: 'numeric' })}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{entries[d]?.excused ? 'exc.' : filled ? `${done}/${DEF.daily.length}` : '—'}</span>
            </button>
          );
        })}
      </div>

      <div className="card stack">
        <div className="spread">
          <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        </div>
        {!editable && <p className="muted" style={{ margin: 0 }}>Jour futur : saisie possible le jour même.</p>}
        <label className="row" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            style={{ width: 24, height: 24, minHeight: 0 }}
            disabled={!editable}
            checked={!!entry?.excused}
            onChange={(e) => update(day, (x) => ({ ...x, excused: e.target.checked }))}
          />
          Jour excusé (maladie, blessure, repos prescrit)
        </label>

        {DEF.daily.map((h) => {
          const st = habitStatus(h, entry);
          const v = entry?.values[h.id];
          return (
            <div key={h.id} className="card soft" style={{ margin: 0 }}>
              <div className="spread">
                <strong>{h.label}</strong>
                <span className={`badge ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span>
              </div>
              {h.hint && <div className="muted" style={{ fontSize: '0.85rem' }}>{h.hint}</div>}
              <div className="row" style={{ marginTop: 8 }}>
                {h.kind === 'check' ? (
                  <>
                    <button className="chip" disabled={!editable} aria-pressed={v === true} onClick={() => setValue(h.id, true)}>Fait</button>
                    <button className="chip" disabled={!editable} aria-pressed={v === false} onClick={() => setValue(h.id, false)}>Pas fait</button>
                  </>
                ) : (
                  <label className="row" style={{ flex: 1 }}>
                    <span className="sr-only">{h.label} ({h.unit})</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={h.unit === 'h' ? 0.25 : 100}
                      disabled={!editable}
                      value={typeof v === 'number' ? v : ''}
                      onChange={(e) => setValue(h.id, e.target.value === '' ? undefined : Number(e.target.value))}
                      style={{ maxWidth: 160 }}
                    />
                    <span className="muted">{h.unit} · objectif ≥ {h.min?.toLocaleString('fr-BE')}</span>
                  </label>
                )}
                {v !== undefined && (
                  <button className="btn ghost" disabled={!editable} onClick={() => setValue(h.id, undefined)}>Effacer</button>
                )}
              </div>
            </div>
          );
        })}

        <h3 style={{ margin: '8px 0 0' }}>Objectifs de la semaine</h3>
        {DEF.weekly.map((g) => {
          const fromApp = g.id === 'gym' && appDays.has(day);
          const v = entry?.values[g.id] === true;
          return (
            <label key={g.id} className="row" style={{ minHeight: 44 }}>
              <input
                type="checkbox"
                style={{ width: 24, height: 24, minHeight: 0 }}
                disabled={!editable || fromApp}
                checked={v || fromApp}
                onChange={(e) => setValue(g.id, e.target.checked ? true : undefined)}
              />
              {g.label} faite ce jour
              {fromApp && <span className="badge ok">séance enregistrée dans l’app</span>}
            </label>
          );
        })}
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Pas, sommeil et course sont déclarés : l’app web n’a pas accès à Apple Santé.
        </p>
      </div>
    </>
  );
}
