// Course en direct : « Go », GPS en temps réel (distance, allure, km), carte du tracé, séance guidée à la voix.
// Limite web sur iPhone : le GPS s'arrête si l'écran se verrouille → l'écran est gardé allumé pendant la course.
// Une course enregistrée par le GPS de l'app compte comme preuve (pas de photo).

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, LocateFixed, MapPin, Pause, Play, Square, Volume2, VolumeX } from 'lucide-react';
import type { Map as LMap, Polyline, CircleMarker } from 'leaflet';
import { localDay } from '../engine/derive';
import { advance, announce, pacesFrom, stepsFor, type GuideState, type GuidedStep } from '../engine/guided';
import { toMin, type PlannedItem } from '../engine/planning';
import { proofKey, type ProofDay } from '../engine/proof';
import { addPoint, cue, fmtPace, stats, type GpsPoint, type Segment } from '../engine/runTrack';
import { runTarget, type RunEntry } from '../engine/targets';
import { plannedRunKm } from './runPlan';
import { weekStart } from '../engine/challenge';
import type { Repository } from '../storage/db';
import { useChallengeEntries } from './Challenge';
import { loadPlanning } from './Planning';
import { deviceTimeZone, fmtDuration, newId } from './support';
import type { Route } from './App';
import { useConsent } from './Privacy';
import { INITIATION_STEPS } from '../engine/runInitiation';
import { RunReport, type InitiationEntry } from './RunReport';

type Mode = 'initiation' | 'guidee' | 'distance' | 'libre';
type Phase = 'setup' | 'running' | 'paused' | 'done';

function speak(text: string, on: boolean) {
  if (!on || typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function LiveRun({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const today = localDay(Date.now(), deviceTimeZone());
  const { update } = useChallengeEntries(repo);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [planned, setPlanned] = useState<PlannedItem | undefined>();
  const [mode, setMode] = useState<Mode>('libre');
  const [km, setKm] = useState('5');
  const [outBack, setOutBack] = useState(true);
  const [voice, setVoice] = useState(true);
  const [phase, setPhase] = useState<Phase>('setup');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState<string | null>(null);
  const gps = useConsent(repo, 'location');
  const tiles = useConsent(repo, 'map');
  const [effort, setEffort] = useState<number | undefined>();
  const [guide, setGuide] = useState<GuideState>({ index: 0, startM: 0, startS: 0 });
  const [steps, setSteps] = useState<GuidedStep[]>([]);
  const [saved, setSaved] = useState(false);
  // Initiation : tracé complet, points écartés, début de chaque étape, valeurs déclarées.
  const rejected = useRef(0);
  const marks = useRef<number[]>([]);
  const [talk, setTalk] = useState<'phrases' | 'mots' | 'impossible' | undefined>();
  const [hrAvg, setHrAvg] = useState('');
  const [hrMax, setHrMax] = useState('');
  const [pain, setPain] = useState('');
  const [report, setReport] = useState<InitiationEntry | null>(null);
  const guided = mode === 'guidee' || mode === 'initiation';

  const watch = useRef<number | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const t0 = useRef(0);
  const pausedMs = useRef(0);
  const pauseAt = useRef(0);
  const lastM = useRef(0);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<{ m: LMap; line: Polyline; dot: CircleMarker } | null>(null);
  const centered = useRef(false);

  useEffect(() => {
    (async () => {
      const r = (await repo.getKv<RunEntry[]>('run.log')) ?? [];
      setRuns(r);
      const t = runTarget(r, today, await plannedRunKm(repo, today)).value;
      if (t) setKm(String(t.km).replace('.', ','));
      // Première course dans l'app : initiation proposée par défaut.
      if (!r.some((x) => (x as RunEntry & { kind?: string }).kind === 'initiation')) return setMode('initiation');
      const day = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
      const it = (await loadPlanning(repo)).filter((i) => i.weekStart === weekStart(today) && i.day === day && i.kind === 'course' && !i.sessionId).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
      if (it) {
        setPlanned(it);
        setMode('guidee');
      }
    })();
  }, [repo, today]);

  // Horloge d'affichage.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const elapsedS = Math.max(0, Math.round(((phase === 'paused' ? pauseAt.current : now) - t0.current - pausedMs.current) / 1000));
  const st = stats(segments);
  const target = Number(km.replace(',', '.'));

  // Annonces : km, demi-tour, objectif, étapes guidées.
  useEffect(() => {
    if (phase !== 'running') return;
    const c = cue(lastM.current, st.meters, mode === 'distance' ? target : undefined, mode === 'distance' && outBack);
    if (c) {
      speak(c === 'Demi-tour' || c === 'Objectif atteint' ? c : `${c}, allure ${fmtPace(st.avgPace).replace(':', ' ')}`, voice);
      navigator.vibrate?.(300);
    }
    lastM.current = st.meters;
    if (guided && steps.length) {
      const r = advance(steps, guide, st.meters, elapsedS);
      if (r.state !== guide) {
        setGuide(r.state);
        if (r.started) marks.current.push(Date.now());
        speak(r.finished ? 'Séance terminée. Bravo.' : r.started ? announce(r.started) : '', voice);
        navigator.vibrate?.([200, 100, 200]);
      }
    }
  }, [st.meters, elapsedS]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carte (chargée seulement quand la course démarre).
  const first = segments.flatMap((sg) => sg.points)[0];
  useEffect(() => {
    if (phase === 'setup' || !mapEl.current || map.current || !first) return;
    (async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      // Pas de position par défaut : aucune tuile n'est demandée avant le 1er point GPS. Sans accord « carte » : tracé sans fond.
      const m = L.map(mapEl.current!, { zoomControl: false, attributionControl: true }).setView([first.lat, first.lon], 18);
      if (tiles.granted) L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      const line = L.polyline([], { color: '#f3ecdc', weight: 4 }).addTo(m);
      const dot = L.circleMarker([first.lat, first.lon], { radius: 7, color: '#050505', weight: 2, fillColor: '#f3ecdc', fillOpacity: 1 }).addTo(m);
      map.current = { m, line, dot };
      window.setTimeout(() => m.invalidateSize(), 50);
    })();
  }, [phase, !!first]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const last = segments[segments.length - 1]?.points.slice(-1)[0];
    if (!map.current || !last) return;
    map.current.line.setLatLngs(segments.map((s) => s.points.map((p) => [p.lat, p.lon] as [number, number])));
    map.current.dot.setLatLng([last.lat, last.lon]);
    // À pied : zoom rue (18). Premier point → on se centre directement dessus.
    if (!centered.current) {
      map.current.m.setView([last.lat, last.lon], 18);
      centered.current = true;
    } else map.current.m.panTo([last.lat, last.lon], { animate: true });
  }, [segments]);

  const startWatch = () => {
    if (!navigator.geolocation) return setErr('GPS indisponible sur cet appareil.');
    setSegments((s) => [...s, { points: [] }]);
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p: GpsPoint = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: pos.timestamp, acc: pos.coords.accuracy };
        setSegments((s) => {
          const copy = [...s];
          const before = copy[copy.length - 1] ?? { points: [] };
          const after = addPoint(before, p);
          // Point écarté (imprécis ou impossible) : compté pour juger la qualité du GPS.
          if (after === before) rejected.current++;
          copy[copy.length - 1] = after;
          return copy;
        });
        setErr(null);
      },
      (e) => setErr(e.code === 1 ? 'Autorise la localisation pour suivre ta course.' : 'Signal GPS faible…'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };
  const stopWatch = () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
  };

  const goRun = async () => {
    // Accords avant activation : GPS (reste sur l'appareil), puis fond de carte (zone envoyée à OpenStreetMap).
    if (!(await gps.ensure())) return setErr('GPS non autorisé dans l’app : Réglages → Mes données.');
    await tiles.ensure();
    const s = mode === 'initiation' ? INITIATION_STEPS : mode === 'guidee' && planned ? stepsFor(planned, pacesFrom(runs)) : [];
    setSteps(s);
    setGuide({ index: 0, startM: 0, startS: 0 });
    t0.current = Date.now();
    marks.current = [t0.current];
    rejected.current = 0;
    pausedMs.current = 0;
    lastM.current = 0;
    setNow(Date.now());
    setPhase('running');
    try {
      wake.current = (await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen')) ?? null;
    } catch {
      /* écran : à garder allumé manuellement */
    }
    speak(s[0] ? `C’est parti. ${announce(s[0])}` : 'C’est parti.', voice);
    startWatch();
  };

  const pause = () => {
    stopWatch();
    pauseAt.current = Date.now();
    setPhase('paused');
    speak('Pause', voice);
  };
  const resume = () => {
    pausedMs.current += Date.now() - pauseAt.current;
    setPhase('running');
    speak('Reprise', voice);
    startWatch();
  };
  const finish = async () => {
    stopWatch();
    if (phase === 'running') pauseAt.current = Date.now();
    setPhase('done');
    await wake.current?.release().catch(() => undefined);
    speak(`Terminé. ${(st.meters / 1000).toFixed(2).replace('.', ',')} kilomètres.`, voice);
  };

  useEffect(() => () => stopWatch(), []);

  const save = async () => {
    if (mode === 'initiation') return saveInitiation();
    const entry: RunEntry & { gps: true; track: [number, number][] } = {
      id: newId(),
      day: today,
      km: Math.round(st.meters / 10) / 100,
      minutes: Math.round(elapsedS / 6) / 10,
      effort,
      at: Date.now(),
      gps: true,
      track: segments.flatMap((s) => s.points.filter((_, i) => i % 5 === 0).map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5] as [number, number])),
    };
    await repo.setKv('run.log', [...runs, entry]);
    // Preuve automatique : course mesurée par le GPS de l'app.
    const proofs = (await repo.getKv<ProofDay>(proofKey(today))) ?? {};
    await repo.setKv(proofKey(today), { ...proofs, run: { habitId: 'run', photo: '', takenAt: t0.current, savedAt: Date.now(), source: 'gps' } });
    await update(today, (e) => ({ ...e, values: { ...e.values, run: true } }));
    if (planned) {
      const items = await loadPlanning(repo);
      await repo.setKv('planning.items', items.map((i) => (i.id === planned.id ? { ...i, sessionId: `run-${entry.id}` } : i)));
    }
    setSaved(true);
  };

  /** Initiation : tout le tracé horodaté (pour l'analyse), stocké sur l'appareil uniquement. */
  const saveInitiation = async () => {
    const num = (v: string) => {
      const n = Number(v.replace(',', '.'));
      return v.trim() && Number.isFinite(n) && n > 30 && n < 230 ? Math.round(n) : undefined;
    };
    const entry: RunEntry & InitiationEntry & { gps: true } = {
      id: newId(),
      day: today,
      kind: 'initiation',
      km: Math.round(st.meters / 10) / 100,
      minutes: Math.round(elapsedS / 6) / 10,
      effort,
      at: Date.now(),
      gps: true,
      segments: segments.map((s) => s.points.map((p) => [Math.round(p.lat * 1e6) / 1e6, Math.round(p.lon * 1e6) / 1e6, p.t, Math.round(p.acc)] as [number, number, number, number])),
      marks: marks.current,
      rejected: rejected.current,
      elapsedS,
      declared: { hrAvg: num(hrAvg), hrMax: num(hrMax), rpe: effort, talk, pain: pain.trim() || undefined },
    };
    await repo.setKv('run.log', [...runs, entry]);
    const proofs = (await repo.getKv<ProofDay>(proofKey(today))) ?? {};
    await repo.setKv(proofKey(today), { ...proofs, run: { habitId: 'run', photo: '', takenAt: t0.current, savedAt: Date.now(), source: 'gps' } });
    await update(today, (e) => ({ ...e, values: { ...e.values, run: true } }));
    if (planned) {
      const items = await loadPlanning(repo);
      await repo.setKv('planning.items', items.map((i) => (i.id === planned.id ? { ...i, sessionId: `run-${entry.id}` } : i)));
    }
    setReport(entry);
    setSaved(true);
  };

  const step = steps[guide.index];
  return (
    <div className={`app ob cq run-live ${phase !== 'setup' ? 'full' : ''}`}>
      {gps.modal}
      {tiles.modal}
      {phase !== 'setup' && <div ref={mapEl} className="run-map-full" aria-label="Carte du tracé" />}
      {phase !== 'setup' && (
        <button className="run-recenter" aria-label="Recentrer sur ma position" onClick={() => {
          const last = segments[segments.length - 1]?.points.slice(-1)[0];
          if (map.current && last) map.current.m.setView([last.lat, last.lon], 18, { animate: true });
        }}>
          <LocateFixed size={20} aria-hidden="true" />
        </button>
      )}
      <main className="content" style={{ paddingBottom: 150 }}>
        <div className="ob-head">
          <span className="ob-step num">
            <i aria-hidden="true" /> Course · {phase === 'setup' ? 'prêt' : phase === 'running' ? 'en cours' : phase === 'paused' ? 'pause' : 'terminé'}
          </span>
          <button className="btn ghost ob-later" onClick={() => (phase === 'running' || phase === 'paused' ? window.confirm('Quitter sans enregistrer ?') && (stopWatch(), go({ name: 'today' })) : go({ name: 'today' }))}>
            Quitter
          </button>
        </div>

        {phase === 'setup' && (
          <section className="cq-say">
            <p className="cq-who">Coach</p>
            <h1 className="ob-title">On court.</h1>
            <div className="cq-choices">
              <button className="cq-opt" aria-pressed={mode === 'initiation'} onClick={() => setMode('initiation')}>
                <span className="cq-opt-l">Course d’initiation · 30 min</span>
                <span className="cq-opt-sub">Pour connaître ton niveau : pas un test maximal</span>
              </button>
              {planned && (
                <button className="cq-opt" aria-pressed={mode === 'guidee'} onClick={() => setMode('guidee')}>
                  <span className="cq-opt-l">Séance du jour, guidée</span>
                  <span className="cq-opt-sub">{planned.title}</span>
                </button>
              )}
              <button className="cq-opt" aria-pressed={mode === 'distance'} onClick={() => setMode('distance')}>
                <span className="cq-opt-l">Distance cible</span>
                <span className="cq-opt-sub">Annonce à chaque km, demi-tour à mi-parcours</span>
              </button>
              <button className="cq-opt" aria-pressed={mode === 'libre'} onClick={() => setMode('libre')}>
                <span className="cq-opt-l">Libre</span>
                <span className="cq-opt-sub">Tu cours, l’app mesure</span>
              </button>
            </div>
            {mode === 'distance' && (
              <div className="card ob-card">
                <div className="cq-num-row">
                  <input aria-label="Distance cible en km" type="text" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
                  <span>km</span>
                </div>
                <div className="seg2">
                  <button aria-pressed={outBack} onClick={() => setOutBack(true)}>
                    Aller-retour
                  </button>
                  <button aria-pressed={!outBack} onClick={() => setOutBack(false)}>
                    Boucle libre
                  </button>
                </div>
              </div>
            )}
            {mode === 'initiation' && (
              <div className="card ob-card">
                <ol className="run-steps">
                  {INITIATION_STEPS.map((s, i) => (
                    <li key={i}>
                      {s.label}
                      <small> · {s.effort}</small>
                    </li>
                  ))}
                </ol>
                <p className="cq-line" style={{ margin: 0 }}>
                  Mesuré par le GPS : tracé, distance, allure toutes les 30 s, passages en marche, temps par km.
                </p>
                <p className="cq-line" style={{ margin: 0 }}>
                  Fréquence cardiaque : l’app web ne peut pas lire ta montre. Lance aussi « Course extérieure » sur l’Apple Watch au même moment, puis recopie la FC moyenne et max à la fin.
                </p>
              </div>
            )}
            {mode === 'guidee' && planned && (
              <div className="card ob-card">
                <ol className="run-steps">
                  {stepsFor(planned, pacesFrom(runs)).map((s, i) => (
                    <li key={i}>
                      {s.label}
                      <small>{s.pace ? ` · ${fmtPace(s.pace)}/km` : s.effort ? ` · ${s.effort}` : ''}</small>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <button className="cq-opt" aria-pressed={voice} onClick={() => setVoice(!voice)}>
              <span className="cq-opt-l">
                {voice ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />} Annonces vocales
              </span>
            </button>
            <button className="cq-opt" onClick={() => go({ name: 'spots' })}>
              <span className="cq-opt-l">
                <MapPin size={14} aria-hidden="true" /> Spots autour de moi
              </span>
              <span className="cq-opt-sub">Parcs, pistes, street workout</span>
            </button>
            <p className="cq-warn">
              <MapPin size={14} aria-hidden="true" /> L’écran reste allumé : sur iPhone, une app web perd le GPS écran verrouillé.
            </p>
          </section>
        )}

        {phase !== 'setup' && (
          <section className="run-board">
            {guided && step && (
              <div className={`run-step k-${step.kind}`}>
                <span className="cq-who">Étape {guide.index + 1}/{steps.length}</span>
                <strong>{step.label}</strong>
                <span className="num">
                  {step.pace ? `cible ${fmtPace(step.pace)}/km` : step.effort}
                  {step.meters ? ` · ${Math.max(0, Math.round(step.meters - (st.meters - guide.startM)))} m` : step.seconds ? ` · ${Math.max(0, step.seconds - (elapsedS - guide.startS))} s` : ''}
                </span>
              </div>
            )}
            <div className="run-time num">{fmtDuration(elapsedS * 1000)}</div>
            <div className="run-grid">
              <div>
                <span className="cq-who">Distance</span>
                <strong className="num">{(st.meters / 1000).toFixed(2).replace('.', ',')}</strong>
                <small>km{mode === 'distance' && target ? ` / ${km}` : ''}</small>
              </div>
              <div>
                <span className="cq-who">Allure</span>
                <strong className="num">{fmtPace(st.currentPace)}</strong>
                <small>/km</small>
              </div>
              <div>
                <span className="cq-who">Moyenne</span>
                <strong className="num">{fmtPace(st.avgPace)}</strong>
                <small>/km</small>
              </div>
            </div>
            {err && <p className="cq-warn">{err}</p>}
            {st.splits.length > 0 && (
              <ol className="run-splits num">
                {st.splits.map((s, i) => (
                  <li key={i}>
                    km {i + 1} · {fmtPace(s)}
                  </li>
                ))}
              </ol>
            )}
            {phase === 'done' && !saved && (
              <div className="card ob-card">
                <p className="cq-who">Effort ressenti</p>
                <div className="effort">
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button key={n} className="chip num" aria-pressed={effort === n} onClick={() => setEffort(n)}>
                      {n}
                    </button>
                  ))}
                </div>
                {mode === 'initiation' && (
                  <>
                    <p className="cq-who">Pendant la course, tu pouvais…</p>
                    <div className="effort">
                      {(
                        [
                          ['phrases', 'parler en phrases'],
                          ['mots', 'dire quelques mots'],
                          ['impossible', 'pas parler'],
                        ] as const
                      ).map(([v, l]) => (
                        <button key={v} className="chip" aria-pressed={talk === v} onClick={() => setTalk(v)}>
                          {l}
                        </button>
                      ))}
                    </div>
                    <p className="cq-who">Fréquence cardiaque (Apple Watch → Forme → cette course)</p>
                    <div className="cq-num-row">
                      <input aria-label="FC moyenne" type="text" inputMode="numeric" placeholder="moyenne" value={hrAvg} onChange={(e) => setHrAvg(e.target.value)} />
                      <input aria-label="FC max" type="text" inputMode="numeric" placeholder="max" value={hrMax} onChange={(e) => setHrMax(e.target.value)} />
                      <span>bpm</span>
                    </div>
                    <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>Laisse vide si tu ne l’as pas : la valeur restera « inconnue ».</p>
                    <input aria-label="Douleur ou gêne" placeholder="Douleur ou gêne (laisser vide si aucune)" value={pain} onChange={(e) => setPain(e.target.value)} />
                  </>
                )}
                <button className="btn primary block" disabled={st.meters < 200 || effort === undefined || (mode === 'initiation' && !talk)} onClick={save}>
                  Enregistrer la course
                </button>
                {st.meters < 200 && <p className="cq-warn">Moins de 200 m mesurés : rien à enregistrer.</p>}
              </div>
            )}
            {saved && report && <RunReport entry={report} />}
            {saved && (
              <div className="card ob-card">
                <p className="cq-q">Course enregistrée.</p>
                <p className="cq-line">Mesurée par le GPS : elle compte pour le défi, sans photo.</p>
                <button className="btn primary block" onClick={() => go({ name: 'today' })}>
                  Accueil
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {phase !== 'done' && (
        <div className="controls">
          <button className="btn side" aria-label="Retour" onClick={() => (phase === 'setup' ? go({ name: 'today' }) : undefined)} disabled={phase !== 'setup'}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          {phase === 'setup' && (
            <button className="btn dark main" disabled={mode === 'distance' && !(target > 0)} onClick={goRun}>
              <Play size={18} aria-hidden="true" /> Go
            </button>
          )}
          {phase === 'running' && (
            <button className="btn dark main" onClick={pause}>
              <Pause size={18} aria-hidden="true" /> Pause
            </button>
          )}
          {phase === 'paused' && (
            <button className="btn dark main" onClick={resume}>
              <Play size={18} aria-hidden="true" /> Reprendre
            </button>
          )}
          {phase !== 'setup' ? (
            <button className="btn side" aria-label="Terminer la course" onClick={finish}>
              <Square size={20} aria-hidden="true" />
            </button>
          ) : (
            <span style={{ width: 56 }} />
          )}
        </div>
      )}
    </div>
  );
}
