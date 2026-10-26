import { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronLeft, Mountain } from 'lucide-react';
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
import { challengeValues, dailyKey, type DailyMetrics } from '../engine/daily';
import type { Repository } from '../storage/db';
import { Notice } from './common';
import { HabitsSheet, ShotButton, saveProof, useDayHabits, useProofMap } from './Habits';
import { withProofs } from '../engine/proof';
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

export function useChallengeEntries(repo: Repository, version = 0) {
  const [entries, setEntries] = useState<Entries>({});
  useEffect(() => {
    repo.getKv<Entries>(KEY).then((e) => e && setEntries(e));
  }, [repo, version]);
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

export function Challenge({ repo, onBack, onStatus, onReading }: { repo: Repository; onBack: () => void; onStatus?: () => void; onReading?: () => void }) {
  const tz = deviceTimeZone();
  const today = localDay(Date.now(), tz);
  const days = useMemo(() => dayRange(DEF.start, DEF.end), []);
  const started = today >= DEF.start;
  const [day, setDay] = useState(() => (today < DEF.start ? DEF.start : today > DEF.end ? DEF.end : today));
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState(false);
  const { entries, update } = useChallengeEntries(repo, version);
  const proofMap = useProofMap(repo, days, version);
  const dayHabits = useDayHabits(repo, day);
  const [appDays, setAppDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    repo.listSessions().then((rows) =>
      setAppDays(new Set(rows.filter((r) => r.outcome === 'completed' || r.outcome === 'partial').map((r) => localDay(r.startedAt, tz)))),
    );
  }, [repo, tz]);

  const [dailyMap, setDailyMap] = useState<Record<string, DailyMetrics>>({});
  useEffect(() => {
    (async () => {
      const m: Record<string, DailyMetrics> = {};
      for (const d of days) {
        const v = await repo.getKv<DailyMetrics>(dailyKey(d));
        if (v) m[d] = v;
      }
      setDailyMap(m);
    })();
  }, [repo, days, version]);

  const editable = day <= today;
  const merged = (d: string): DayEntry | undefined => {
    if (!entries[d] && !dailyMap[d]) return undefined;
    return { ...(entries[d] ?? { updatedAt: 0 }), values: withProofs(challengeValues(entries[d]?.values, dailyMap[d]), proofMap[d]) };
  };
  const entry = merged(day);
  const mergedAll: Entries = {};
  for (const d of days) {
    const m = merged(d);
    if (m) mergedAll[d] = m;
  }
  const weeks = summarizeWeeks(DEF, mergedAll, appDays);
  const week = weeks.find((w) => w.weekStart === weekStart(day));

  const setValue = async (id: string, v: boolean | number | undefined) => {
    // Sommeil et pas : une seule saisie, partagée avec l'accueil.
    if (id === 'sleep' || id === 'steps') {
      const field = id === 'sleep' ? 'sleepH' : 'steps';
      const next: DailyMetrics = { ...(dailyMap[day] ?? {}), [field]: typeof v === 'number' ? v : undefined, updatedAt: Date.now() };
      await repo.setKv(dailyKey(day), next);
      setDailyMap({ ...dailyMap, [day]: next });
      return;
    }
    return update(day, (e) => {
      const values = { ...e.values };
      if (v === undefined) delete values[id];
      else values[id] = v;
      return { ...e, values };
    });
  };

  return (
    <>
      <button className="btn ghost" onClick={onBack}>
        <ChevronLeft size={20} aria-hidden="true" /> Retour
      </button>
      <div className="spread" style={{ marginTop: 8 }}>
        <div>
          <h1 className="page-title">{DEF.title}</h1>
          <p className="eyebrow" style={{ margin: 0 }}>{started ? '1 → 30 nov.' : 'Dès le 1er nov.'}</p>
        </div>
        {onStatus && (
          <button className="btn sm" onClick={onStatus} aria-label="Statut Winter Arc">
            <Mountain size={16} aria-hidden="true" /> Statut
          </button>
        )}
      </div>

      <div className="row" style={{ gap: 6, margin: '10px 0 12px' }}>
        <span className="badge warn">Gros volume : adapte</span>
        <span className="badge">Pas de rattrapage</span>
        <span className="badge">Jour excusé = 0 pénalité</span>
      </div>

      {week && (
        <section className="ui-card stack">
          <div className="spread">
            <p className="eyebrow" style={{ margin: 0 }}>Semaine du {fmtDay(week.weekStart, { day: 'numeric', month: 'short' })}</p>
            {week.partial && <span className="pill">partielle · non jugée</span>}
          </div>
          <div className="grid2">
            {DEF.weekly.map((g) => (
              <div key={g.id} className="stack" style={{ gap: 6 }}>
                <span className="kpi-label">{g.label}</span>
                <span className="kpi-value num">
                  {week.counts[g.id] ?? 0}
                  <span className="kpi-sub"> / {g.perWeek}</span>
                </span>
                <div className="segments" style={{ gridTemplateColumns: `repeat(${g.perWeek}, 1fr)` }} aria-hidden="true">
                  {Array.from({ length: g.perWeek }, (_, i) => (
                    <span key={i} className={i < (week.counts[g.id] ?? 0) ? 'on' : ''} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="section-head">
        <h2>Jour</h2>
      </div>
      <div className="cats" role="group" aria-label="Choisir le jour">
        {days.map((d) => {
          const done = DEF.daily.filter((h) => habitStatus(h, merged(d)) === 'done').length;
          const filled = merged(d) !== undefined;
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
        {!editable && <p className="muted" style={{ margin: 0 }}>Jour futur</p>}
        <button className="chip" style={{ alignSelf: 'flex-start' }} disabled={!editable} aria-pressed={!!entry?.excused} onClick={() => update(day, (x) => ({ ...x, excused: !x.excused }))} title="Maladie, blessure, repos prescrit">
          Jour excusé
        </button>

        <ul className="habits">
          {DEF.daily.map((h) => {
            const st = habitStatus(h, entry);
            return (
              <li key={h.id} className="spread" style={{ minHeight: 40 }}>
                <span>{h.label}</span>
                <span className={`badge ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span>
              </li>
            );
          })}
        </ul>
        {day === today ? (
          <button className="btn primary" onClick={() => setSheet(true)}>
            <Camera size={16} aria-hidden="true" /> Objectifs du jour
          </button>
        ) : (
          editable && <span className="badge">Preuve = photo du jour même</span>
        )}
        <HabitsSheet
          open={sheet}
          onClose={() => {
            setSheet(false);
            setVersion((v) => v + 1);
          }}
          h={dayHabits}
          onReading={onReading ?? (() => undefined)}
        />

        <h3 style={{ margin: '8px 0 0' }}>Objectifs de la semaine</h3>
        {DEF.weekly.map((g) => {
          const fromApp = g.id === 'gym' && appDays.has(day);
          const proof = proofMap[day]?.[g.id];
          const ok = fromApp || (entry?.values[g.id] === true && !!proof);
          return (
            <div key={g.id} className="spread" style={{ minHeight: 48 }}>
              <span>
                {g.label} {ok && '✓'}
              </span>
              {fromApp ? (
                <span className="badge ok">séance app</span>
              ) : proof ? (
                proof.source === 'gps' ? <span className="badge ok">GPS</span> : <img className="hs-thumb" src={proof.photo} alt={`Preuve : ${g.label}`} />
              ) : day === today ? (
                <ShotButton
                  label="Preuve"
                  onFile={async (f) => {
                    const err = await saveProof(repo, day, g.id, f);
                    if (err) return window.alert(err);
                    await setValue(g.id, true);
                    setVersion((v) => v + 1);
                  }}
                />
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          );
        })}
        <span className="badge" style={{ alignSelf: 'flex-start' }}>Compté seulement avec photo</span>
      </div>
    </>
  );
}
