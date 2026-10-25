# État du projet — 26/10/2026

## Construit
- Moteur de séance événementiel (séries, maintiens, repos réel, interruptions, douleur, corrections, fin partielle).
- Stockage IndexedDB, reprise automatique d'une séance ouverte, export/import JSON.
- Interface façon maquettes : Aujourd'hui (défi, catégories, cartes de séances, dernières séances), Programme (modèles),
  mode séance (chrono à points, barre de contrôle), bilan, historique, réglages avec l'état réel des fonctions.
- Défi de novembre (01–30/11/2026) : 6 habitudes quotidiennes déclarées + salle 4×/sem (comptée automatiquement si séance dans l'app) + course 3×/sem.
- Personnage original en SVG ; import d'images personnelles par palier (local).
- Catalogue de 15 variantes, consignes **non relues**, **aucun média**.

## Testé
- 35 tests automatisés (moteur, stockage, défi).
- Parcours vérifiés dans le navigateur de bureau (vue mobile 375 px) : création de séance, série, saisie 11/8, double appui,
  rechargement en cours de repos, douleur → arrêt, bilan, écran du défi.

## Non testé
- Safari iOS, écran verrouillé, hors ligne réel, texte agrandi, lecteur d'écran, import d'image personnelle.

## Action requise de Hmidou
- Choisir les critères des paliers du personnage (docs/CHARACTER.md).
- Accord pour héberger la PWA en HTTPS (GitHub Pages ou autre) afin de l'installer sur l'iPhone avant le 1er novembre.

## Limites
- Icône PNG pour l'écran d'accueil iOS non générée (SVG seulement).
- Pas d'onboarding, pas de planning, pas de nutrition, pas de module course.
