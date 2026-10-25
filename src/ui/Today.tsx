import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, Layers, Play, Repeat } from 'lucide-react';
import { EXERCISES, findVariant, type Exercise } from '../catalog/exercises';
import { project } from '../engine/session';
import type { Repository, SessionSummaryRow } from '../storage/db';
import { NotBuilt, OutcomeBadge } from './common';
import { Scene } from './Fighter';
import { CharacterArt } from './character';
import { fmtDateTime, deviceTimeZone } from './support';
import { loadTemplates, type SessionTemplate } from './templates';
import { startSessionFromTemplate } from './actions';
import { NOVEMBER_2026, habitStatus } from '../engine/challenge';
import { localDay } from '../engine/derive';
import { useChallengeEntries } from './Challenge';
import type { Route } from './App';

type Category = Exercise['category'];
const CATEGORIES: { id: Category; label: string; scene: 'gym' | 'outdoor' }[] = [
  { id: 'street_workout', label: 'Street workout', scene: 'outdoor' },
  { id: 'kettlebell', label: 'Kettlebell', scene: 'gym' },
  { id: 'jambes', label: 'Jambes', scene: 'gym' },
  { id: 'gainage', label: 'Gainage', scene: 'gym' },
];

function categoriesOf(t: SessionTemplate): Set<Category> {
  return new Set(t.lines.map((l) => EXERCISES.find((e) => e.variants.some((v) => v.id === l.variantId))?.category).filter((c): c is Category => !!c));
}

/** Anneau de progression : valeur réelle uniquement. */
function Ring({ value, label }: { value: number; label: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={label}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

export function Today({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const [open, setOpen] = useState<{ row: SessionSummaryRow; done: number; total: number } | undefined>();
  const [recent, setRecent] = useState<SessionSummaryRow[]>([]);
  const [templates, setTemplates] = useState<SessionTemplate[] | null>(null);
  const [lastByTemplate, setLastByTemplate] = useState<Map<string, number>>(new Map());
  const [cat, setCat] = useState<Category | null>(null);
  const [starting, setStarting] = useState(false);
  const tz = deviceTimeZone();

  useEffect(() => {
    (async () => {
      const row = await repo.openSession();
      if (row) {
        const st = project(await repo.sessionEvents(row.id));
        if (st) setOpen({ row, done: st.sets.filter((s) => s.status !== 'pending').length, total: st.sets.length });
      }
      const list = await repo.listSessions();
      setRecent(list.filter((s) => s.outcome !== 'in_progress').slice(0, 3));
      const last = new Map<string, number>();
      for (const s of list) if (!last.has(s.title)) last.set(s.title, s.startedAt);
      setLastByTemplate(last);
      setTemplates(await loadTemplates(repo));
    })();
  }, [repo]);

  const shown = useMemo(() => (templates ?? []).filter((t) => !cat || categoriesOf(t).has(cat)), [templates, cat]);

  const start = async (t: SessionTemplate) => {
    if (starting) return;
    setStarting(true);
    try {
      go({ name: 'session', id: await startSessionFromTemplate(repo, t) });
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <p className="greeting">Salut Hmidou</p>
      <p className="greeting-sub">{open ? 'Ta séance t’attend.' : 'Voici ta prochaine action.'}</p>

      {open && (
        <button className="item" onClick={() => go({ name: 'session', id: open.row.id })}>
          <div className="thumb">
            <Scene kind="gym">
              <CharacterArt size={56} />
            </Scene>
          </div>
          <div className="grow">
            <div className="tag">Séance en cours</div>
            <div className="name">{open.row.title}</div>
            <div className="meta">Commencée {fmtDateTime(open.row.startedAt, tz)}</div>
          </div>
          <Ring value={open.total ? open.done / open.total : 0} label={`${open.done} séries sur ${open.total} faites ou passées`} />
        </button>
      )}

      <ChallengeCard repo={repo} onOpen={() => go({ name: 'challenge' })} />

      <div className="section-head">
        <h2>Catégories</h2>
        {cat && (
          <button className="link" onClick={() => setCat(null)}>
            Tout afficher
          </button>
        )}
      </div>
      <div className="cats" role="group" aria-label="Filtrer par catégorie">
        {CATEGORIES.map((c) => (
          <button key={c.id} className="cat" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>
            <span className="bubble" style={{ position: 'relative' }}>
              <Scene kind={c.scene}>
                <CharacterArt size={54} />
              </Scene>
            </span>
            {c.label}
          </button>
        ))}
        <button className="cat" aria-disabled="true" onClick={() => go({ name: 'progress' })} title="Module course non implémenté">
          <span className="bubble" style={{ position: 'relative' }}>
            <Scene kind="outdoor" />
          </span>
          Course (bientôt)
        </button>
      </div>

      <div className="section-head">
        <h2>Mes séances</h2>
        <button className="link" onClick={() => go({ name: 'program' })}>
          Gérer
        </button>
      </div>
      {templates && templates.length === 0 && (
        <div className="card">
          <p>Aucune séance n’est encore préparée.</p>
          <button className="btn primary block" onClick={() => go({ name: 'program' })}>
            Préparer ma première séance
          </button>
        </div>
      )}
      {templates && templates.length > 0 && shown.length === 0 && <p className="muted">Aucune séance dans cette catégorie.</p>}
      <div className="featured">
        {shown.map((t, i) => {
          const sets = t.lines.reduce((n, l) => n + l.sets, 0);
          const last = lastByTemplate.get(t.title);
          const first = findVariant(t.lines[0]?.variantId ?? '');
          return (
            <button key={t.id} className="feature" disabled={starting || !!open} onClick={() => start(t)} aria-label={`Commencer ${t.title}`}>
              <Scene kind={i % 2 === 0 ? 'gym' : 'outdoor'}>
                <CharacterArt size={170} />
              </Scene>
              <div className="shade" />
              <span className="pill">{first?.exercise.name ?? 'Séance'}</span>
              <div className="info">
                <div className="title">{t.title}</div>
                <div className="stats">
                  <div className="stat">
                    <div className="v">{t.lines.length}</div>
                    <div className="l">
                      <Dumbbell size={11} aria-hidden="true" /> exercices
                    </div>
                  </div>
                  <div className="stat">
                    <div className="v">{sets}</div>
                    <div className="l">
                      <Layers size={11} aria-hidden="true" /> séries
                    </div>
                  </div>
                  <div className="stat">
                    <div className="v">{last ? new Intl.DateTimeFormat('fr-BE', { day: '2-digit', month: '2-digit', timeZone: tz }).format(last) : '—'}</div>
                    <div className="l">
                      <Repeat size={11} aria-hidden="true" /> dernière fois
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {open && templates && templates.length > 0 && <p className="muted">Termine la séance en cours avant d’en commencer une autre.</p>}

      {recent.length > 0 && (
        <>
          <div className="section-head">
            <h2>Dernières séances</h2>
            <button className="link" onClick={() => go({ name: 'progress' })}>
              Tout voir
            </button>
          </div>
          {recent.map((r) => (
            <button key={r.id} className="item" onClick={() => go({ name: 'summary', id: r.id })}>
              <div className="thumb">
                <Scene kind="gym">
                  <CharacterArt size={56} />
                </Scene>
              </div>
              <div className="grow">
                <div className="name">{r.title}</div>
                <div className="meta">{fmtDateTime(r.startedAt, tz)}</div>
              </div>
              <OutcomeBadge outcome={r.outcome} />
            </button>
          ))}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <NotBuilt title="Planning de la semaine" phase="phase 1 (suite)">
          Il viendra après l’onboarding (horaires, trajets, disponibilités).
        </NotBuilt>
      </div>
      {!open && templates && templates.length > 0 && (
        <p className="muted" style={{ textAlign: 'center' }}>
          <Play size={14} aria-hidden="true" /> Touche une carte pour commencer la séance.
        </p>
      )}
    </>
  );
}

function ChallengeCard({ repo, onOpen }: { repo: Repository; onOpen: () => void }) {
  const { entries } = useChallengeEntries(repo);
  const today = localDay(Date.now(), deviceTimeZone());
  const before = today < NOVEMBER_2026.start;
  const after = today > NOVEMBER_2026.end;
  const daysLeft = Math.round((Date.parse(`${NOVEMBER_2026.start}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const done = NOVEMBER_2026.daily.filter((h) => habitStatus(h, entries[today]) === 'done').length;
  return (
    <button className="item" onClick={onOpen}>
      <div className="thumb">
        <Scene kind="outdoor">
          <CharacterArt size={56} />
        </Scene>
      </div>
      <div className="grow">
        <div className="tag">Défi</div>
        <div className="name">{NOVEMBER_2026.title}</div>
        <div className="meta">
          {before ? `Commence dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}` : after ? 'Terminé : voir le bilan' : entries[today] ? `Aujourd’hui : ${done}/${NOVEMBER_2026.daily.length} habitudes tenues` : 'Aujourd’hui : non renseigné'}
        </div>
      </div>
    </button>
  );
}
