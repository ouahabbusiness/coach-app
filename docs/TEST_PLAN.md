# Plan de tests

Fixtures fictives uniquement (jamais présentées comme performances réelles).

| # | Scénario | Statut | Comment |
|---|---|---|---|
| 1 | Onboarding quitté puis retrouvé | Navigateur ✔ | rechargement à l'étape 5, poids et statut conservés |
| 2 | Connexion refusée → parcours alternatif | Partiel | aucune connexion n'existe en web ; l'étape l'indique et reste facultative |
| 3 | Plus/moins de répétitions que prévu | Automatisé ✔ + navigateur ✔ | tests/engine.test.ts |
| 4 | Résultat conservé après réouverture | Automatisé ✔ + navigateur ✔ | tests/storage.test.ts, rechargement manuel |
| 5 | Repos démarre à la fin de série | Automatisé ✔ | |
| 6 | Repos dépassé mesuré, pas de départ auto | Automatisé ✔ | |
| 7 | Interruption ≠ repos | Automatisé ✔ | |
| 8 | Double appui = une seule série | Automatisé ✔ + navigateur ✔ | |
| 9 | Pas de doublon au rejeu (local) | Automatisé ✔ | sync distante : non applicable (pas de serveur) |
| 12 | Journée vide ≠ échec | Automatisé ✔ | défi : « non renseigné » |
| 14 | Douleur → comportement de sécurité | Automatisé ✔ + navigateur ✔ | |
| 15 | Repos / maladie sans pénalité | Automatisé ✔ | défi : jour excusé |
| 19 | Export / import | Automatisé ✔ | |
| 21 | Changement d'heure belge | Automatisé ✔ | 25/10/2026 |
| 16 | Estimation ≠ mesure | Partiel | profil : statut par valeur ; résultat absent « — » ; pas/sommeil « déclarés » |
| 17 | Proposition de changement justifiée | Partiel | objectif : raison obligatoire et versions conservées (automatisé + navigateur) |
| 22 | Texte agrandi | Non testé | |
| 23 | Médias manquants explicites | Navigateur ✔ | |
| 24 | Fonction non connectée jamais « synchronisée » | Navigateur ✔ | écran Réglages |
| — | Écran verrouillé / arrière-plan sur iPhone | **Non testé** | nécessite l'iPhone |
| — | Hors ligne réel (service worker) | **Non testé** | nécessite HTTPS + iPhone |

Dernière exécution : 46 tests passés (`npm test`), 26/10/2026.
