# Architecture

## Choix actuel : PWA locale, puis app native
- **Étape 1 (en cours)** : PWA React/TypeScript, sans serveur. Testable entièrement sur PC.
- **Étape 2** : app iOS SwiftUI compilée avec xtool depuis WSL (Apple ID gratuit), pour HealthKit. Import de l'export JSON de la PWA.

Vérifié le 25/10/2026 : xtool 1.23 et Swift 6.4.1 installés dans WSL ; SDK iOS absent (Xcode.xip requis) ; compte Apple non connecté.
Compte gratuit (page Apple « Supported capabilities (iOS) ») : HealthKit, Background modes, App groups oui ; Push, CloudKit non.
xtool : SwiftData ne compile pas (issue xtool-org/xtool#149) → prévoir SQLite/GRDB. App Watch non documentée → considérée impossible pour l'instant.

## Couches
1. **Données** : journal d'événements append-only (`events`), index recalculable (`sessions`), clé-valeur (`kv`).
2. **Règles déterministes** : `src/engine` — projection, validation des commandes, durées, bilans. Aucune IA.
3. **IA** : absente. Prévue en phase 4, jamais nécessaire pour faire une séance.

## Chronométrage
Chaque action stocke un instant UTC (ms). Les durées sont des différences d'instants : insensibles au verrouillage,
au rechargement et aux changements d'heure. L'affichage se rafraîchit toutes les 250 ms mais ne compte rien lui-même.
L'instant est capturé au moment de l'appui, avant toute écriture.

## Limites connues de la PWA
- Pas d'accès Santé / Apple Watch.
- Pas de son ni de vibration fiables sur iOS ; pas de notifications programmées sans serveur.
- Safari peut effacer le stockage d'un site peu utilisé → export régulier ; `navigator.storage.persist()` est demandé.
