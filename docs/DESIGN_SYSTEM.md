# Design system — état du 26/10/2026

Deux ambiances, décidées par Hmidou (25–26/10) :
- **Quotidien clair** (accueil, planning, nutrition, progrès, lecture, défi, réglages) : monochrome + **bleu électrique** pour l'actif. Plus aucun orange.
- **Zone Winter Arc sombre** (séance, page Winter Arc, configuration, entretiens du coach : programme, nutrition, « Ma semaine ») : noir, crème, pointillés, typographie mono.

## Principes
- Zéro paragraphe : chiffres, badges courts, jauges, coches, icônes. Explications derrière un « ? » ou un détail repliable.
- Cartes compactes façon shadcn : radius 14 px, bordure fine, ombre très légère.
- Icônes Lucide à la place des emojis.
- Chaque chiffre estimé est marqué (« ≈ », « estimation ») ; une donnée manquante s'affiche « — » ou « manque : … ».

## Couleurs — quotidien clair (`:root` dans `src/ui/styles.css`)
| Rôle | Valeur |
|---|---|
| Fond | #F6F6F4 + halo bleu très léger |
| Carte | #FFFFFF, bordure #EBEBE8 |
| Texte / secondaire | #111111 / #6E6E6B |
| Accent (actif) | #2563EB (blanc dessus 5,2:1) |
| Pastille accent | #E6EEFF |
| Danger | #D92D20 (sécurité uniquement) |

Novembre (`data-theme='winter'`, auto du 1er au 30/11, réglable) : même bleu, fond bleuté, neige sur l'en-tête de l'accueil.

## Couleurs — zone Winter Arc (`data-theme='zone'`)
Fond #050505 (texture de points crème dans les entretiens), surfaces #0C0C0B / #121211, texte crème #F3ECDC, secondaire #8F8B82,
bordures #262624. Bouton principal crème, texte noir. Progression en marches pointillées. Libellés en JetBrains Mono majuscules.

## Typographie
Plus Jakarta Sans (texte et titres) ; JetBrains Mono pour les libellés techniques de la zone sombre. Auto-hébergées (@fontsource, OFL).

## Composants
- En-tête héro de l'accueil : pleine largeur, dégradé bleu glacé, formes organiques animées, anneau « Journée ».
- Tuiles : Objectifs 0/6 (ouvre la fenêtre des objectifs avec preuve photo), Lecture, Sommeil, Pas, Eau (cible calculée), Calories (cible calculée).
- Prochaine étape du plan du jour, carte Course (cible km), carte Winter Arc.
- Fenêtre de calcul : cartes alignées, indicateur « Profil x/n », sélecteur en deux colonnes, ligne d'action.
- Planning : carte jour avec **barre des trous** (6 h → 23 h : occupé gris, séances bleues, libre en clair, temps libre total).
- Plan du jour : frise horaire (repas, eau, compléments déclarés, séance, sommeil), étape suivante qui respire.
- Séance HUD sombre : cible géante, chrono, consigne de charge « Trop facile · 16 kg × 6 », menu ⋯.
- Entretiens du coach : une question par écran, option recommandée en pointillés avec sa raison.
- Animations : apparition décalée, jauges qui se remplissent, coches qui rebondissent ; coupées si mouvement réduit.

## Ton
Coach ferme (« dur ») ou neutre, au choix. Jamais humiliant, jamais de sanction : la rigueur porte sur l'organisation.
