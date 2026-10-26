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

## Thème du mois — Novembre / Winter Arc
Actif automatiquement du 1er au 30/11 (réglable : auto / activé / désactivé), sur **toutes** les pages.
- Accent unique bleu #1D4ED8 (blanc dessus 6,7:1 ; sur pastille #E3ECFF 5,65:1). Zéro orange.
- Fond #F3F6FA, statuts « partiel / suspendu » en ardoise #334155 sur #E8EDF5 (8,8:1). Rouge réservé à la sécurité.
- Emojis colorés remplacés par des icônes vectorielles qui suivent l'accent.

## Typographie
Plus Jakarta Sans uniquement (400 → 800), auto-hébergée (@fontsource, OFL). Chrono compris.

## Composants
- En-tête héro (accueil) : pleine largeur, passe sous la barre d'état, fondu dans la page par une vague. Dégradé clair pêche + texte sombre (contraste ≥ 10:1 titre, ≥ 5:1 date). Formes organiques floues animées, anneau « Journée », pastilles. Variante Winter Arc glacée (auto du 1er au 30/11, réglable) avec flocons.
- Planning : carte jour minimaliste (date empilée, 2 icônes travail/coucher, une ligne par séance, statut en petit badge) ; détails et actions derrière « ⋯ ».
- Navigation : pilule compacte (42 px), translucide.
- Animations : apparition décalée des blocs sur toutes les pages, jauges qui se remplissent, coches qui rebondissent ; coupées si mouvement réduit.
- Écran de séance « HUD » : barre Mission collante en haut, stats (exos, séries, actif, repos), carte de la série (étiquette EXO/SÉRIE, statut, paramètres en grille, chrono, bouton principal dans le flux), plan de mission en liste. Aucun élément flottant.
- Icônes Lucide, trait fin (1,6).
- Habitudes : barre en segments + ronds à cocher orange.

## Ambiance
Nuit : fond clair légèrement bleuté (plus de thème sombre, demande du 26/10) ; rappel « Au lit » après l'heure de coucher.
Fond uni par défaut ; fond personnel jour / nuit possible (Réglages), stocké sur l'appareil.

## Ton
Ferme, factuel, jamais humiliant.
