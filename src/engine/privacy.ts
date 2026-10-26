// Où vont les données : registre exhaustif des flux (vérifié par un test qui scanne les URL du code).
// Tout ce qui quitte l'appareil demande un accord explicite AVANT le premier envoi, révocable dans Réglages.

export type ConsentKey = 'health' | 'location' | 'spots' | 'map' | 'food';

/** Change si le texte d'un accord change : l'accord est alors redemandé. */
export const CONSENT_VERSION = 1;

export interface Flow {
  key: string;
  title: string;
  /** Ce qui est traité. */
  data: string;
  /** Où ça va. */
  destination: string;
  /** Hôtes réseau contactés (vide = rien ne quitte l'appareil). */
  hosts: string[];
  when: string;
  /** Accord demandé avant activation. */
  consent: boolean;
}

export const FLOWS: Record<ConsentKey, Flow> = {
  health: {
    key: 'health',
    title: 'Données d’entraînement et de santé',
    data: 'Séances, charges, poids, mensurations, douleurs déclarées, état avant séance, repas, photos preuves, profil.',
    destination: 'Uniquement sur cet appareil (base du navigateur). Aucun serveur, aucune analyse, aucune IA externe.',
    hosts: [],
    when: 'À chaque saisie.',
    consent: true,
  },
  location: {
    key: 'location',
    title: 'Position GPS',
    data: 'Position précise de l’appareil.',
    destination: 'Lue sur l’appareil : tracé de course, heures de prière, recherche de spots. Le tracé reste sur l’appareil.',
    hosts: [],
    when: 'Course en direct, « Autour de moi », réglage des prières.',
    consent: true,
  },
  spots: {
    key: 'spots',
    title: 'Recherche de spots (OpenStreetMap)',
    data: 'Position arrondie à ≈ 1 km (2 décimales) + rayon de recherche. Ton adresse IP est visible par le service.',
    destination: 'Overpass (overpass-api.de, ou un miroir si saturé) et, en secours, Photon (photon.komoot.io).',
    hosts: ['overpass-api.de', 'overpass.kumi.systems', 'maps.mail.ru', 'overpass.private.coffee', 'photon.komoot.io'],
    when: 'Uniquement quand tu lances une recherche de spots.',
    consent: true,
  },
  map: {
    key: 'map',
    title: 'Fonds de carte (OpenStreetMap)',
    data: 'Zone affichée sur la carte (révèle approximativement où tu es) + adresse IP.',
    destination: 'tile.openstreetmap.org',
    hosts: ['tile.openstreetmap.org'],
    when: 'Carte des spots et carte pendant une course. Sans accord : liste sans carte, tracé sans fond.',
    consent: true,
  },
  food: {
    key: 'food',
    title: 'Code-barres (Open Food Facts)',
    data: 'Le numéro du code-barres seulement (la photo est lue sur l’appareil). Adresse IP visible.',
    destination: 'world.openfoodfacts.org',
    hosts: ['world.openfoodfacts.org'],
    when: 'Quand tu scannes ou tapes un code-barres.',
    consent: true,
  },
};

/** Flux sans accord séparé (information) : ils ne transmettent pas tes données d'entraînement ou de santé. */
export const INFO_FLOWS: Flow[] = [
  {
    key: 'hosting',
    title: 'Chargement de l’application',
    data: 'Adresse IP, navigateur, fichiers demandés (journaux techniques de l’hébergeur). Aucune donnée saisie.',
    destination: 'GitHub Pages (ouahabbusiness.github.io).',
    hosts: ['ouahabbusiness.github.io'],
    when: 'À l’ouverture et aux mises à jour.',
    consent: false,
  },
  {
    key: 'photos',
    title: 'Photos (preuves, étiquettes, couvertures)',
    data: 'Photo choisie par toi à chaque fois.',
    destination: 'Réduite et stockée sur l’appareil. Jamais envoyée.',
    hosts: [],
    when: 'Quand tu prends ou choisis une photo.',
    consent: false,
  },
  {
    key: 'voice',
    title: 'Annonces vocales',
    data: 'Phrases de la course (distance, allure).',
    destination: 'Synthèse vocale du système de l’appareil.',
    hosts: [],
    when: 'Course en direct, si activées.',
    consent: false,
  },
  {
    key: 'apple-maps',
    title: 'Itinéraire Plans',
    data: 'Coordonnées du spot choisi.',
    destination: 'App Plans d’Apple (maps.apple.com), seulement si tu touches « Itinéraire ».',
    hosts: ['maps.apple.com'],
    when: 'Sur ton geste uniquement.',
    consent: false,
  },
];

export interface ConsentRecord {
  granted: boolean;
  /** ISO. */
  at: string;
  version: number;
}

export type Consents = Partial<Record<ConsentKey, ConsentRecord>>;

export const CONSENTS = 'privacy.consents';

export const isGranted = (c: Consents, k: ConsentKey) => c[k]?.granted === true && c[k]!.version === CONSENT_VERSION;

export const withConsent = (c: Consents, k: ConsentKey, granted: boolean, now = new Date()): Consents => ({
  ...c,
  [k]: { granted, at: now.toISOString(), version: CONSENT_VERSION },
});

/** Tous les hôtes déclarés (accord ou information). */
export const declaredHosts = () => [...Object.values(FLOWS), ...INFO_FLOWS].flatMap((f) => f.hosts);
