# Coach — règles de travail du projet

Application personnelle de coaching sportif pour Hmidou (francophone, Belgique). Communiquer en français, simplement.

## Principes non négociables
- Le journal d'événements (IndexedDB) est la source de vérité. L'état d'une séance est toujours recalculé par `project()`.
- Une valeur inconnue n'est jamais zéro. Une estimation n'est jamais affichée comme une mesure.
- Ne jamais écraser un résultat réel par la cible ; les corrections sont des événements (traçables, annulables).
- Aucun seuil physiologique, règle de progression ou consigne présentée comme validée sans source consultée et relecture professionnelle.
- Ne jamais afficher « synchronisé », « connecté » ou « testé » pour une fonction qui ne l'est pas. L'écran Réglages liste l'état réel.
- Pas de médias récupérés sur Internet ; pas de personnages sous droits d'auteur. Les personnages ont été retirés (docs/CHARACTER.md).
- Mode strict / défis : aucune punition, aucune privation, aucun dépassement dangereux récompensé.

## Stack
- PWA : Vite 5 + React 18 + TypeScript strict, Dexie (IndexedDB), Vitest. Node 18 (versions figées dans package.json).
- Étape suivante prévue : app native Swift via xtool (WSL), qui réimportera l'export JSON.

## Commandes
- `npm run dev` (port 5173), `npm test`, `npm run typecheck`, `npm run build`.

## Structure
- `src/engine/` moteur pur (types, session, derive) — tout changement ici passe d'abord par un test.
- `src/storage/` persistance et export/import.
- `src/catalog/` exercices (statut de relecture obligatoire).
- `src/ui/` interface ; couleurs uniquement via les tokens de `styles.css`.
- `docs/` décisions ; mettre à jour `docs/PROJECT_STATUS.md` à chaque étape.
