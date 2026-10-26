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
- Imprévus : retard, mauvaise nuit, malade, douleur, déplacement, lieu indisponible, matériel manquant.
  Options selon le cas (raccourcir, alléger, garder les exercices faisables, reporter, remplacer par une marche, annuler),
  aperçu de la version adaptée avant confirmation, raison conservée, « Rétablir » possible. Malade/douleur : seulement annuler
  ou reporter, statut « suspendu », aucune pénalité. Une séance adaptée est marquée « adaptée », jamais « réalisée ».
- Séance lancée depuis le planning liée par identifiant.
- Accueil = tableau de bord : séance du jour, sommeil, pas, eau (+/− 250 ml), calories actives, objectif (J−), défi.
  Sommeil/pas/kcal déclarés (lus sur la montre) ; une seule saisie partagée avec le défi.
- Fin de séance : durée, séries, kcal et bpm (déclarés), routine du jour, détail repliable.
- Ambiance selon l'heure (matin, jour, soir, nuit) ; mode nuit 1 h avant le coucher déclaré ; rappel « Au lit » après l'heure de coucher.
- Règle UI : textes réduits au minimum (badges, chiffres, icônes).
- Illustrations : décors simples + icônes d'exercice (personnages retirés).
- Captures des écrans dans docs/maquettes/.
- Catalogue de 15 variantes, consignes **non relues**, **aucun média**.

## Testé
- 65 tests automatisés (moteur, stockage, défi, planning, objectifs, imprévus, données du jour, ambiance).
- Parcours vérifiés dans le navigateur de bureau (vue mobile 375 px) : création de séance, série, saisie 11/8, double appui,
  rechargement en cours de repos, douleur → arrêt, bilan, écran du défi, onboarding quitté puis repris après rechargement,
  objectif modifié (raison obligatoire), ajout au planning avec conflit travail/trajet détecté, imprévus (retard → raccourcie,
  mauvaise nuit → marche ou allégée lancée et liée, malade → suspendue, déplacement → reportée).

## Non testé
- Safari iOS, écran verrouillé, hors ligne réel, texte agrandi, lecteur d'écran.

## Action requise de Hmidou
- Accord pour héberger la PWA en HTTPS (GitHub Pages ou autre) afin de l'installer sur l'iPhone avant le 1er novembre.

## Limites
- Icône PNG pour l'écran d'accueil iOS non générée (SVG seulement).
- Séance lancée hors planning (depuis Aujourd'hui) : rattachée à l'élément prévu par le nom et le jour.
- Durée d'une version adaptée = estimation (45 s par série à répétitions, règle produit), à confirmer par l'usage réel.
- Pas encore gérés : séance plus longue que prévu, reprise après une longue interruption, semaine type différente le week-end.
- Pas de nutrition, pas de module course, pas de notifications.
