// « Ma semaine » : le coach apprend ton emploi du temps (travail, sommeil, engagements, soirées, séjours),
// te montre tes trous, puis replace tes séances et adapte celles des séjours au matériel disponible.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { busy } from '../engine/availability';
import { localDay } from '../engine/derive';
import { DAY_NAMES, dateOf, fixedEventsFromAnswers, type FixedEvent } from '../engine/planning';
import { TRIP_EQUIPMENT, type Trip } from '../engine/trip';
import type { OnboardingAnswers } from '../engine/profile';
import type { Repository } from '../storage/db';
import { fitPlanning, loadRecurring, loadTrips, saveRecurring } from './agenda';
import { GapBar, loadPlanning } from './Planning';
import { loadOnboarding, patchAnswers } from './profileStore';
import { deviceTimeZone, newId } from './support';
import type { Route } from './App';
import { weekStart } from '../engine/challenge';

const TRIPS = 'agenda.trips';
const PLANNING = 'planning.items';
const D = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];


function DayPick({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="daypick" role="group" aria-label="Jours">
      {D.map((d, i) => (
        <button key={i} aria-label={DAY_NAMES[i]} aria-pressed={value.includes(i)} onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}>
          {d}
        </button>
      ))}
    </div>
  );
}

interface State {
  schedule: OnboardingAnswers['schedule'];
  wake?: string;
  bedtime?: string;
  recurring: FixedEvent[];
  evenings: { days: number[]; from: string };
  trips: Trip[];
}

const STEP_SAY = [
  'Ton travail. Jours, heures, trajet. Je ne place jamais une séance là-dessus.',
  'Ton sommeil. Lever et coucher réels, pas ceux que tu aimerais.',
  'Tout ce qui revient chaque semaine : analyse Amazon, famille, cours… Si ça bloque un créneau, je dois le savoir.',
  'Tes soirées : les jours où tu sors ou où tu n’es pas dispo le soir.',
  'Séjours et semaines exceptionnelles. Où tu seras, et avec quel matériel. Je m’adapte.',
  'Voilà tes trous. C’est là que je place tes séances.',
];

export function AgendaPage({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<FixedEvent>({ id: '', kind: 'autre', label: '', days: [], start: '20:00', end: '22:00' });
  const [trip, setTrip] = useState<Trip>({ id: '', from: '', to: '', label: '', equipment: [] });
  const [result, setResult] = useState<string[] | null>(null);
  const today = localDay(Date.now(), deviceTimeZone());

  useEffect(() => {
    (async () => {
      const a = (await loadOnboarding(repo)).answers;
      const rec = await loadRecurring(repo);
      const ev = rec.find((r) => r.id === 'soirees');
      setSt({
        schedule: a.schedule,
        wake: a.sleep.wake,
        bedtime: a.sleep.bedtime,
        recurring: rec.filter((r) => r.id !== 'soirees'),
        evenings: { days: ev?.days ?? [], from: ev?.start ?? '20:00' },
        trips: await loadTrips(repo),
      });
    })();
  }, [repo]);

  const allFixed = useMemo(() => {
    if (!st) return [];
    const base = fixedEventsFromAnswers({ schedule: st.schedule, sleep: { wake: st.wake, bedtime: st.bedtime, preferredSlots: [] } } as unknown as OnboardingAnswers);
    const ev: FixedEvent[] = st.evenings.days.length ? [{ id: 'soirees', kind: 'autre', label: 'Soirée', days: st.evenings.days, start: st.evenings.from, end: '23:30' }] : [];
    return [...base, ...st.recurring, ...ev];
  }, [st]);

  if (!st) return null;
  const set = (p: Partial<State>) => setSt({ ...st, ...p });
  const last = step === STEP_SAY.length - 1;

  const save = async () => {
    await patchAnswers(repo, (a) => {
      a.schedule = st.schedule;
      a.sleep.wake = st.wake;
      a.sleep.bedtime = st.bedtime;
    });
    const ev = allFixed.filter((e) => e.id === 'soirees');
    await saveRecurring(repo, [...st.recurring, ...ev]);
    await repo.setKv(TRIPS, st.trips);

    const fit = await fitPlanning(repo, await loadPlanning(repo), today);
    const items = fit.items;
    const notes = fit.notes;
    await repo.setKv(PLANNING, items);
    setResult(notes);
  };

  const monday = weekStart(today);
  return (
    <div className="app ob cq">
      <main className="content" style={{ paddingBottom: 140 }}>
        <div className="ob-head">
          <span className="ob-step num">
            <i aria-hidden="true" /> Ma semaine · {String(step + 1).padStart(2, '0')}/{STEP_SAY.length}
          </span>
          <button className="btn ghost ob-later" onClick={() => go({ name: 'planning' })}>
            Quitter
          </button>
        </div>
        <div className="ob-progress" aria-hidden="true">
          {STEP_SAY.map((_, i) => (
            <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
          ))}
        </div>

        {result ? (
          <section className="cq-say">
            <p className="cq-who">Coach</p>
            <h1 className="ob-title">Semaine calée.</h1>
            {result.length ? (
              <ul className="cq-rules">
                {result.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="cq-line">Tout tenait déjà dans tes trous. Rien à bouger.</p>
            )}
            <button className="btn primary block" onClick={() => go({ name: 'planning' })}>
              Voir mon planning
            </button>
          </section>
        ) : (
          <section className="cq-say" key={step}>
            <p className="cq-who">Coach</p>
            <p className="cq-q">{STEP_SAY[step]}</p>
            <div className="card ob-card">
              {step === 0 && (
                <div className="stack">
                  <DayPick value={st.schedule.workDays} onChange={(v) => set({ schedule: { ...st.schedule, workDays: v } })} />
                  <div className="grid2">
                    <label className="field">
                      Début
                      <input type="time" value={st.schedule.workStart ?? ''} onChange={(e) => set({ schedule: { ...st.schedule, workStart: e.target.value } })} />
                    </label>
                    <label className="field">
                      Fin
                      <input type="time" value={st.schedule.workEnd ?? ''} onChange={(e) => set({ schedule: { ...st.schedule, workEnd: e.target.value } })} />
                    </label>
                  </div>
                  <div className="grid2">
                    <label className="field">
                      Pause midi : début
                      <input type="time" value={st.schedule.lunchStart ?? ''} onChange={(e) => set({ schedule: { ...st.schedule, lunchStart: e.target.value || undefined } })} />
                    </label>
                    <label className="field">
                      Pause midi : fin
                      <input type="time" value={st.schedule.lunchEnd ?? ''} onChange={(e) => set({ schedule: { ...st.schedule, lunchEnd: e.target.value || undefined } })} />
                    </label>
                  </div>
                  <label className="field">
                    Trajet (aller, min)
                    <input type="text" inputMode="numeric" value={st.schedule.commuteMin ?? ''} onChange={(e) => set({ schedule: { ...st.schedule, commuteMin: Number(e.target.value) || undefined } })} />
                  </label>
                  <label className="field">
                    Tapis de marche pendant le travail
                    <DayPick value={st.schedule.treadmillDays ?? []} onChange={(v) => set({ schedule: { ...st.schedule, treadmillDays: v } })} />
                  </label>
                </div>
              )}
              {step === 1 && (
                <div className="grid2">
                  <label className="field">
                    Lever
                    <input type="time" value={st.wake ?? ''} onChange={(e) => set({ wake: e.target.value })} />
                  </label>
                  <label className="field">
                    Coucher
                    <input type="time" value={st.bedtime ?? ''} onChange={(e) => set({ bedtime: e.target.value })} />
                  </label>
                </div>
              )}
              {step === 2 && (
                <div className="stack">
                  {st.recurring.map((r) => (
                    <div key={r.id} className="spread rec-row">
                      <span>
                        <strong>{r.label}</strong> <span className="cq-opt-sub num">{r.days.map((d) => D[d]).join(' ')} · {r.start}–{r.end}</span>
                      </span>
                      <button className="btn ghost icon" aria-label={`Retirer ${r.label}`} onClick={() => set({ recurring: st.recurring.filter((x) => x.id !== r.id) })}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <div className="chips">
                    {['Analyse Amazon', 'Famille', 'Cours', 'Courses'].map((l) => (
                      <button key={l} className="chip" aria-pressed={draft.label === l} onClick={() => setDraft({ ...draft, label: l })}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <input aria-label="Libellé" placeholder="Libellé" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                  <DayPick value={draft.days} onChange={(v) => setDraft({ ...draft, days: v })} />
                  <div className="grid2">
                    <input aria-label="Début" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
                    <input aria-label="Fin" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
                  </div>
                  <button
                    className="btn"
                    disabled={!draft.label.trim() || !draft.days.length}
                    onClick={() => {
                      set({ recurring: [...st.recurring, { ...draft, id: newId() }] });
                      setDraft({ id: '', kind: 'autre', label: '', days: [], start: '20:00', end: '22:00' });
                    }}
                  >
                    <Plus size={16} aria-hidden="true" /> Ajouter
                  </button>
                </div>
              )}
              {step === 3 && (
                <div className="stack">
                  <DayPick value={st.evenings.days} onChange={(v) => set({ evenings: { ...st.evenings, days: v } })} />
                  <label className="field">
                    Pas dispo à partir de
                    <input type="time" value={st.evenings.from} onChange={(e) => set({ evenings: { ...st.evenings, from: e.target.value } })} />
                  </label>
                </div>
              )}
              {step === 4 && (
                <div className="stack">
                  {st.trips.map((t) => (
                    <div key={t.id} className="spread rec-row">
                      <span>
                        <strong>{t.label}</strong> <span className="cq-opt-sub num">{t.from} → {t.to} · {t.equipment.join(', ') || 'aucun matériel'}</span>
                      </span>
                      <button className="btn ghost icon" aria-label={`Retirer ${t.label}`} onClick={() => set({ trips: st.trips.filter((x) => x.id !== t.id) })}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <input aria-label="Lieu" placeholder="Lieu (ex. France)" value={trip.label} onChange={(e) => setTrip({ ...trip, label: e.target.value })} />
                  <div className="grid2">
                    <label className="field">
                      Du
                      <input type="date" min={today} value={trip.from} onChange={(e) => setTrip({ ...trip, from: e.target.value })} />
                    </label>
                    <label className="field">
                      Au
                      <input type="date" min={trip.from || today} value={trip.to} onChange={(e) => setTrip({ ...trip, to: e.target.value })} />
                    </label>
                  </div>
                  <p className="cq-opt-sub" style={{ margin: 0 }}>Matériel sur place</p>
                  <div className="chips">
                    {TRIP_EQUIPMENT.map((e) => (
                      <button key={e} className="chip" aria-pressed={trip.equipment.includes(e)} onClick={() => setTrip({ ...trip, equipment: trip.equipment.includes(e) ? trip.equipment.filter((x) => x !== e) : [...trip.equipment, e] })}>
                        {e}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn"
                    disabled={!trip.label.trim() || !trip.from || !trip.to || trip.to < trip.from}
                    onClick={() => {
                      set({ trips: [...st.trips, { ...trip, id: newId() }] });
                      setTrip({ id: '', from: '', to: '', label: '', equipment: [] });
                    }}
                  >
                    <Plus size={16} aria-hidden="true" /> Ajouter le séjour
                  </button>
                </div>
              )}
              {step === 5 && (
                <div className="stack">
                  {DAY_NAMES.map((n, d) => (
                    <div key={d}>
                      <p className="cq-opt-sub" style={{ margin: '0 0 2px' }}>{n}</p>
                      <GapBar spans={busy(dateOf(monday, d), d, allFixed, [])} items={[]} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      {!result && (
        <div className="controls">
          <button className="btn side" aria-label="Retour" onClick={() => (step === 0 ? go({ name: 'planning' }) : setStep(step - 1))}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <button className="btn dark main" onClick={() => (last ? save() : setStep(step + 1))}>
            {last ? 'Caler ma semaine' : 'Suivant'} <ChevronRight size={20} aria-hidden="true" />
          </button>
          <span style={{ width: 56 }} />
        </div>
      )}
    </div>
  );
}
