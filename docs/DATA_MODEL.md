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

## À concevoir (phases suivantes)
Profil, consentements, objectifs versionnés, mesures (statut mesuré/déclaré/estimé), planning, nutrition, course, règles versionnées, paliers du personnage.
