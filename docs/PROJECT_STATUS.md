# État du projet — 26/10/2026 (soir)

En ligne : https://ouahabbusiness.github.io/coach-app/ (GitHub Pages, publication automatique à chaque envoi sur `main`, tests obligatoires).

## Construit
**Séance et progression**
- Moteur de séance événementiel (séries, maintiens, repos réel, interruptions, douleur, corrections, fin partielle), reprise automatique.
- Lest : progression limitée aux charges réalisables (pièces 5, 5, 6, 12 kg ; kettlebells 6 et 12 kg séparées), gros saut → +2 répétitions d'abord.
- Au lancement : charge/répétitions ajustées d'après la dernière séance ; en séance : « Trop facile → monte » en direct.

**Coach**
- Entretien programme (20 questions) : zones du corps, priorité, tests, douleurs, sommeil, stress, travail, raison d'abandon, temps, créneau,
  fréquences, intensité, rigueur, durée, ton dur ou neutre. Option recommandée argumentée. Vérité sur la perte localisée.
- Programme A/B/C + re-test (semaine finale), courses progressives (+10 %/sem., fractionné détaillé, sortie longue, course chrono finale).
- Validation → modèles + planning du bloc, **placés dans les trous** de l'agenda, séjours adaptés au matériel.
- Rigueur appliquée aux imprévus : strict = pas de report ; militaire = ni report ni annulation, version courte ≥ 20 min (maladie/douleur toujours libres).

**Cibles calculées**
- Eau 35 ml/kg + 0,5 L/h de séance ; calories Mifflin-St Jeor × activité, ajustées à l'objectif du programme et à la tendance du poids ; protéines 1,8 g/kg.
- Course : +10 % sur la plus longue récente, maintien si effort ≥ 9/10, baisse après pause.

**Nutrition et journée**
- Entretien nutrition (horaires, repas, aliments aimés, exclusions, compléments **déclarés** : créatine Creapure, whey Native Protimuscle).
- Plan du jour : repas avec quantités (valeurs moyennes, estimation), créatine après le petit-déj avec 300 ml d'eau, eau répartie,
  lumière du matin, dernier café, écrans coupés, coucher conseillé pour 8 h. Cocher l'eau remplit le compteur.
- Imprévu de repas (plat préparé par quelqu'un, resto, fast-food, sandwich, sauté) : estimation + repas suivants recalculés.

**Agenda**
- « Ma semaine » : travail, trajet, lever/coucher, engagements récurrents (ex. analyse Amazon), soirées, séjours avec matériel sur place.
- Indisponibilité ponctuelle → séance/course replacée le même jour sur le créneau libre le plus proche.

**Suivi**
- Défi de novembre : 6 habitudes, salle 4×/sem., course 3×/sem. ; chaque objectif réussi **compte seulement avec une photo du jour**.
- Page Winter Arc (montagne, sentier de 30 jours, série, semaines tenues).
- Poids (pesées, moyenne, tendance), mensurations (taille, hanches, cuisse), lecture (Atomic Habits, pages, journal avec photo).
- Onboarding 13 étapes (zone sombre) ; formule de calcul dans le profil ; objectifs versionnés ; export/import complet.

## Testé
- 124 tests automatisés (`npm test`) : moteur, stockage, défi, Winter Arc, preuves, lecture, cibles, lest, programme, imprévus, plan du jour, disponibilités, séjours.
- Navigateur de bureau (vue mobile) : accueil bleu, entretien programme complet → planning rempli, entretien nutrition jusqu'aux compléments,
  configuration sombre, fenêtre Calories.

## Non testé
- Sur iPhone : caméra des preuves photo, écran verrouillé, hors ligne réel, texte agrandi, lecteur d'écran.
- Plan du jour et « Ma semaine » affichés avec un vrai profil complet (testés par le moteur, pas encore à l'écran).

## Limites
- Valeurs nutritionnelles moyennes, imprévus de repas = ordres de grandeur. Aucune recommandation de complément.
- Règles d'entraînement générales, **non relues par un professionnel** ; catalogue sans média.
- Pas d'accès Apple Santé (fréquence cardiaque, Watch, balance) : nécessite l'app native (prochaine étape, xtool).
