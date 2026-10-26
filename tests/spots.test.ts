// Données de test fictives (réponse Overpass simplifiée).
import { describe, expect, it } from 'vitest';
import { overpassQuery, parseSpots } from '../src/engine/spots';

describe('spots', () => {
  it('position arrondie à ~1 km dans la requête', () => {
    const q = overpassQuery(50.937812, 4.040345, 3000);
    expect(q).toContain('around:3000,50.94,4.04');
    expect(q).not.toContain('50.9378');
  });

  it('street workout, piste et parc triés par distance ; agrès doublons fusionnés', () => {
    const from = { lat: 50.938, lon: 4.04 };
    const s = parseSpots(
      {
        elements: [
          { type: 'way', id: 1, center: { lat: 50.95, lon: 4.04 }, tags: { leisure: 'park', name: 'Stadspark' } },
          { type: 'node', id: 2, lat: 50.939, lon: 4.041, tags: { leisure: 'fitness_station' } },
          { type: 'node', id: 3, lat: 50.9391, lon: 4.0411, tags: { leisure: 'fitness_station' } },
          { type: 'way', id: 4, center: { lat: 50.945, lon: 4.03 }, tags: { leisure: 'track', sport: 'athletics' } },
          { type: 'node', id: 5, lat: 50.94, lon: 4.04, tags: { amenity: 'bench' } },
        ],
      },
      from,
    );
    expect(s.map((x) => x.kind)).toEqual(['street workout', 'piste', 'parc']);
    expect(s[0]!.meters).toBeGreaterThan(0);
    expect(s[2]!.name).toBe('Stadspark');
  });
});

describe('plan B Photon', () => {
  it('parcs proches gardés, lointains écartés', async () => {
    const { parsePhoton } = await import('../src/engine/spots');
    const s = parsePhoton({ features: [
      { geometry: { coordinates: [4.045, 50.952] }, properties: { osm_type: 'W', osm_id: 1, name: 'Park De Blieck' } },
      { geometry: { coordinates: [4.528, 50.825] }, properties: { osm_type: 'W', osm_id: 2, name: 'Park van Tervuren' } },
    ] }, { lat: 50.938, lon: 4.04 });
    expect(s.map((x) => x.name)).toEqual(['Park De Blieck']);
  });
});
