// Spots autour de toi : street workout, pistes, parcs. Carte plein écran + liste par-dessus.
// Itinéraire : ouvert dans Plans (Apple) à pied. Courir ici : lance la course en direct.

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Dumbbell, Footprints, Navigation, Trees } from 'lucide-react';
import type { Map as LMap, LayerGroup } from 'leaflet';
import { overpassQuery, parsePhoton, parseSpots, photonUrl, type Spot, type SpotKind } from '../engine/spots';
import type { Route } from './App';
import type { Repository } from '../storage/db';
import { useConsent } from './Privacy';

const ICON: Record<SpotKind, React.ReactNode> = {
  'street workout': <Dumbbell size={16} aria-hidden="true" />,
  piste: <Footprints size={16} aria-hidden="true" />,
  parc: <Trees size={16} aria-hidden="true" />,
};

/** Serveurs Overpass publics : on essaie le suivant si l'un est saturé (429) ou trop lent. */
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

async function fetchOverpass(query: string): Promise<{ elements?: [] } | undefined> {
  for (const url of MIRRORS) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(`${url}?data=${encodeURIComponent(query)}`, { signal: ctrl.signal });
      window.clearTimeout(t);
      if (res.ok) return await res.json();
    } catch {
      /* serveur suivant */
    }
  }
  return undefined;
}

const fmtDist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

export function SpotsPage({ repo, go }: { repo: Repository; go: (r: Route) => void }) {
  const gps = useConsent(repo, 'location');
  const osm = useConsent(repo, 'spots');
  const tiles = useConsent(repo, 'map');
  const [noMap, setNoMap] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [filter, setFilter] = useState<SpotKind | 'tout'>('tout');
  const [msg, setMsg] = useState<string | null>('Localisation…');
  const [mapReady, setMapReady] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<{ m: LMap; layer: LayerGroup; L: typeof import('leaflet') } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return setMsg('GPS indisponible.');
    (async () => {
    // Accords avant activation : GPS (lu sur l'appareil), puis envoi de la position arrondie à OpenStreetMap.
    if (!(await gps.ensure())) return setMsg('GPS non autorisé dans l’app (Réglages → Mes données).');
    if (!(await osm.ensure())) return setMsg('Recherche de spots non autorisée : rien n’a été envoyé (Réglages → Mes données).');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const here = { lat: p.coords.latitude, lon: p.coords.longitude };
        setPos(here);
        setMsg('Recherche des spots…');
        const json = await fetchOverpass(overpassQuery(here.lat, here.lon, 4000));
        if (!json) {
          // Plan B : au moins les parcs pour courir.
          try {
            const r = await fetch(photonUrl(here.lat, here.lon));
            const parks = parsePhoton(await r.json(), here);
            setSpots(parks);
            return setMsg(parks.length ? 'Street workout et pistes momentanément indisponibles (serveurs saturés) : parcs seulement.' : 'Serveurs OpenStreetMap saturés : réessaie dans une minute.');
          } catch {
            return setMsg('Pas de connexion : réessaie plus tard.');
          }
        }
        const s = parseSpots(json, here);
        setSpots(s);
        setMsg(s.length ? null : 'Aucun spot trouvé à moins de 4 km.');
      },
      () => setMsg('Autorise la localisation pour trouver les spots autour de toi.'),
      { enableHighAccuracy: false, timeout: 15000 },
    );
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pos || !mapEl.current || map.current) return;
    (async () => {
      if (!(await tiles.ensure())) return setNoMap(true);
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      const m = L.map(mapEl.current!, { zoomControl: false }).setView([pos.lat, pos.lon], 15);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      L.circleMarker([pos.lat, pos.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(m);
      map.current = { m, layer: L.layerGroup().addTo(m), L };
      setMapReady(true);
      window.setTimeout(() => m.invalidateSize(), 50);
    })();
  }, [pos]);

  const shown = (spots ?? []).filter((s) => filter === 'tout' || s.kind === filter).slice(0, 25);

  useEffect(() => {
    const mm = map.current;
    if (!mm) return;
    mm.layer.clearLayers();
    for (const s of shown) {
      mm.L.circleMarker([s.lat, s.lon], { radius: 7, color: '#0f1729', weight: 2, fillColor: s.kind === 'street workout' ? '#f59e0b' : s.kind === 'piste' ? '#ef4444' : '#22c55e', fillOpacity: 1 })
        .bindTooltip(s.name)
        .addTo(mm.layer);
    }
  }, [shown.map((s) => s.id).join(), mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="spots">
      <div ref={mapEl} className="spots-map" aria-label="Carte des spots" hidden={noMap} />
      <header className="spots-top">
        <button className="icon-btn" aria-label="Retour" onClick={() => go({ name: 'coach' })}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="chips">
          {(['tout', 'street workout', 'piste', 'parc'] as const).map((k) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k === 'tout' ? 'Tout' : k === 'street workout' ? 'Street workout' : k === 'piste' ? 'Pistes' : 'Parcs'}
            </button>
          ))}
        </div>
      </header>
      {gps.modal}
      {osm.modal}
      {tiles.modal}
      <section className="spots-sheet" aria-label="Spots à proximité">
        {msg && <p className="muted" style={{ margin: 0 }}>{msg}</p>}
        {noMap && <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Carte non chargée (accord refusé) : liste seulement.</p>}
        <ul className="spots-list">
          {shown.map((s) => (
            <li key={s.id} onClick={() => map.current?.m.setView([s.lat, s.lon], 17, { animate: true })}>
              <span className={`spot-ico k-${s.kind.replace(' ', '-')}`}>{ICON[s.kind]}</span>
              <span className="grow">
                <strong>{s.name}</strong>
                <small className="num">
                  {s.kind} · {fmtDist(s.meters)}
                </small>
              </span>
              <a className="icon-btn" aria-label={`Itinéraire à pied vers ${s.name}`} href={`https://maps.apple.com/?daddr=${s.lat},${s.lon}&dirflg=w`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                <Navigation size={16} aria-hidden="true" />
              </a>
              {s.kind !== 'street workout' && (
                <button className="btn sm primary" onClick={(e) => (e.stopPropagation(), go({ name: 'run' }))}>
                  Courir
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="muted" style={{ margin: 0, fontSize: '0.7rem' }}>Données OpenStreetMap (bénévoles) : vérifie sur place. Position envoyée arrondie à ~1 km.</p>
      </section>
    </div>
  );
}
