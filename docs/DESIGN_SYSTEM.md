# Design system — charte du 26/10/2026

Remplace toutes les directions précédentes (vert pétrole, personnages, forêt en blocs, Poppins).
Inspiration : captures « smart home » (monochrome + orange) et « habit tracker » fournies par Hmidou.

## Principes
- Interface claire, minimaliste, monochrome : noir, gris subtils, blanc.
- Orange vif uniquement pour l'actif : bouton principal, onglet sélectionné, coches, jauges.
- Cartes compactes façon shadcn : radius 14 px, bordure fine #EBEBE8, ombre très légère, padding 12 px.
- Chaque indicateur : icône SVG fine dans une pastille 28–36 px, libellé 0,75 rem gris, valeur 1,35 rem gras, jauge fine 4 px.
- Zéro paragraphe : chiffres, badges courts, jauges, coches. Explications derrière un « ? » ou un détail repliable.

## Couleurs (tokens dans `src/ui/styles.css`)
| Rôle | Valeur |
|---|---|
| Fond | #F6F6F4 + halo chaud léger (nuit : #EEF0F5 bleuté) |
| Carte | #FFFFFF, bordure #EBEBE8 |
| Carte secondaire | #F3F3F1 |
| Texte | #111111 |
| Texte secondaire | #6E6E6B |
| Accent (actif) | #FF5A1F |
| Danger | #D92D20 |

## Typographie
Plus Jakarta Sans uniquement (400 → 800), auto-hébergée (@fontsource, OFL). Chrono compris.

## Composants
- Navigation : pilule noire flottante, icônes seules (accueil, programme, nutrition, progrès, coach), rond orange sur l'actif.
- Barre de séance : même pilule noire, action principale orange.
- Icônes Lucide, trait fin (1,6).
- Habitudes : barre en segments + ronds à cocher orange.

## Ambiance
Nuit : fond clair légèrement bleuté (plus de thème sombre, demande du 26/10) ; rappel « Au lit » après l'heure de coucher.
Fond uni par défaut ; fond personnel jour / nuit possible (Réglages), stocké sur l'appareil.

## Ton
Ferme, factuel, jamais humiliant.
