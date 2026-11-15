# Ippo — coach IA (v0)

Date : 15/11/2026 · Branche : `feat/ippo-coach-v0` · Non publié.

## Ce qui est livré

Un écran **Ippo** (coach IA) branché sur les données réelles de l'app :

- contexte compact construit à chaque message : profil, objectif, programme, 8 dernières séances (détail des 4 plus récentes), poids et tendance, apports du jour, sommeil/pas récents, douleurs déclarées, manques ;
- prompt avec garde-fous (pas de diagnostic, pas de chiffre inventé, `null` = inconnu, réponse courte et actionnable) ;
- fournisseur **compatible OpenAI** (DeepSeek par défaut), clé stockée localement, bouton « Tester la clé » ;
- **mode démo** sans clé : réponses déterministes à partir des données, clairement étiquetées « démo » — jamais présentées comme une réponse d'IA ;
- historique du chat local (60 messages max), écran accessible depuis l'en-tête (icône bulle) et depuis l'onglet Coach.

## Parcours

1. En-tête (toutes les pages) → icône bulle, ou Coach → « Parler à Ippo ».
2. Sans clé : mode démo, bandeau explicite.
3. Réglages Ippo → adresse du fournisseur, modèle, clé → « Tester la clé » → « Enregistrer ».
4. Premier message avec une clé : une fenêtre d'accord affiche **ce qui part, vers quel hôte**. Sans accord, rien n'est envoyé.

## Données réellement envoyées

Un résumé JSON, jamais la base brute :

| Champ | Contenu |
|---|---|
| `profile` | âge, taille, poids (dernière pesée ou déclaré), tour de taille, sexe de formule, ton |
| `goal` | objectif principal/secondaires, description, raison, échéance, limites |
| `program` | titre, durée, modèles (titres + nombre de lignes), règles |
| `sessions` | 8 dernières : jour, titre, issue, durée, séries faites/total (4 dernières), douleurs signalées |
| `weight` | dernière pesée, jour, tendance, delta |
| `nutrition` | kcal et protéines documentées du jour, journée complète ou non, restrictions |
| `days` | 5 derniers jours : sommeil, pas |
| `safety` | douleurs et restrictions déclarées |
| `gaps` | liste des données manquantes |

La clé API **n'est jamais** incluse : elle est retirée des exports JSON et ignorée à l'import. L'historique du chat, lui, est exporté (c'est une donnée utilisateur).

## Consentement

Nouveau flux `ai` dans `src/engine/privacy.ts` :

- hôte par défaut `api.deepseek.com` (déclaré, vérifié par `privacy.test.ts`) ;
- accord explicite avant le premier envoi, révocable (Réglages/Profil → confidentialité) ;
- en mode démo, aucun réseau.

## Limites assumées

- **Pas de serveur Ippo** : l'app appelle directement le fournisseur avec la clé de l'appareil. Toute personne ayant accès au navigateur (ou une faille XSS) peut lire cette clé. Acceptable pour un usage personnel, à remplacer par un proxy serveur.
- Pas encore de quota, de journal d'usage, ni de limitation de débit.
- Le modèle peut se tromper ; l'écran l'affiche et le prompt interdit les diagnostics.
- Aucun test sur iPhone réel, ni vérification visuelle automatisée (le sandbox de cette session bloque le lancement du navigateur).

## Architecture

```text
src/ippo/
  types.ts     types + configuration par défaut
  context.ts   buildCoachContext(repo) → instantané JSON, null si inconnu
  prompt.ts    garde-fous + assemblage des tours
  provider.ts  client OpenAI-compatible, erreurs lisibles, timeout
  demo.ts      réponses locales (mode démo)
src/ui/
  Ippo.tsx     écran, réglages, accord, historique
  ippo.css     palette Ippo (sombre, accent orange)
tests/ippo.test.ts
```

Le moteur de séance, le stockage et les règles existantes ne sont pas modifiés — seuls `App.tsx` (route + entrée), `CoachProgram.tsx` (bouton), `db.ts` (redaction export) et `privacy.ts` (flux `ai`) sont touchés.

## Vérifications

- `npx tsc --noEmit` : OK.
- `npx vitest run` : **375 tests passent** (dont 7 nouveaux).
- `npm run build` : OK.

## Étape suivante : backend Supabase

1. Auth (magic link) + `profiles`, `events` (journal append-only), `kv_docs`, `media` + RLS par utilisateur.
2. Synchro idempotente : `events.id` = clé primaire ; `kv` en last-write-wins ; conflits signalés, jamais écrasés en silence.
3. Edge Function `ippo-chat` : la clé du fournisseur reste côté serveur, vérification du JWT, quota par utilisateur, aucun log de contenu.
4. L'écran Ippo bascule sur l'Edge Function quand `VITE_SUPABASE_URL` est configurée ; le mode clé locale reste en secours.
