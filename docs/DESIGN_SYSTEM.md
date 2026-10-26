# Design system

Direction validée par Hmidou le 26/10/2026 : **le plus proche possible des maquettes fournies** (app fitness « Juice Lab » :
fond clair légèrement teinté, grandes cartes illustrées très arrondies, cercles de catégories, navigation flottante en pilule,
bouton rond séparé, chrono en chiffres à points).

Outils : skills ui-ux-pro-max / brand / design. La palette « vibrant orange » proposée par l'outil a été écartée.

## Couleurs (tokens dans `src/ui/styles.css`)
| Rôle | Clair | Sombre |
|---|---|---|
| Fond | #F3F5F2 + dégradé léger vert → beige | #1C1F21 |
| Surface | #FFFFFF | #262A2D |
| Texte | #121413 | #EEF0EE |
| Texte secondaire | #5A615D | #B3BAB6 |
| Accent vert foncé | #1F5C4F (texte blanc) | #4CC2B2 (texte foncé) |
| Étiquette (petit libellé) | #C23A26 | #FF8A75 |
| Danger | #B42318 | #F97066 |

## Typographie
Poppins (titres), Plus Jakarta Sans (texte), Doto (chrono à points) — auto-hébergées via @fontsource (licence OFL).

## Illustrations
- Pas de personnage (retiré à la demande de Hmidou, voir docs/CHARACTER.md).
- Décors simples en SVG (salle, extérieur) avec une icône Lucide par catégorie d'exercice (`src/ui/Scene.tsx`).
- Captures des écrans : `docs/maquettes/`.

## Règles
- Cibles tactiles ≥ 44–48 px ; actions de séance ≥ 56 px. Statuts = texte, jamais la couleur seule.
- Icônes Lucide (ISC), pas d'emoji. Animations coupées si `prefers-reduced-motion`.
- Les chiffres des cartes sont réels (exercices, séries, dernière fois). Pas de kcal ni de « score » inventés.

## Règle de contenu (26/10/2026)
Zéro paragraphe inutile : chiffres, badges, compteurs, icônes/emojis, cartes épurées. Explications derrière « ? » ou un détail repliable.

## Ambiance
Fond = forêt en blocs pixel originale (`src/ui/PixelForest.tsx`, aucune texture de jeu existant), déclinée matin, jour, soir, nuit.
Nuit = thème sombre bleu nuit, 1 h avant le coucher déclaré. Cartes en verre dépoli.
Fonds personnels possibles (jour / nuit) dans Réglages, stockés sur l'appareil.

## Ton du coach
Ferme, factuel, jamais humiliant. Dit ce qu'il sait et ce qu'il ne sait pas.
