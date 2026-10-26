# Design system — charte du 26/10/2026

Remplace toutes les directions précédentes (vert pétrole, personnages, forêt en blocs, Poppins).
Inspiration : captures « smart home » (monochrome + orange) et « habit tracker » fournies par Hmidou.

## Principes
- Interface claire, minimaliste, monochrome : noir, gris subtils, blanc.
- Orange vif uniquement pour l'actif : bouton principal, onglet sélectionné, coches, jauges.
- Cartes très arrondies (28 px), sans bordure, blocs aérés.
- Zéro paragraphe : chiffres, badges courts, jauges, coches. Explications derrière un « ? » ou un détail repliable.

## Couleurs (tokens dans `src/ui/styles.css`)
| Rôle | Clair | Sombre / nuit |
|---|---|---|
| Fond | #ECECEA | #0E0E0E |
| Carte | #FFFFFF | #1A1A1A |
| Carte secondaire | #F3F3F1 | #242424 |
| Texte | #111111 | #F2F2F0 |
| Texte secondaire | #6E6E6B | #A3A3A0 |
| Accent (actif) | #FF5A1F | #FF5A1F |
| Danger | #D92D20 | #FF6B5E |

## Typographie
Plus Jakarta Sans uniquement (400 → 800), auto-hébergée (@fontsource, OFL). Chrono compris.

## Composants
- Navigation : pilule noire flottante, icônes seules (accueil, programme, nutrition, progrès, coach), rond orange sur l'actif.
- Barre de séance : même pilule noire, action principale orange.
- Icônes Lucide, trait fin (1,6).
- Habitudes : barre en segments + ronds à cocher orange.

## Ambiance
Mode nuit (sombre) 1 h avant le coucher déclaré ; rappel « Au lit » après l'heure de coucher.
Fond uni par défaut ; fond personnel jour / nuit possible (Réglages), stocké sur l'appareil.

## Ton
Ferme, factuel, jamais humiliant.
