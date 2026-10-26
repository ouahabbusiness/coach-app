# État du projet — 26/10/2026

## Construit
- Moteur de séance événementiel (séries, maintiens, repos réel, interruptions, douleur, corrections, fin partielle).
- Stockage IndexedDB, reprise automatique d'une séance ouverte, export/import JSON.
- Interface façon maquettes : Aujourd'hui (défi, catégories, cartes de séances, dernières séances), Programme (modèles),
  mode séance (chrono à points, barre de contrôle), bilan, historique, réglages avec l'état réel des fonctions.
- Défi de novembre (01–30/11/2026) : 6 habitudes quotidiennes déclarées + salle 4×/sem (comptée automatiquement si séance dans l'app) + course 3×/sem.
- Onboarding en 13 étapes (coach et limites, confidentialité, appareils, profil avec statut mesuré/de mémoire/estimé/inconnu,
  historique, sécurité, objectif, matériel, alimentation, travail, sommeil, ton, récapitulatif). Sauvegarde à chaque saisie,
  reprise depuis Aujourd'hui, « Je ne sais pas » et « Passer » sur les étapes facultatives.
- Objectifs versionnés : chaque modification crée une version avec sa raison (demandée), historique dans Réglages.
- Planning de la semaine : horaires fixes déduits de l'onboarding (travail, trajets, sommeil), ajout et déplacement de
  séances/courses/marches avec conséquences affichées avant confirmation, statut réel (prévu, réalisé, partiel, non confirmé).
- Planning du jour sur Aujourd'hui.
- Illustrations : décors simples + icônes d'exercice (personnages retirés).
- Captures des écrans dans docs/maquettes/.
- Catalogue de 15 variantes, consignes **non relues**, **aucun média**.

## Testé
- 46 tests automatisés (moteur, stockage, défi, planning, objectifs).
- Parcours vérifiés dans le navigateur de bureau (vue mobile 375 px) : création de séance, série, saisie 11/8, double appui,
  rechargement en cours de repos, douleur → arrêt, bilan, écran du défi, onboarding quitté puis repris après rechargement,
  objectif modifié (raison obligatoire), ajout au planning avec conflit travail/trajet détecté.

## Non testé
- Safari iOS, écran verrouillé, hors ligne réel, texte agrandi, lecteur d'écran.

## Action requise de Hmidou
- Accord pour héberger la PWA en HTTPS (GitHub Pages ou autre) afin de l'installer sur l'iPhone avant le 1er novembre.

## Limites
- Icône PNG pour l'écran d'accueil iOS non générée (SVG seulement).
- Le lien entre une séance prévue et une séance réalisée se fait par le nom et le jour (pas encore par identifiant).
- Le planning ne gère pas encore les cas « retard, mauvaise nuit, maladie, déplacement » : déplacement manuel uniquement.
- Pas de nutrition, pas de module course, pas de notifications.
