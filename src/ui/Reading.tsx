// Lecture : le livre en cours, en grand, et un journal « de la page X à la page Y ».
// Pas de couverture téléchargée sur Internet : couverture dessinée par l'app, ou photo prise par l'utilisateur.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, Camera, Check, ChevronLeft, Flame, Pencil, Plus, Trash2 } from 'lucide-react';
import { localDay } from '../engine/derive';
import { dailyKey, type DailyMetrics } from '../engine/daily';
import { DAILY_PAGES, currentPage, daysToFinish, isValidRange, lastDays, pagesOf, pagesOnDay, progress, readingStreak, type Book, type ReadingEntry } from '../engine/reading';
import type { Repository } from '../storage/db';
import { Modal } from './common';
import { saveProof, shrinkPhoto } from './Habits';
import { deviceTimeZone, newId } from './support';
import type { Route } from './App';

const BOOKS = 'reading.books';
const CURRENT = 'reading.current';
const LOG = 'reading.log';

export function useReading(repo: Repository) {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [log, setLog] = useState<ReadingEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      setBooks((await repo.getKv<Book[]>(BOOKS)) ?? []);
      setCurrentId(await repo.getKv<string>(CURRENT));
      setLog((await repo.getKv<ReadingEntry[]>(LOG)) ?? []);
      setReady(true);
    })();
  }, [repo]);

  const saveBooks = useCallback(
    async (next: Book[], current?: string) => {
      await repo.setKv(BOOKS, next);
      setBooks(next);
      if (current !== undefined) {
        await repo.setKv(CURRENT, current);
        setCurrentId(current);
      }
    },
    [repo],
  );

  // Le journal alimente les données du jour : 10 pages notées cochent « Lire » dans le défi.
  const saveLog = useCallback(
    async (next: ReadingEntry[], days: string[]) => {
      await repo.setKv(LOG, next);
      setLog(next);
      for (const day of new Set(days)) {
        const d = await repo.getKv<DailyMetrics>(dailyKey(day));
        const pages = pagesOnDay(next, day);
        await repo.setKv(dailyKey(day), { ...(d ?? {}), readPages: pages || undefined, updatedAt: Date.now() });
      }
    },
    [repo],
  );

  const book = books.find((b) => b.id === currentId && !b.finishedAt);
  return { ready, books, book, log, saveBooks, saveLog };
}

/** Palette et motif tirés du livre : thème dédié pour Atomic Habits, teinte stable sinon. */
function bookTheme(b: Pick<Book, 'title'>): { variant: 'atomic' | 'plain'; style: CSSProperties } {
  const t = b.title.toLowerCase();
  if (t.includes('atomic habits') || t.includes('un rien peut tout changer')) {
    return { variant: 'atomic', style: { '--paper': '#f5efe4', '--ink': '#1b1916', '--book': '#b4410f', '--book-soft': '#f6dfcc', '--cover': '#f8f3ea' } as CSSProperties };
  }
  const h = [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return { variant: 'plain', style: { '--paper': `hsl(${h} 30% 95%)`, '--ink': `hsl(${h} 25% 10%)`, '--book': `hsl(${h} 60% 32%)`, '--book-soft': `hsl(${h} 55% 88%)`, '--cover': `hsl(${h} 45% 22%)` } as CSSProperties };
}

/** Motif « 1 % » : des points qui grossissent, image des petites habitudes qui se cumulent. */
function CompoundDots() {
  const dots = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 7; c++) {
      const k = (r * 7 + c) / 41;
      dots.push(<circle key={`${r}-${c}`} cx={10 + c * 14} cy={10 + r * 14} r={0.8 + Math.pow(1.065, r * 7 + c) * 0.3} opacity={0.25 + k * 0.75} />);
    }
  return (
    <svg className="cover-dots" viewBox="0 0 104 90" aria-hidden="true">
      {dots}
    </svg>
  );
}

function Cover({ book, variant }: { book: Book; variant: 'atomic' | 'plain' }) {
  return (
    <div className="book3d" aria-hidden="true">
      <div className="book3d-pages" />
      <div className={`book3d-cover ${variant}`}>
        {book.cover ? (
          <img src={book.cover} alt="" />
        ) : (
          <>
            {variant === 'atomic' && <CompoundDots />}
            <div className="cover-title">{book.title}</div>
            {book.author && <div className="cover-author">{book.author}</div>}
          </>
        )}
      </div>
    </div>
  );
}

const int = (s: string) => (s.trim() === '' ? NaN : Number(s.trim()));
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function BookForm({ initial, onSave, onFinish }: { initial: Partial<Book>; onSave: (b: Partial<Book>) => void; onFinish?: () => void }) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [author, setAuthor] = useState(initial.author ?? '');
  const [total, setTotal] = useState(initial.totalPages ? String(initial.totalPages) : '');
  const [cover, setCover] = useState(initial.cover);
  const n = int(total);
  const valid = title.trim() !== '' && (total.trim() === '' || (Number.isInteger(n) && n > 0 && n < 5000));
  return (
    <div className="stack">
      <input aria-label="Titre" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="Auteur" placeholder="Auteur" value={author} onChange={(e) => setAuthor(e.target.value)} />
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input aria-label="Nombre de pages de ton édition" placeholder="Pages (ton édition)" type="text" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
        <span className="muted">p.</span>
      </div>
      <label className="chip" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
        <Camera size={14} aria-hidden="true" /> {cover ? 'Changer la photo' : 'Photo de mon livre'}
        <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setCover(await shrinkPhoto(e.target.files[0]))} />
      </label>
      {cover && (
        <button className="chip" style={{ alignSelf: 'flex-start' }} onClick={() => setCover(undefined)}>
          Couverture dessinée
        </button>
      )}
      <button className="btn primary block" disabled={!valid} onClick={() => valid && onSave({ title: title.trim(), author: author.trim() || undefined, totalPages: total.trim() ? n : undefined, cover })}>
        Enregistrer
      </button>
      {onFinish && (
        <button className="btn ghost block" onClick={onFinish}>
          <Check size={16} aria-hidden="true" /> Livre terminé
        </button>
      )}
    </div>
  );
}

export function Reading({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const today = localDay(Date.now(), deviceTimeZone());
  const { ready, books, book, log, saveBooks, saveLog } = useReading(repo);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<'edit' | 'new' | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [day, setDay] = useState(today);
  const [shot, setShot] = useState<File | undefined>();
  const [editFrom, setEditFrom] = useState(false);
  const toRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (logging) window.setTimeout(() => toRef.current?.focus(), 50);
  }, [logging]);
  const [err, setErr] = useState<string | null>(null);

  const page = book ? currentPage(log, book.id) : 0;
  const openLog = () => {
    setFrom(String(page));
    setTo('');
    setDay(today);
    setShot(undefined);
    setEditFrom(false);
    setErr(null);
    setLogging(true);
  };

  if (!ready) return null;

  const back = (
    <button className="icon-btn ghost" aria-label="Retour" onClick={() => go({ name: 'today' })}>
      <ChevronLeft size={18} aria-hidden="true" />
    </button>
  );

  if (!book) {
    const finished = books.filter((b) => b.finishedAt);
    return (
      <div className="book-page" style={bookTheme({ title: 'Atomic Habits' }).style}>
        <header className="book-top">
          {back}
          <span className="book-brand">Lecture</span>
          <span />
        </header>
        <section className="book-sheet">
          <p className="book-eyebrow">Livre en cours</p>
          <BookForm
            initial={books.length === 0 ? { title: 'Atomic Habits', author: 'James Clear' } : {}}
            onSave={(b) => {
              const nb: Book = { id: newId(), title: b.title!, author: b.author, totalPages: b.totalPages, cover: b.cover, startedAt: Date.now() };
              saveBooks([...books, nb], nb.id);
            }}
          />
        </section>
        {finished.length > 0 && (
          <section className="book-sheet">
            <p className="book-eyebrow">Terminés · {finished.length}</p>
            <div className="chips">
              {finished.map((b) => (
                <span key={b.id} className="pill">
                  <Check size={12} aria-hidden="true" /> {b.title}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  const theme = bookTheme(book);
  const pct = progress(book, page);
  const todayPages = pagesOnDay(log, today);
  const week = lastDays(log, today);
  const maxWeek = Math.max(DAILY_PAGES, ...week.map((d) => d.pages));
  const streak = readingStreak(log, today);
  const eta = daysToFinish(log, book, today);
  const entries = log.filter((e) => e.bookId === book.id).sort((a, b) => b.toPage - a.toPage);
  const f = int(from);
  const t = int(to);
  const validRange = isValidRange(f, t, book.totalPages) && day <= today;
  const ring = 2 * Math.PI * 26;

  return (
    <div className="book-page" style={theme.style}>
      <header className="book-top">
        {back}
        <span className="book-brand">Lecture</span>
        <button className="icon-btn ghost" aria-label="Modifier le livre" onClick={() => setEditing('edit')}>
          <Pencil size={16} aria-hidden="true" />
        </button>
      </header>

      <section className="book-hero">
        <Cover book={book} variant={theme.variant} />
        <h1 className="book-title">{book.title}</h1>
        {book.author && <p className="book-author">{book.author}</p>}
      </section>

      <section className="book-sheet book-progress">
        <div className="spread" style={{ alignItems: 'flex-end' }}>
          <div>
            <p className="book-eyebrow">Je suis à la page</p>
            <p className="book-page-num num">
              {page}
              <span> / {book.totalPages ?? '?'}</span>
            </p>
          </div>
          {pct !== undefined ? (
            <span className="pill num">{Math.round(pct * 100)} %</span>
          ) : (
            <button className="pill" onClick={() => setEditing('edit')}>
              + pages
            </button>
          )}
        </div>
        {pct !== undefined && (
          <div className="book-edge" aria-hidden="true">
            <span style={{ width: `${pct * 100}%` }} />
          </div>
        )}
        <div className="chips">
          <span className="pill num">
            <Flame size={12} aria-hidden="true" /> {streak} j
          </span>
          {eta !== undefined && eta > 0 && <span className="pill num">≈ fini dans {eta} j · estimation</span>}
        </div>
      </section>

      <section className="book-sheet book-today">
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--book-soft)" strokeWidth="6" />
          <circle
            className="book-ring"
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="var(--book)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={ring}
            strokeDashoffset={ring * (1 - Math.min(1, todayPages / DAILY_PAGES))}
            transform="rotate(-90 32 32)"
          />
          {todayPages >= DAILY_PAGES && <path d="M24 32 l6 6 l11 -12" fill="none" stroke="var(--book)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        <div className="grow">
          <p className="book-eyebrow">Aujourd’hui</p>
          <p className="book-today-num num">
            {todayPages} <span>/ {DAILY_PAGES} p.</span>
          </p>
        </div>
        <div className="book-week" aria-label="Pages des 7 derniers jours">
          {week.map((d) => (
            <span key={d.day} title={`${fmtDay(d.day)} · ${d.pages} p.`} className={d.day === today ? 'today' : ''}>
              <i style={{ height: `${(d.pages / maxWeek) * 100}%` }} />
            </span>
          ))}
        </div>
      </section>

      <button className="btn primary big block book-cta" onClick={openLog}>
        <BookOpen size={18} aria-hidden="true" /> J’ai lu
      </button>

      {entries.length > 0 && (
        <section className="book-sheet">
          <p className="book-eyebrow">Journal · {entries.length}</p>
          <ul className="book-log">
            {entries.map((e) => (
              <li key={e.id}>
                <span className="num">{fmtDay(e.day)}</span>
                <span className="num book-range">
                  p. {e.fromPage} → {e.toPage}
                </span>
                <span className="pill num">{pagesOf(e)} p.</span>
                <button className="btn ghost icon" aria-label={`Supprimer la lecture du ${e.day}`} onClick={() => window.confirm('Supprimer cette lecture ?') && saveLog(log.filter((x) => x.id !== e.id), [e.day])}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="btn ghost block" onClick={() => setEditing('new')}>
        <Plus size={16} aria-hidden="true" /> Autre livre
      </button>

      <Modal open={logging} onClose={() => setLogging(false)} title="J’ai lu">
        <div className="stack">
          <div className="book-range-input">
            <label>
              <span className="book-eyebrow">de la page</span>
              {editFrom ? (
                <input aria-label="De la page" type="text" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
              ) : (
                <span className="book-from num" role="button" tabIndex={-1} aria-label={`De la page ${from}, modifier`} onClick={() => setEditFrom(true)}>
                  {from}
                </span>
              )}
            </label>
            <span className="book-arrow" aria-hidden="true">→</span>
            <label>
              <span className="book-eyebrow">à la page</span>
              <input aria-label="À la page" type="text" inputMode="numeric" ref={toRef} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <p className="book-sum num" aria-live="polite">{validRange ? `= ${t - f} pages` : to.trim() ? (book.totalPages && t > book.totalPages ? `max ${book.totalPages}` : '—') : ' '}</p>
          <input aria-label="Date" type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} />
          <label className={`chip ${shot ? 'on' : ''}`} style={{ alignSelf: 'flex-start', cursor: 'pointer' }} aria-pressed={!!shot}>
            {shot ? <Check size={14} aria-hidden="true" /> : <Camera size={14} aria-hidden="true" />} Photo de la page
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setShot(e.target.files?.[0])} />
          </label>
          {err && <p className="hs-err" role="alert">{err}</p>}
          <button
            className="btn primary block"
            disabled={!validRange || !shot}
            onClick={async () => {
              if (!validRange || !shot) return;
              // Preuve exigée : la photo de la page atteinte, prise le jour même.
              const e = await saveProof(repo, day, 'read', shot);
              if (e) return setErr(e);
              await saveLog([...log, { id: newId(), bookId: book.id, day, fromPage: f, toPage: t, at: Date.now() }], [day]);
              setLogging(false);
            }}
          >
            Enregistrer
          </button>
        </div>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouveau livre' : 'Mon livre'}>
        {editing === 'edit' && (
          <BookForm
            initial={book}
            onSave={async (b) => {
              await saveBooks(books.map((x) => (x.id === book.id ? { ...x, ...b } : x)));
              setEditing(null);
            }}
            onFinish={async () => {
              await saveBooks(books.map((x) => (x.id === book.id ? { ...x, finishedAt: Date.now() } : x)));
              setEditing(null);
            }}
          />
        )}
        {editing === 'new' && (
          <BookForm
            initial={{}}
            onSave={async (b) => {
              const nb: Book = { id: newId(), title: b.title!, author: b.author, totalPages: b.totalPages, cover: b.cover, startedAt: Date.now() };
              await saveBooks([...books, nb], nb.id);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
