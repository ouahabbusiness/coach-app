import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GOAL_LABELS, goalChanges, type GoalCategory, type GoalVersion, type OnboardingAnswers, type Slot, type Valued, type ValueStatus } from '../engine/profile';
import { DAY_NAMES } from '../engine/planning';
import type { Repository } from '../storage/db';
import { Notice } from './common';
import { loadGoals, useOnboarding } from './profileStore';

type Setter = (fn: (a: OnboardingAnswers) => void) => void;

interface Step {
  id: string;
  title: string;
  todo: string;
  why: string;
  ifSkip: string;
  optional: boolean;
  canContinue?: (a: OnboardingAnswers) => boolean;
  render: (a: OnboardingAnswers, set: Setter) => ReactNode;
}

const EQUIPMENT = ['Barre fixe', 'Barres parallèles', 'Barre basse', 'Élastiques', 'Kettlebell', 'Haltères', 'Banc', 'Salle de sport', 'Tapis'];
const DAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/* ---------- Champs ---------- */

function Text({ label, hint, value, onChange, multiline }: { label: string; hint?: string; value?: string; onChange: (v: string | undefined) => void; multiline?: boolean }) {
  return (
    <label className="field">
      {label}
      {hint && <span className="hint">{hint}</span>}
      {multiline ? (
        <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
      ) : (
        <input value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
      )}
    </label>
  );
}

function Time({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <label className="field">
      {label}
      <input type="time" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
    </label>
  );
}

function Num({ label, unit, value, onChange }: { label: string; unit: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="field">
      {label} ({unit})
      <input type="number" inputMode="decimal" min={0} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
    </label>
  );
}

const STATUS_CHOICES: { v: ValueStatus; l: string }[] = [
  { v: 'mesuré', l: 'Mesuré' },
  { v: 'déclaré', l: 'De mémoire' },
  { v: 'estimé', l: 'Estimé' },
  { v: 'inconnu', l: 'Je ne sais pas' },
];

/** Valeur numérique avec son statut : une estimation reste marquée comme telle. */
function ValuedNum({ label, unit, v, onChange }: { label: string; unit: string; v: Valued<number>; onChange: (v: Valued<number>) => void }) {
  return (
    <div className="card soft stack" style={{ margin: 0 }}>
      <Num
        label={label}
        unit={unit}
        value={v.status === 'inconnu' ? undefined : v.value}
        onChange={(value) => onChange({ value, status: value === undefined ? 'inconnu' : v.status === 'inconnu' ? 'déclaré' : v.status, at: Date.now() })}
      />
      <div className="chips" role="group" aria-label={`Fiabilité : ${label}`}>
        {STATUS_CHOICES.map((c) => (
          <button
            key={c.v}
            className="chip"
            aria-pressed={v.status === c.v}
            onClick={() => onChange(c.v === 'inconnu' ? { status: 'inconnu', at: Date.now() } : { ...v, status: c.v, at: Date.now() })}
          >
            {c.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string>({ label, options, selected, onToggle }: { label: string; options: { v: T; l: string }[]; selected: T[]; onToggle: (v: T) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 500, marginBottom: 6 }}>{label}</legend>
      <div className="chips">
        {options.map((o) => (
          <button key={o.v} className="chip" aria-pressed={selected.includes(o.v)} onClick={() => onToggle(o.v)}>
            {o.l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

const GOAL_OPTIONS = (Object.keys(GOAL_LABELS) as GoalCategory[]).map((v) => ({ v, l: GOAL_LABELS[v] }));

/* ---------- Étapes ---------- */

export const STEPS: Step[] = [
  {
    id: 'coach',
    title: 'Ton coach et ses limites',
    todo: 'Lis ce que l’app fait et ne fait pas, puis confirme.',
    why: 'Pour que tu saches sur quoi t’appuyer et quand demander l’avis d’un professionnel.',
    ifSkip: 'Cette étape est nécessaire pour continuer.',
    optional: false,
    canContinue: (a) => !!a.coachAck,
    render: (a, set) => (
      <>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
          <li>Elle t’accompagne : séances, chronos, suivi, défis, planning.</li>
          <li>Elle ne pose aucun diagnostic et ne remplace ni médecin, ni kiné, ni diététicien.</li>
          <li>Elle n’invente pas de résultats : sans donnée, elle affiche « inconnu ».</li>
          <li>Ses règles de progression ne sont pas encore relues par un professionnel.</li>
        </ul>
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={!!a.coachAck} onChange={(e) => set((x) => void (x.coachAck = e.target.checked))} />
          J’ai compris
        </label>
      </>
    ),
  },
  {
    id: 'privacy',
    title: 'Confidentialité',
    todo: 'Prends connaissance de l’endroit où tes données sont stockées.',
    why: 'Tes informations de santé sont sensibles : tu dois savoir où elles vont.',
    ifSkip: 'Cette étape est nécessaire pour continuer.',
    optional: false,
    canContinue: (a) => !!a.privacyAck,
    render: (a, set) => (
      <>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
          <li>Tout reste sur cet appareil, dans le navigateur. Pas de compte, pas de serveur.</li>
          <li>Rien n’est envoyé à une IA ou à un tiers.</li>
          <li>Tu peux exporter tes données à tout moment (Réglages). Fais-le régulièrement : le navigateur peut effacer les données d’un site peu utilisé.</li>
        </ul>
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={!!a.privacyAck} onChange={(e) => set((x) => void (x.privacyAck = e.target.checked))} />
          C’est clair pour moi
        </label>
      </>
    ),
  },
  {
    id: 'devices',
    title: 'Appareils et applications',
    todo: 'Indique ton iPhone, ta montre et les apps que tu utilises déjà.',
    why: 'Pour préparer les connexions de la future app native et éviter les doublons de saisie.',
    ifSkip: 'Rien ne change pour l’instant : la version web ne se connecte à aucun appareil.',
    optional: true,
    render: (a, set) => (
      <>
        <Notice tone="warn">
          Connexion à Apple Santé et à l’Apple Watch : <strong>non disponible dans cette version web</strong>. Elle est prévue dans l’app native. Aucun mot de passe Apple ne te sera demandé ici.
        </Notice>
        <Text label="Modèle d’iPhone" hint="Réglages → Général → Informations" value={a.devices.iphone} onChange={(v) => set((x) => void (x.devices.iphone = v))} />
        <Text label="Modèle d’Apple Watch" hint="App Watch → Général → Informations" value={a.devices.watch} onChange={(v) => set((x) => void (x.devices.watch = v))} />
        <Text label="Applications sport ou nutrition utilisées" value={a.devices.apps} onChange={(v) => set((x) => void (x.devices.apps = v))} />
      </>
    ),
  },
  {
    id: 'body',
    title: 'Profil physique',
    todo: 'Renseigne ce que tu connais et précise d’où vient chaque valeur.',
    why: 'Pour suivre une évolution réelle. Une valeur de mémoire ou estimée reste marquée comme telle.',
    ifSkip: 'Tu pourras ajouter ces mesures plus tard. Rien n’est deviné à ta place.',
    optional: true,
    render: (a, set) => (
      <>
        <ValuedNum label="Âge" unit="ans" v={a.body.age} onChange={(v) => set((x) => void (x.body.age = v))} />
        <ValuedNum label="Taille" unit="cm" v={a.body.heightCm} onChange={(v) => set((x) => void (x.body.heightCm = v))} />
        <ValuedNum label="Poids" unit="kg" v={a.body.weightKg} onChange={(v) => set((x) => void (x.body.weightKg = v))} />
        <ValuedNum label="Tour de taille" unit="cm" v={a.body.waistCm} onChange={(v) => set((x) => void (x.body.waistCm = v))} />
        <details>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Comment mesurer de façon comparable ?</summary>
          <p className="muted" style={{ marginTop: 8 }}>
            Le plus important est de mesurer toujours de la même façon : même moment de la journée (par exemple le matin, avant de manger), même balance, ruban à l’horizontale au même endroit. Une mesure isolée compte moins que la tendance.
          </p>
        </details>
      </>
    ),
  },
  {
    id: 'history',
    title: 'Historique sportif et niveau',
    todo: 'Raconte ce que tu as pratiqué et depuis quand tu as arrêté.',
    why: 'Pour ne pas partir de tes anciennes performances comme si elles étaient actuelles.',
    ifSkip: 'Ton niveau sera établi pendant la phase de calibration.',
    optional: true,
    render: (a, set) => (
      <>
        <Text label="Sports pratiqués" multiline value={a.history.sports} onChange={(v) => set((x) => void (x.history.sports = v))} />
        <Text label="Depuis combien de temps as-tu arrêté ?" hint="ex. 6 mois, 2 ans, je n’ai jamais vraiment arrêté" value={a.history.breakDuration} onChange={(v) => set((x) => void (x.history.breakDuration = v))} />
        <Text label="Course à pied : ce que tu faisais avant" multiline value={a.history.runningBefore} onChange={(v) => set((x) => void (x.history.runningBefore = v))} />
        <ValuedNum label="Tractions strictes d’affilée aujourd’hui" unit="rép." v={a.history.pullupsMax} onChange={(v) => set((x) => void (x.history.pullupsMax = v))} />
        <ValuedNum label="Pompes d’affilée aujourd’hui" unit="rép." v={a.history.pushupsMax} onChange={(v) => set((x) => void (x.history.pushupsMax = v))} />
        <p className="muted" style={{ margin: 0 }}>Ne fais pas de test maximal maintenant pour répondre : « Je ne sais pas » est une bonne réponse.</p>
      </>
    ),
  },
  {
    id: 'safety',
    title: 'Douleurs, restrictions et sécurité',
    todo: 'Signale toute douleur actuelle, blessure récente ou contre-indication connue.',
    why: 'Pour adapter les exercices et savoir quand l’avis d’un professionnel est nécessaire.',
    ifSkip: 'L’app considérera qu’aucune restriction n’est connue. Tu pourras compléter à tout moment.',
    optional: true,
    render: (a, set) => (
      <>
        <Text label="Douleurs actuelles ou récentes" multiline value={a.safety.pains} onChange={(v) => set((x) => void (x.safety.pains = v))} />
        <Text label="Restrictions ou contre-indications connues" multiline value={a.safety.restrictions} onChange={(v) => set((x) => void (x.safety.restrictions = v))} />
        <Chips
          label="Es-tu suivi par un médecin ou un kiné pour un problème qui touche le sport ?"
          options={[
            { v: 'oui', l: 'Oui' },
            { v: 'non', l: 'Non' },
            { v: 'je_ne_sais_pas', l: 'Je ne sais pas' },
          ]}
          selected={a.safety.medicalFollowUp ? [a.safety.medicalFollowUp] : []}
          onToggle={(v) => set((x) => void (x.safety.medicalFollowUp = x.safety.medicalFollowUp === v ? undefined : v))}
        />
        {(a.safety.pains || a.safety.restrictions) && (
          <Notice tone="warn">
            L’app ne pose aucun diagnostic. Pour une douleur qui persiste, revient à l’effort ou t’inquiète, demande l’avis d’un médecin ou d’un kiné avant d’intensifier.
          </Notice>
        )}
      </>
    ),
  },
  {
    id: 'goal',
    title: 'Objectif principal et échéance',
    todo: 'Choisis UN objectif principal, éventuellement des secondaires, et une date souhaitée.',
    why: 'Pour orienter le programme. On ne peut pas progresser au maximum partout en même temps.',
    ifSkip: 'Sans objectif, l’app propose seulement de construire une régularité.',
    optional: true,
    render: (a, set) => (
      <>
        <Chips label="Objectif principal" options={GOAL_OPTIONS} selected={a.goal.main ? [a.goal.main] : []} onToggle={(v) => set((x) => void (x.goal.main = x.goal.main === v ? undefined : v))} />
        <Chips
          label="Objectifs secondaires (facultatif)"
          options={GOAL_OPTIONS.filter((o) => o.v !== a.goal.main)}
          selected={a.goal.secondary}
          onToggle={(v) => set((x) => void (x.goal.secondary = toggle(x.goal.secondary, v)))}
        />
        {a.goal.secondary.length >= 2 && (
          <Notice tone="warn">L’objectif principal passera en premier : les secondaires avanceront moins vite.</Notice>
        )}
        <Text label="Ce que tu veux changer, concrètement" hint="ex. faire 10 tractions strictes, courir 10 km sans marcher" multiline value={a.goal.description} onChange={(v) => set((x) => void (x.goal.description = v))} />
        <Text label="Pourquoi c’est important pour toi" multiline value={a.goal.why} onChange={(v) => set((x) => void (x.goal.why = v))} />
        <Text label="Comment on saura que c’est atteint" value={a.goal.measure} onChange={(v) => set((x) => void (x.goal.measure = v))} />
        <label className="field">
          Date souhaitée
          <span className="hint">C’est ta date. L’app ne la déplacera jamais sans te le dire.</span>
          <input type="date" value={a.goal.targetDate ?? ''} onChange={(e) => set((x) => void (x.goal.targetDate = e.target.value || undefined))} />
        </label>
        <Text label="Limites à respecter" hint="ex. pas plus de 4 séances par semaine" value={a.goal.limits} onChange={(v) => set((x) => void (x.goal.limits = v))} />
      </>
    ),
  },
  {
    id: 'equipment',
    title: 'Matériel et espace',
    todo: 'Coche le matériel auquel tu as réellement accès.',
    why: 'Pour ne te proposer que des exercices faisables.',
    ifSkip: 'L’app supposera que tu n’as aucun matériel.',
    optional: true,
    render: (a, set) => (
      <>
        <Chips label="Matériel disponible" options={EQUIPMENT.map((v) => ({ v, l: v }))} selected={a.equipment.items} onToggle={(v) => set((x) => void (x.equipment.items = toggle(x.equipment.items, v)))} />
        {a.equipment.items.includes('Kettlebell') && (
          <Text label="Poids des kettlebells" hint="ex. 12 et 16 kg" value={a.equipment.kettlebellKg} onChange={(v) => set((x) => void (x.equipment.kettlebellKg = v))} />
        )}
        <Text label="Lieux et précisions" hint="ex. parc à 10 min, barre fixe à la maison" multiline value={a.equipment.notes} onChange={(v) => set((x) => void (x.equipment.notes = v))} />
      </>
    ),
  },
  {
    id: 'food',
    title: 'Préférences alimentaires',
    todo: 'Indique tes restrictions et allergies, ou reporte cette étape.',
    why: 'Le module nutrition arrive en phase 2 : ces réponses l’alimenteront.',
    ifSkip: 'Aucune conséquence aujourd’hui : la nutrition n’est pas encore active.',
    optional: true,
    render: (a, set) => (
      <>
        <Text label="Restrictions (religieuses, végétarien…)" value={a.food.restrictions} onChange={(v) => set((x) => void (x.food.restrictions = v))} />
        <Text label="Allergies ou intolérances" value={a.food.allergies} onChange={(v) => set((x) => void (x.food.allergies = v))} />
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={!!a.food.later} onChange={(e) => set((x) => void (x.food.later = e.target.checked))} />
          Configurer plus tard
        </label>
      </>
    ),
  },
  {
    id: 'schedule',
    title: 'Travail, trajets et semaine',
    todo: 'Indique tes jours et horaires de travail, et le temps de trajet.',
    why: 'Pour placer tes séances dans des créneaux réalistes et signaler les conflits.',
    ifSkip: 'Le planning n’affichera aucun horaire fixe : tu placeras tout à la main.',
    optional: true,
    render: (a, set) => (
      <>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 500, marginBottom: 6 }}>Jours de travail</legend>
          <div className="chips">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} className="chip" aria-label={DAY_NAMES[i]} aria-pressed={a.schedule.workDays.includes(i)} onClick={() => set((x) => void (x.schedule.workDays = toggle(x.schedule.workDays, i).sort()))}>
                {d}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid2">
          <Time label="Début" value={a.schedule.workStart} onChange={(v) => set((x) => void (x.schedule.workStart = v))} />
          <Time label="Fin" value={a.schedule.workEnd} onChange={(v) => set((x) => void (x.schedule.workEnd = v))} />
        </div>
        <Num label="Trajet (un sens)" unit="min" value={a.schedule.commuteMin} onChange={(v) => set((x) => void (x.schedule.commuteMin = v))} />
        <Text label="Week-end et exceptions" hint="ex. le samedi je travaille le matin" multiline value={a.schedule.weekendNotes} onChange={(v) => set((x) => void (x.schedule.weekendNotes = v))} />
      </>
    ),
  },
  {
    id: 'sleep',
    title: 'Sommeil et disponibilités',
    todo: 'Indique tes heures habituelles de coucher et de lever, et tes créneaux préférés.',
    why: 'Pour protéger ton sommeil dans le planning et viser des créneaux que tu tiendras.',
    ifSkip: 'Le planning ne connaîtra pas tes heures de sommeil.',
    optional: true,
    render: (a, set) => (
      <>
        <div className="grid2">
          <Time label="Coucher habituel" value={a.sleep.bedtime} onChange={(v) => set((x) => void (x.sleep.bedtime = v))} />
          <Time label="Lever habituel" value={a.sleep.wake} onChange={(v) => set((x) => void (x.sleep.wake = v))} />
        </div>
        <Chips<Slot>
          label="Créneaux préférés pour t’entraîner"
          options={[
            { v: 'matin', l: 'Matin' },
            { v: 'midi', l: 'Midi' },
            { v: 'soir', l: 'Soir' },
          ]}
          selected={a.sleep.preferredSlots}
          onToggle={(v) => set((x) => void (x.sleep.preferredSlots = toggle(x.sleep.preferredSlots, v)))}
        />
        <div className="grid2">
          <Num label="Séances par semaine que tu peux tenir" unit="nb" value={a.sleep.sessionsPerWeek} onChange={(v) => set((x) => void (x.sleep.sessionsPerWeek = v))} />
          <Num label="Durée d’une séance" unit="min" value={a.sleep.sessionMinutes} onChange={(v) => set((x) => void (x.sleep.sessionMinutes = v))} />
        </div>
      </>
    ),
  },
  {
    id: 'coaching',
    title: 'Style de coaching',
    todo: 'Choisis le ton du coach.',
    why: 'Tu as demandé un accompagnement ferme : il reste factuel et jamais humiliant.',
    ifSkip: 'Ton par défaut : ferme.',
    optional: true,
    render: (a, set) => (
      <>
        <Chips
          label="Ton"
          options={[
            { v: 'ferme', l: 'Ferme' },
            { v: 'neutre', l: 'Neutre' },
            { v: 'doux', l: 'Doux' },
          ]}
          selected={[a.coaching.tone ?? 'ferme']}
          onToggle={(v) => set((x) => void (x.coaching.tone = v))}
        />
        <Notice>Notifications et mode strict : non disponibles dans cette version. Ils seront configurés ici quand ils existeront.</Notice>
      </>
    ),
  },
];

/* ---------- Récapitulatif ---------- */

function fmtDate(d: string) {
  return new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
}

function fmtValued(v: Valued<number>, unit: string) {
  return v.status === 'inconnu' || v.value === undefined ? 'inconnu' : `${v.value} ${unit} (${v.status})`;
}

function Recap({ a, goTo }: { a: OnboardingAnswers; goTo: (i: number) => void }) {
  const idx = (id: string) => STEPS.findIndex((s) => s.id === id);
  const rows: { id: string; label: string; value: string }[] = [
    { id: 'devices', label: 'Appareils', value: [a.devices.iphone, a.devices.watch].filter(Boolean).join(' · ') || 'non renseigné' },
    { id: 'body', label: 'Profil', value: `Âge ${fmtValued(a.body.age, 'ans')} · taille ${fmtValued(a.body.heightCm, 'cm')} · poids ${fmtValued(a.body.weightKg, 'kg')}` },
    { id: 'history', label: 'Historique', value: `Arrêt : ${a.history.breakDuration ?? 'non renseigné'} · tractions ${fmtValued(a.history.pullupsMax, 'rép.')} · pompes ${fmtValued(a.history.pushupsMax, 'rép.')}` },
    { id: 'safety', label: 'Sécurité', value: a.safety.pains || a.safety.restrictions ? [a.safety.pains, a.safety.restrictions].filter(Boolean).join(' · ') : 'aucune restriction signalée' },
    { id: 'goal', label: 'Objectif', value: a.goal.main ? `${GOAL_LABELS[a.goal.main]}${a.goal.targetDate ? ` · pour le ${fmtDate(a.goal.targetDate)}` : ' · sans date'}` : 'non défini' },
    { id: 'equipment', label: 'Matériel', value: a.equipment.items.join(', ') || 'aucun' },
    { id: 'food', label: 'Alimentation', value: a.food.later ? 'plus tard' : [a.food.restrictions, a.food.allergies].filter(Boolean).join(' · ') || 'non renseigné' },
    {
      id: 'schedule',
      label: 'Travail',
      value: a.schedule.workDays.length ? `${a.schedule.workDays.map((d) => DAYS_SHORT[d]).join(' ')} · ${a.schedule.workStart ?? '?'}–${a.schedule.workEnd ?? '?'}` : 'non renseigné',
    },
    { id: 'sleep', label: 'Sommeil', value: a.sleep.bedtime && a.sleep.wake ? `${a.sleep.bedtime} → ${a.sleep.wake}` : 'non renseigné' },
    { id: 'coaching', label: 'Ton', value: a.coaching.tone ?? 'ferme' },
  ];
  return (
    <div className="stack">
      {rows.map((r) => (
        <div key={r.id} className="spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <strong>{r.label}</strong>
            <div className="muted" style={{ fontSize: '0.9rem' }}>{r.value}</div>
          </div>
          <button className="btn ghost" onClick={() => goTo(idx(r.id))}>
            Modifier
          </button>
        </div>
      ))}
      <div className="card soft" style={{ margin: 0 }}>
        <h3>Ensuite : calibration</h3>
        <p className="muted" style={{ margin: 0 }}>
          Les premières séances servent à observer ton niveau réel, sans test maximal. Aucune progression automatique n’est appliquée tant que
          les règles ne sont pas validées. (Règle produit, pas une recommandation scientifique.)
        </p>
      </div>
    </div>
  );
}

/* ---------- Écran ---------- */

export function Onboarding({ repo, onExit }: { repo: Repository; onExit: () => void }) {
  const { state, save, complete } = useOnboarding(repo);
  const [showWhy, setShowWhy] = useState(false);
  const [lastGoal, setLastGoal] = useState<GoalVersion | undefined>();
  const [reason, setReason] = useState('');
  useEffect(() => {
    loadGoals(repo).then((g) => setLastGoal(g[g.length - 1]));
  }, [repo]);
  if (!state) return <p style={{ padding: 16 }}>Chargement…</p>;

  const total = STEPS.length + 1;
  const isRecap = state.step >= STEPS.length;
  const step = STEPS[Math.min(state.step, STEPS.length - 1)]!;
  const a = state.answers;
  const set: Setter = (fn) => {
    const next = structuredClone(a);
    fn(next);
    save({ ...state, answers: next });
  };
  const goTo = (i: number) => {
    setShowWhy(false);
    save({ ...state, step: Math.max(0, Math.min(STEPS.length, i)) });
    window.scrollTo(0, 0);
  };
  const blocked = !isRecap && step.canContinue && !step.canContinue(a);
  // Un objectif modifié n'est jamais changé discrètement : la raison est demandée et conservée.
  const goalChanged = !!lastGoal && goalChanges(lastGoal, a.goal).length > 0;

  return (
    <div className="app">
      <main className="content" style={{ paddingBottom: 140 }}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="muted" style={{ fontWeight: 600 }}>
            Étape {Math.min(state.step + 1, total)} / {total}
          </span>
          <button className="btn ghost" onClick={onExit}>
            Plus tard
          </button>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 20 }} aria-hidden="true">
          <div style={{ width: `${((state.step + 1) / total) * 100}%`, height: '100%', background: 'var(--accent)' }} />
        </div>

        {isRecap ? (
          <>
            <h1>Récapitulatif</h1>
            <p className="muted">Vérifie et modifie ce qui doit l’être. Tout reste modifiable ensuite depuis Réglages.</p>
            <div className="card">
              <Recap a={a} goTo={goTo} />
            </div>
            {goalChanged && (
              <div className="card stack">
                <Notice tone="warn">Ton objectif a changé par rapport à la version {lastGoal!.version}. L’ancienne version reste dans l’historique.</Notice>
                <label className="field">
                  Pourquoi ce changement ?
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. échéance trop courte, priorité changée" />
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            <h1>{step.title}</h1>
            <p style={{ fontWeight: 500 }}>{step.todo}</p>
            <button className="btn ghost" style={{ paddingLeft: 0 }} aria-expanded={showWhy} onClick={() => setShowWhy(!showWhy)}>
              Pourquoi on te le demande ?
            </button>
            {showWhy && (
              <div className="notice">
                <div>
                  <p style={{ margin: 0 }}>{step.why}</p>
                  <p className="muted" style={{ margin: '6px 0 0' }}>Si tu passes : {step.ifSkip}</p>
                </div>
              </div>
            )}
            <div className="card stack">{step.render(a, set)}</div>
            <p className="muted" style={{ fontSize: '0.85rem' }}>Tes réponses sont enregistrées au fur et à mesure.</p>
          </>
        )}
      </main>

      <div className="controls">
        <button className="btn side" aria-label="Étape précédente" disabled={state.step === 0} onClick={() => goTo(state.step - 1)}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        {isRecap ? (
          <button
            className="btn dark main"
            disabled={goalChanged && reason.trim() === ''}
            onClick={async () => {
              await complete(a, lastGoal ? reason.trim() || 'relecture sans changement' : 'onboarding');
              onExit();
            }}
          >
            Terminer la configuration
          </button>
        ) : (
          <button className="btn dark main" disabled={blocked} onClick={() => goTo(state.step + 1)}>
            Continuer <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}
        {!isRecap && step.optional ? (
          <button className="btn side" aria-label="Passer cette étape" onClick={() => goTo(state.step + 1)} style={{ fontSize: '0.8rem', width: 'auto', padding: '0 12px' }}>
            Passer
          </button>
        ) : (
          <span style={{ width: 56 }} />
        )}
      </div>
    </div>
  );
}
