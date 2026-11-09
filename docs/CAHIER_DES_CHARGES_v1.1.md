# Cahier des charges — Version 1.1 (proposition)

Date : 09/11/2026. Statut : **PROPOSITION — en attente de validation de l'utilisateur.**
Base : cahier maître V1.0 + audit (`AUDIT_CDC_v1.md`) + état réel de l'app (`PROJECT_STATUS.md`).

Règle : ce document n'autorise aucun développement. Les éléments marqués À ARBITRER restent ouverts.

Légende : **VALIDÉ** · **CONSTRUIT** (existe et testé par le moteur) · **À VÉRIFIER** · **À ARBITRER** · **PROPOSITION** · **EXCLU**.

---

## 1. Vision

Application personnelle de coaching sportif, fondée sur des règles explicites, un journal de données vérifiable et une analyse continue des performances, de la récupération et de la nutrition.

Principes non négociables (VALIDÉ, repris de V1.0 et de `CLAUDE.md`) :
1. Sécurité physique avant performance.
2. Recommandations justifiées par des données et des sources ; hypothèse ≠ fait.
3. Pas de complaisance : le coach contredit une décision moins bien justifiée, explique risques et conséquences.
4. Calculs importants déterministes et testés.
5. Une valeur inconnue n'est jamais zéro ; une estimation n'est jamais affichée comme une mesure.
6. Le journal d'événements est la source de vérité ; les corrections sont des événements traçables et annulables.
7. Données sous le contrôle de l'utilisateur (local d'abord, export/import complet).
8. Aucun changement important silencieux.
9. Ne jamais afficher « synchronisé », « connecté » ou « testé » pour ce qui ne l'est pas.
10. Utilisable sans abonnement IA payant.
11. Aucune punition, aucune privation, aucun dépassement dangereux récompensé.
12. Aucun seuil ou règle présenté comme validé sans source consultée et relecture professionnelle.

## 2. Profil et objectifs

- 27 ans, 184 cm, ≈ 78,5 kg ; ≈ 1 an de pratique régulière avec interruptions, expérience antérieure. (VALIDÉ)
- **Contraintes de santé** : gênes épaule / coudes ; tolérance suivie par mouvement (déclencheur connu / toléré / inconnue). (CONSTRUIT — ajouté par rapport à V1.0)
- Objectif : physique athlétique et équilibré, haut du corps plus développé, abdos visibles sans maigreur extrême, jambes fortes et proportionnées ; pas de priorité fessiers. Priorité : hypertrophie, puis force, endurance et qualités athlétiques maintenues. Recomposition, aucun poids cible arbitraire. (VALIDÉ)
- Organisation : mardi, mercredi, jeudi, vendredi, dimanche ; samedi facultatif ; lundi repos. Entraînement après repas, jamais à jeun imposé. 40–50 min, parfois 90–120. (VALIDÉ)
- Matériel : barres traction/dips, ceinture de lest, kettlebells 6 et 12 kg, disques 5 kg (compatibilité À VÉRIFIER), roue, tapis, tapis de course, corde. Enveloppe d'achat indicative 200–350 €. (VALIDÉ)
- Contexte de vie intégré à l'agenda : travail, trajets, prières, séjours. (CONSTRUIT)

## 3. Rôles de coaching (remplace « Équipe Naruto »)

**EXCLU** : personnages Naruto, leurs images et leurs personnalités (droits d'auteur ; app publiée publiquement).
**À ARBITRER** : rôles par fonction (ci-dessous) **ou** personnages originaux créés par l'utilisateur.

Chaque rôle est une **grille de vérification** appliquée par le moteur, pas un agent autonome :

| Rôle | Domaine | Peut bloquer ? |
|------|---------|----------------|
| Arbitre | Cohérence globale, arbitrage final après l'utilisateur | — |
| Stratégie | Programme, phases, objectifs intermédiaires | Non |
| Rigueur | Respect des règles, cohérence des décisions, journal | Signale |
| Force & hypertrophie | Charges, séries, RIR, double progression | Non |
| Conditionnement | Course, EMOM, circuits, explosivité | Non |
| Récupération & santé | Gêne, tolérance, sommeil, orientation pro | **Oui** (sécurité) |
| Technique | Exécution, amplitude, asymétries | Non |
| Preuves | Sources, niveau de preuve, incertitudes | Signale |
| Nutrition | Plan du jour, bilan calorique, courses | Non |
| Compléments | Analyse des compléments déclarés | Non (voir §6) |
| Budget | Dépenses matériel et IA | Non (ne bloque jamais seul une dépense de sécurité) |

## 4. Gouvernance des décisions (simplifiée)

- **Une seule chaîne** : moteur (règles testées) → proposition journalisée → utilisateur. (PROPOSITION)
- Niveaux d'autorité (VALIDÉ dans l'esprit de V1.0) :
  - Ajustement courant, réversible, préautorisé → automatique + journal (CONSTRUIT : `decide`, `decisions.log`).
  - Changement important (phase allégée, programme) → proposé, appliqué seulement après validation (CONSTRUIT).
  - Danger physique sérieux → suspension immédiate de l'action (CONSTRUIT : alerte sécurité, 112).
- Erreurs : une justification fausse reste visible, une correction datée s'ajoute (CONSTRUIT).
- Bilan hebdomadaire automatique (CONSTRUIT) remplace la « réunion hebdomadaire ».
- **Abandonné** : votes, succession, avertissements entre agents, assistants permanents.

## 5. Coaching sportif

CONSTRUIT :
- Moteur de séance événementiel (séries, maintiens, repos réel, interruptions, douleur, corrections, fin partielle).
- Prescriptions en plages, réserve visée, échec seulement si choisi en dernière série.
- Double progression par exercice ; effort excessif → pas de hausse ; une séance isolée ne change rien.
- Contrôle avant séance, retour après séance et le lendemain, tolérance par mouvement, mouvement passé sans pénalité.
- Tests sous-maximaux tant que la tolérance n'est pas confirmée.
- Course : séance guidée, GPS, sortie prévue fixe la distance.
- Séjours : remplaçants jamais « déclencheur connu ».

À VÉRIFIER :
- Analyse caméra : estimation de posture approximative seulement ; alertes de sécurité en direct, corrections après l'exercice ; vidéos brutes supprimées après analyse.
- Démonstrations 3D : coût de production ; aucun média récupéré sur Internet.

PROPOSITION : exercices correctifs automatiques seulement sur défaut confirmé plusieurs fois, proposés et non imposés.

## 6. Nutrition et compléments

CONSTRUIT : plan du jour, cibles calculées (Mifflin-St Jeor, protéines 1,8–2,0 g/kg), bilan calorique sur 2 semaines, imprévus de repas, cuisine, code-barres (Open Food Facts, seul le code est envoyé), liste de courses, Frigo, statut mesuré/estimé.

À VÉRIFIER : reconnaissance d'aliments par photo (estimation, confiance affichée), vitamines/minéraux, dates de péremption.

**À ARBITRER** : compléments. Actuel = « aucune recommandation », seulement les compléments déclarés (créatine, whey). Toute ouverture exige source + relecture professionnelle ; interactions médicamenteuses → professionnel de santé.

## 7. Santé et récupération

- Déclarations + performances + tendances (CONSTRUIT partiellement).
- Données Apple Watch / Santé : nécessite l'app native (À VÉRIFIER).
- Indice de récupération : composantes, incertitudes et limites visibles (PROPOSITION).
- Aucun diagnostic depuis une montre ; orientation avis / évaluation rapide selon les signaux, jamais selon un score seul (CONSTRUIT).

## 8. Preuves scientifiques

- Chaque règle : source, date, niveau de preuve, limites. Les seuils actuels sont des **choix de conception ajustables**, non relus par un professionnel (état réel affiché).
- PROPOSITION : fiche « Sources » par règle dans `docs/`, et relecture par un coach / kiné diplômé avant de marquer une règle « validée ».

## 9. Interface et appareils

- iPhone : interface principale (CONSTRUIT, PWA ; tests réels en cours).
- iPad / PC : mise en page adaptée (PROPOSITION).
- Apple Watch : via app native (À VÉRIFIER).
- Couleurs via les tokens de `styles.css` ; accessibilité (texte agrandi, lecteur d'écran) À VÉRIFIER sur iPhone.

## 10. Gamification

PROPOSITION (univers **original**, à arbitrer) :
- Grades D → SSS, XP, titres, badges, missions, examens, clan personnel avec symbole original.
- Seuils des grades = choix de conception affichés comme tels, adaptés au niveau réel.
- Performance et régularité évaluées séparément.
- Rétrogradation seulement sur régression durable confirmée, jamais pour une mauvaise semaine ou une blessure.
- Échec d'examen → analyse et plan, sans punition ni attente arbitraire.
- Aucune acrobatie dangereuse obligatoire ; mouvements avancés avec prérequis stricts.
- CONSTRUIT : défi de novembre (preuve photo du jour), Winter Arc.

## 11. IA et coûts

**À ARBITRER** : accepter un serveur.
- Sans serveur : app 100 % locale, aucune IA externe (état actuel).
- Avec serveur : IA facultative pour expliquer/résumer, jamais décider ; clés côté serveur ; plafond mensuel appliqué techniquement ; alertes 50/75/90/100 % ; données de santé minimisées et envoyées seulement avec accord explicite.
- Montant du budget : À ARBITRER.

## 12. Apple

**À ARBITRER** : xtool (WSL) **ou** Mac distant (GitHub Actions).
À VÉRIFIER : Apple Developer Program (abonnement annuel ; sans lui, expiration à 7 jours), HealthKit par catégorie, séance montre en direct, automatisation partielle des certificats.
Le compagnon natif réimporte l'export JSON de la PWA (VALIDÉ dans `CLAUDE.md`).

## 13. Données, sécurité, confidentialité

- CONSTRUIT : local d'abord (IndexedDB), export/import complet, statut et provenance des données.
- Avec serveur (À ARBITRER) : passkeys + codes de récupération hors ligne, chiffrement en transit et au repos, suppression par destruction de clé (efface aussi dans les sauvegardes), restauration testée, aucune réintroduction silencieuse de données supprimées.
- RGPD : données de santé = catégorie sensible.

## 14. Historique, import, export

- CONSTRUIT : export/import JSON complet, journal des décisions.
- PROPOSITION : export lisible pour coach / professionnel de santé ; comparaison de périodes ; projections avec marge d'incertitude ; détection de doublons et quarantaine.

## 15. Tableau de bord PC

PROPOSITION, après serveur : état des données, sauvegardes, dépenses IA, compilations Apple. Sans serveur : écran Réglages (état réel) sur grand écran.

## 16. Évolution

Chaque modification : motif, tests, effets secondaires, retour arrière possible (git). Tout changement du moteur passe d'abord par un test. `PROJECT_STATUS.md` mis à jour à chaque étape. (VALIDÉ)

## 17. Ressources graphiques

**EXCLU** : images Naruto et images récupérées sur Internet.
PROPOSITION : ressources originales avec nom stable, provenance, version, statut de validation, remplaçables sans toucher au code.

## 18. Plan de réalisation proposé

| Phase | Contenu | Critère d'acceptation |
|-------|---------|-----------------------|
| 1 | Stabilisation iPhone | Caméra, code-barres réel, GPS réel, hors ligne, lecteur d'écran testés sur l'appareil |
| 2 | Décisions ouvertes | Les 5 arbitrages tranchés et notés dans `docs/` |
| 3 | Compagnon natif minimal | Lecture HealthKit autorisée par catégorie + import du JSON ; installé sur l'iPhone |
| 4 | Sources et relecture | Fiche source par règle ; relecture professionnelle planifiée |
| 5 | Couche IA facultative (si serveur) | Plafond bloquant testé ; aucune donnée de santé envoyée sans accord |
| 6 | Gamification originale | Grades et examens affichés comme choix de conception ; aucun mécanisme punitif |
| 7 | Tableau de bord PC | État réel uniquement |

## 19. Décisions à prendre

1. Personnages : rôles par fonction · univers original.
2. Chaîne Apple : xtool · Mac distant.
3. Serveur : oui · non.
4. Budget IA mensuel : montant.
5. Compléments : garder « aucune recommandation » · ouvrir avec sources + relecture.
