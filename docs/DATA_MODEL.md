# Modèle de données (v1)

## Événements de séance (`src/engine/types.ts`)
`session_started` (plan figé + fuseau), `set_started`, `set_ended`, `set_result_recorded`, `result_undone`,
`set_skipped`, `interruption_started` / `interruption_ended`, `pain_reported`, `session_ended`.
Chaque événement : `id` (UUID, clé d'idempotence), `sessionId`, `at` (UTC ms). Stocké avec `seq` et `savedAt`.

## Règles
- Un événement déjà connu (même `id`) est ignoré : pas de doublon au rejeu ni à l'import.
- Le plan prévu est copié dans `session_started` : modifier un modèle ne change jamais une séance passée.
- Résultat absent = inconnu. Bilan : « — » et compteur de résultats manquants.
- Corrections après la fin de séance autorisées, toujours sous forme d'événement.

## Export
`{ format: "coach-app-export", version: 1, exportedAt, events[], kv[] }`. L'import refuse un format inconnu ou une version plus récente.

## Profil et planning (clé-valeur locale)
- `onboarding` : `{ step, answers, completedAt? }`, enregistré à chaque saisie. Valeurs corporelles `{ value?, status: mesuré | déclaré | estimé | inconnu, at }`.
- `goals` : versions successives `{ version, at, reason, main, secondary, description, why, measure, targetDate, limits }`. Jamais modifiées après coup.
- `planning.items` : `{ id, weekStart (lundi), day 0–6, start HH:MM, durationMin, kind, title, templateId?, moves[] }`.
  Les horaires fixes ne sont pas stockés : ils sont recalculés depuis l'onboarding.
  Champs ajoutés : `sessionId?` (lien), `adjustment? { reason, decision: adaptée | annulée | suspendue | remplacée, at, note? }`,
  `adapted? { lines, estimatedMin, removed[] }`, `moves[].reason?`. Statuts calculés : prévu, réalisé, adapté, partiel, annulé, suspendu, non confirmé.

## Coach, cibles et journée (clé-valeur locale)
- `program.answers` / `program.current` : réponses de l'entretien et programme validé `{ id, program (templates, week, weekly, rules, notes), answers, startWeek, at }`.
  Les éléments de planning créés portent `programId`, `km?`, `detail?` (contenu d'une course).
- `equipment.loadPieces` (pièces de lest combinables), `equipment.kettlebells` (une à la fois).
- `nutrition.answers` ; `dayplan.done.<jour>` (étapes cochées) ; `dayplan.eaten.<jour>` (imprévus de repas `{ label, kcal, protein }`).
- `proof.<jour>` : photos-preuves `{ habitId, photo (data URL réduite), takenAt, savedAt }`.
- `reading.books`, `reading.current`, `reading.log` (`fromPage → toPage`), `run.log` (`km, minutes?, effort?`), `measures.log`.
- `agenda.recurring` (événements récurrents), `planning.oneoffs` (indisponibilités datées), `agenda.trips` (`from, to, label, equipment[]`).
- `kitchen.foods` (produits : kcal/protéines pour 100 g, unité, code-barres, source), `kitchen.dishes` (ingrédients en g, portions), `shopping.<jour>` (articles cochés).
- `targets.sex` (repli ; la formule est dans `onboarding.answers.body.formulaSex`).

## À concevoir (phases suivantes)
Consentements versionnés, données Apple Santé (app native), notifications, séance plus longue que prévu.
