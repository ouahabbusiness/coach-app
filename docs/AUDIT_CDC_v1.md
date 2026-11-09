# Audit du cahier des charges maître — Version 1.0

Date : 09/11/2026. Auteur : Claude. Statut : **audit, aucune modification du code**.

Légende (section 20 du cahier) : VALIDÉ · À VÉRIFIER · À ARBITRER · PROPOSITION · IMPOSSIBLE OU NON FIABLE.

---

## 1. Point bloquant : personnages Naruto (sections 3, 10, 17)

**IMPOSSIBLE de mon côté — À ARBITRER pour l'utilisateur.**

- Je ne peux pas intégrer les vrais personnages Naruto (images, personnalités incarnées par des agents), ni préparer l'inventaire graphique demandé (expressions, postures, écrans). Ce sont des personnages protégés (Kishimoto / Shueisha / Pierrot), même pour un projet personnel. Le cahier le reconnaît : « l'usage privé ne constitue pas une autorisation automatique ».
- **L'app n'est pas privée** : elle est publiée sur `ouahabbusiness.github.io/coach-app`, accessible à tous. Intégrer ces images serait déjà une diffusion publique.
- Contradiction avec les règles actuelles du projet (`CLAUDE.md`) : pas de médias récupérés sur Internet, pas de personnages sous droits, personnages déjà retirés.

**PROPOSITION — alternatives :**
1. Rôles nommés par leur fonction (« Récupération », « Force », « Nutrition », « Arbitre »).
2. Univers ninja **original** : ton clan, tes grades, ton symbole, des personnages que tu inventes.
3. Les grades D → SSS, les missions, les examens et le clan restent possibles tels quels.

---

## 2. Le cahier ignore l'existant

Le document est écrit comme un projet neuf (phase 5 « Développement du socle technique »). Or l'app contient déjà : moteur de séance événementiel, progression (`decide`) et journal des décisions, gêne et tolérance par mouvement, nutrition adaptative, plan du jour, cuisine et courses, course GPS, agenda, prières, défi de novembre, Winter Arc, export/import, 170+ tests.

Manques importants dans le cahier :
- **Gênes épaule / coudes et mouvements déclencheurs** : contrainte de sécurité centrale aujourd'hui, absente de la section 2.
- Prières, défi de novembre, Winter Arc, lecture, séjours et matériel en voyage.

**PROPOSITION** : une V1.1 du cahier fondée sur l'existant (voir `CAHIER_DES_CHARGES_v1.1.md`).

---

## 3. Agents et gouvernance (sections 3, 4, 8)

**À VÉRIFIER — en l'état : NON FIABLE.**

- Environ 13 spécialistes + 9 assistants, réunions hebdomadaires, votes aux 2/3, succession, avertissements, suspensions : beaucoup de coût et de bruit pour une app à un seul utilisateur.
- Des modèles de langage ne deviennent pas fiables parce qu'ils « se réunissent ». Le cahier le dit lui-même : « un accord entre modèles ne constitue jamais une preuve ».
- **Pouvoirs circulaires** : Shikamaru peut suspendre Kakashi, Kakashi garde l'arbitrage final, l'utilisateur a le dernier mot. Il faut une seule chaîne de décision.

**PROPOSITION :**
- Les décisions restent dans le **moteur déterministe** (comme aujourd'hui : règles testées + journal des décisions).
- Une IA éventuelle **explique et résume**, ne décide jamais seule.
- Les « rôles » deviennent des **grilles de vérification** (sécurité, preuves, nutrition, budget), appliquées à chaque proposition.

---

## 4. IA payante, budget, comptes, confidentialité (sections 11, 13)

**À VÉRIFIER — changement d'architecture majeur.**

- Appeler une IA externe exige un **serveur** : une clé API ne peut pas être placée dans une PWA publique, et un plafond de dépenses ne peut être garanti que côté serveur. Aujourd'hui, l'app n'a **aucun serveur**.
- Passkeys, comptes, synchronisation, suppression propagée aux sauvegardes : même constat, il faut un serveur et une politique de clés. Technique usuelle pour la suppression : une clé de chiffrement par donnée, détruite pour rendre la donnée illisible partout, y compris dans les anciennes sauvegardes (« crypto-shredding »).
- Données de santé envoyées à un fournisseur IA : catégorie sensible du RGPD (article 9). Minimisation stricte, consentement explicite par usage.
- Montant initial du budget : **À ARBITRER**.

---

## 5. Apple (section 12)

**À ARBITRER** : `CLAUDE.md` prévoit **xtool sous WSL** ; le cahier prévoit un **Mac distant via GitHub Actions**. Deux chemins différents.

- Les runners macOS de GitHub Actions existent (À VÉRIFIER : coût en minutes).
- Signature durable et TestFlight : **Apple Developer Program**, abonnement annuel payant (tarif à vérifier). Avec un compte gratuit, l'app installée expire après **7 jours**.
- Renouvellement des certificats : automatisable en partie seulement ; première installation et confirmations sur l'appareil restent manuelles.
- Le cahier a raison : seul un compagnon natif permet HealthKit et la montre en direct (VALIDÉ comme besoin, faisabilité À VÉRIFIER).

---

## 6. Caméra et démonstrations 3D (section 5)

**À VÉRIFIER.**
- Estimation de posture sur le téléphone (Apple Vision, MediaPipe) : suffisante pour des angles et une amplitude **approximatifs**, pas pour une analyse biomécanique fiable.
- Démonstrations 3D : demandent des modèles créés pour le projet (aucun média récupéré sur Internet). Coût de production élevé.

---

## 7. Gamification (section 10)

- « Examens scientifiquement validés » pour des grades D → SSS : **n'existe pas**. Les seuils seraient des **choix de conception**, à présenter comme tels.
- Discipline / audit / avertissements : doivent respecter la règle actuelle — **aucune punition, aucun dépassement dangereux récompensé**, y compris au nom du « dépassement de soi ».
- Compléments (section 6) : l'app fait aujourd'hui « aucune recommandation de complément ». Changer cela exige source consultée + relecture professionnelle — **À ARBITRER**.

---

## 8. Ce qui est solide (VALIDÉ, déjà aligné avec l'app)

- Principes 1 à 5 et 7 à 9 du cahier.
- Estimation jamais présentée comme mesure ; provenance et fiabilité des données.
- Données douteuses en quarantaine, jamais supprimées silencieusement.
- Corrélation ≠ causalité.
- Prudence sur le surentraînement ; aucun diagnostic depuis la montre.
- Pas d'entraînement à jeun imposé ; pas d'objectif de poids arbitraire.

---

## 9. Ordre proposé (PROPOSITION)

1. **Stabiliser sur iPhone** ce qui existe (non testé : caméra, vrai code-barres, GPS réel, hors ligne, lecteur d'écran).
2. **Compagnon natif minimal** : HealthKit + montre (choix xtool / Mac distant d'abord).
3. **Couche IA facultative** : petit serveur, plafond appliqué côté serveur, données minimisées.
4. **Gamification** avec univers original.

## 10. Décisions à prendre par l'utilisateur

| # | Décision | Options |
|---|----------|---------|
| 1 | Personnages | Rôles par fonction · univers original (vrais personnages exclus) |
| 2 | Chaîne Apple | xtool (WSL) · Mac distant (GitHub Actions) |
| 3 | Serveur | Oui (IA, comptes, synchro) · Non (local uniquement) |
| 4 | Budget IA mensuel | Montant à fixer |
| 5 | Compléments | Garder « aucune recommandation » · ouvrir avec sources + relecture |
