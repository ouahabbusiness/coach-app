// Carte « Bilan de la semaine » (page Progrès) : séances, courses, habitudes, poids, lecture.

import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { NOVEMBER_2026, dayRange, habitStatus, weekStart } from '../engine/challenge';
import { challengeValues, dailyKey, type DailyMetrics } from '../engine/daily';
import { localDay } from '../engine/derive';
import { shiftWeek } from '../engine/planning';
import { proofKey, withProofs, type ProofDay } from '../engine/proof';
import type { ReadingEntry } from '../engine/reading';
import type { RunEntry } from '../engine/targets';
import { average7, dailyWeights, type WeighIn } from '../engine/weight';
import { weekReport, type WeekReport } from '../engine/weekly';
import type { Repository } from '../storage/db';
import type { Entries } from '../engine/challenge';
import { loadPlanning } from './Planning';
import { loadFree } from './FreeWork';
import { deviceTimeZone } from './support';

export function WeekReportCard({ repo }: { repo: Repository }) {
  const [r, setR] = useState<WeekReport | null>(null);
  const tz = deviceTimeZone();
  const today = localDay(Date.now(), tz);
  useEffect(() => {
    (async () => {
      const ws = weekStart(today);
      const days = dayRange(ws, shiftWeek(ws, 1)).slice(0, 7).filter((d) => d <= today);
      const items = (await loadPlanning(repo)).filter((i) => i.weekStart === ws && !(i.adjustment && i.adjustment.decision !== 'adaptée'));
      const sessions = (await repo.listSessions()).filter((s) => days.includes(localDay(s.startedAt, tz)) && (s.outcome === 'completed' || s.outcome === 'partial'));
      const runs = ((await repo.getKv<RunEntry[]>('run.log')) ?? []).filter((x) => days.includes(x.day));
      const entries = (await repo.getKv<Entries>(`challenge.${NOVEMBER_2026.id}`)) ?? {};
      const habitsByDay: number[] = [];
      for (const d of days) {
        const daily = await repo.getKv<DailyMetrics>(dailyKey(d));
        const proofs = await repo.getKv<ProofDay>(proofKey(d));
        if (!entries[d] && !daily) continue;
        const values = withProofs(challengeValues(entries[d]?.values, daily), proofs);
        habitsByDay.push(NOVEMBER_2026.daily.filter((h) => habitStatus(h, { values, updatedAt: 0 }) === 'done').length);
      }
      const weights = dailyWeights((await repo.getKv<WeighIn[]>('weight.log')) ?? []);
      const reading = ((await repo.getKv<ReadingEntry[]>('reading.log')) ?? []).filter((e) => days.includes(e.day));
      setR(
        weekReport({
          plannedSessions: items.filter((i) => i.kind === 'seance').length,
          doneSessions: sessions.length,
          plannedRuns: items.filter((i) => i.kind === 'course').length,
          runsKm: runs.map((x) => x.km),
          habitsByDay,
          weightAvg: average7(weights, today)?.kg,
          weightAvgPrev: average7(weights, shiftWeek(today, -1))?.kg,
          pagesRead: reading.reduce((t, e) => t + Math.max(0, e.toPage - e.fromPage), 0),
          freeReps: (await loadFree(repo)).filter((b) => days.includes(b.day)).reduce((t, b) => t + (b.rounds.some((r) => r !== null) ? b.rounds.reduce<number>((a, r) => a + (r ?? 0), 0) : b.declaredTotal ?? 0), 0),
        }),
      );
    })();
  }, [repo, today, tz]);
  if (!r) return null;
  const fmt = (n: number) => n.toLocaleString('fr-BE', { maximumFractionDigits: 1 });
  return (
    <section className="hero-card week-report" aria-label="Bilan de la semaine">
      <span className="tile-label">
        <CalendarCheck size={14} aria-hidden="true" /> Bilan de la semaine
      </span>
      <div className="wr-grid">
        <div>
          <span className="kpi-label">Séances</span>
          <strong className="num">{r.sessions}</strong>
        </div>
        <div>
          <span className="kpi-label">Courses</span>
          <strong className="num">{r.runs}</strong>
          <small className="num">{fmt(r.km)} km</small>
        </div>
        <div>
          <span className="kpi-label">Habitudes</span>
          <strong className="num">{r.habits !== undefined ? `${fmt(r.habits)}/6` : '—'}</strong>
          <small>moy./jour</small>
        </div>
        <div>
          <span className="kpi-label">Poids</span>
          <strong className="num">{r.weightDelta !== undefined ? `${r.weightDelta > 0 ? '+' : ''}${fmt(r.weightDelta)}` : '—'}</strong>
          <small>kg / sem.</small>
        </div>
        <div>
          <span className="kpi-label">Lecture</span>
          <strong className="num">{r.pages}</strong>
          <small>pages</small>
        </div>
      </div>
      <p className="wr-verdict">{r.verdict}</p>
      {r.free && <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{r.free}</p>}
      {r.uncertain.length > 0 && <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>Incertain : {r.uncertain.join(' · ')}</p>}
    </section>
  );
}
