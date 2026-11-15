// Construit un instantané compact et honnête des données réelles pour le coach.
// Aucune valeur inventée : tout ce qui manque vaut null et figure dans `gaps`.

import { localDay } from '../engine/derive';
import { emptyAnswers, GOAL_LABELS, type GoalVersion, type OnboardingState } from '../engine/profile';
import { project } from '../engine/session';
import { dailyWeights, trend, type WeighIn } from '../engine/weight';
import type { Repository } from '../storage/db';
import { loadBoughtGear, loadKettlebells, loadOwned, loadPieces } from '../ui/equipment';
import { deviceTimeZone } from '../ui/support';
import type { IppoContext, IppoDay, IppoProgram, IppoSession } from './types';

interface IntakeRow {
  kcal?: number | null;
  complete?: boolean;
  documentedProtein?: number;
  documentedKcal?: number;
}

interface DailyRow {
  sleepH?: number;
  steps?: number;
  treadmillSteps?: number;
}

interface StoredProgram {
  program?: {
    title?: string;
    weeks?: number;
    templates?: { title?: string; lines?: unknown[] }[];
    rules?: string[];
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Dernier jour local, au format AAAA-MM-JJ, décalé de `minusDays`. */
function dayMinus(today: string, minusDays: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - minusDays);
  return d.toISOString().slice(0, 10);
}

export async function buildCoachContext(repo: Repository, now: number = Date.now()): Promise<IppoContext> {
  const tz = deviceTimeZone();
  const today = localDay(now, tz);
  const gaps: string[] = [];

  const onboard = (await repo.getKv<OnboardingState>('onboarding')) ?? null;
  const answers = { ...emptyAnswers(), ...(onboard?.answers ?? {}) };
  const goals = (await repo.getKv<GoalVersion[]>('goals')) ?? [];
  const goal = goals.length ? goals[goals.length - 1] : null;

  const weighIns = (await repo.getKv<WeighIn[]>('weight.log')) ?? [];
  const days = dailyWeights(weighIns);
  const latest = days.length ? days[days.length - 1] : null;
  const weightTrend = trend(days, today);

  const declaredWeight = num(answers.body.weightKg.value);
  const weightKg = latest ? latest.kg : declaredWeight;
  if (weightKg === null) gaps.push('poids non renseigné');

  const age = num(answers.body.age.value);
  const heightCm = num(answers.body.heightCm.value);
  const waistCm = num(answers.body.waistCm.value);
  if (age === null) gaps.push('âge non renseigné');
  if (heightCm === null) gaps.push('taille non renseignée');

  const programRow = await repo.getKv<StoredProgram>('program.current');
  let program: IppoProgram | null = null;
  if (programRow?.program) {
    const p = programRow.program;
    program = {
      title: p.title ?? 'Programme',
      weeks: num(p.weeks),
      templates: (p.templates ?? []).map((t) => ({ title: t.title ?? 'Séance', lines: Array.isArray(t.lines) ? t.lines.length : 0 })),
      rules: (p.rules ?? []).filter((r): r is string => typeof r === 'string'),
    };
  }
  if (!program) gaps.push('aucun programme validé');

  const summaries = await repo.listSessions();
  const recent = summaries.slice(0, 8);
  const sessions: IppoSession[] = [];
  for (const [i, s] of recent.entries()) {
    let doneSets: number | null = null;
    let workSets: number | null = null;
    let painReports = 0;
    if (i < 4) {
      const events = await repo.sessionEvents(s.id);
      const st = project(events);
      if (st) {
        workSets = st.sets.filter((x) => x.planned.role === 'work').length;
        doneSets = st.sets.filter((x) => x.planned.role === 'work' && x.status === 'done').length;
      }
      painReports = events.filter((e) => e.type === 'pain_reported').length;
    }
    sessions.push({
      day: localDay(s.startedAt, tz),
      title: s.title,
      outcome: s.outcome,
      durationMin: s.endedAt ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60_000)) : null,
      doneSets,
      workSets,
      painReports,
    });
  }
  if (sessions.length === 0) gaps.push('aucune séance enregistrée');

  const intakeToday = await repo.getKv<IntakeRow>(`intake.${today}`);
  const todayKcal = num(intakeToday?.kcal);
  const todayProteinG = num(intakeToday?.documentedProtein);
  const todayComplete = typeof intakeToday?.complete === 'boolean' ? intakeToday.complete : null;
  if (todayKcal === null) gaps.push('apports alimentaires du jour non renseignés');

  const recentDays: IppoDay[] = [];
  for (let i = 0; i < 5; i++) {
    const day = dayMinus(today, i);
    const row = await repo.getKv<DailyRow>(`daily.${day}`);
    if (!row) continue;
    recentDays.push({ day, sleepH: num(row.sleepH), steps: num(row.steps) });
  }
  if (recentDays.every((d) => d.sleepH === null)) gaps.push('sommeil non renseigné');

  const goalLabels = goal?.secondary?.map((g) => GOAL_LABELS[g] ?? g) ?? [];

  const equipment = {
    items: await loadOwned(repo),
    kettlebells: await loadKettlebells(repo),
    loadPieces: await loadPieces(repo),
    bought: await loadBoughtGear(repo),
  };
  if (equipment.items.length === 0) gaps.push('matériel non renseigné');

  return {
    generatedAt: now,
    day: today,
    profile: {
      age,
      heightCm,
      weightKg: weightKg === null ? null : round1(weightKg),
      weightSource: latest ? 'pesée' : declaredWeight !== null ? 'déclaré' : null,
      waistCm,
      sex: answers.body.formulaSex ?? null,
      tone: answers.coaching.tone ?? null,
    },
    equipment,
    goal: goal
      ? {
          main: goal.main ? (GOAL_LABELS[goal.main] ?? goal.main) : null,
          secondary: goalLabels,
          description: str(goal.description),
          why: str(goal.why),
          targetDate: str(goal.targetDate),
          limits: str(goal.limits),
        }
      : null,
    program,
    sessions,
    weight: {
      latestKg: latest ? round1(latest.kg) : null,
      latestDay: latest?.day ?? null,
      trend: weightTrend.status,
      deltaKg: weightTrend.deltaKg ?? null,
    },
    nutrition: {
      todayKcal,
      todayProteinG,
      todayComplete,
      restrictions: str(answers.food.restrictions),
      mealsPerDay: null,
    },
    days: recentDays,
    safety: {
      pains: str(answers.safety.pains),
      restrictions: str(answers.safety.restrictions),
    },
    gaps,
  };
}
