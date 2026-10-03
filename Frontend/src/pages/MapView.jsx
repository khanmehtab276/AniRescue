import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import {
  AlertTriangle, Crosshair, Filter, HeartHandshake, MapPin, PawPrint,
  RefreshCw, Shield, Siren, Users,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import API from '../utils/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import useLocation from '../hooks/useLocation';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { getStatusConfig, TONE_CLASSES } from '../utils/statusConfig.js';

const INITIAL_CENTER = [20, 0];

const ROLE_CONFIG = {
  user: {
    title: 'Your Rescue Map',
    eyebrow: 'My reports',
    description: 'Follow the animals you have reported and their rescue progress.',
    empty: 'You have no active mapped rescue reports.',
    note: 'Only your own active reports are shown here.',
    icon: PawPrint,
    filters: [['all', 'All'], ['active', 'Active'], ['rescue', 'Rescue']],
  },
  volunteer: {
    title: 'Rescue Dispatch',
    eyebrow: 'Field response',
    description: 'Find validated cases that need a responder and follow your active rescue.',
    empty: 'No available or active mapped rescues right now.',
    note: 'Available cases and your active rescue are shown here.',
    icon: Siren,
    filters: [['all', 'All'], ['available', 'Available'], ['urgent', 'Priority'], ['rescue', 'In rescue']],
  },
  ngo: {
    title: 'NGO Rescue Map',
    eyebrow: 'Local operations',
    description: 'Monitor active rescue activity within your organisation’s operating area.',
    empty: 'No active mapped cases are available for your operational view.',
    note: 'Your NGO operational map is focused on active rescue work.',
    icon: HeartHandshake,
    filters: [['all', 'All'], ['available', 'Unassigned'], ['urgent', 'Priority'], ['rescue', 'In rescue']],
  },
  admin: {
    title: 'Rescue Operations',
    eyebrow: 'System overview',
    description: 'Monitor active rescue activity across the AniRescue platform.',
    empty: 'No active mapped rescue cases.',
    note: 'You are viewing the system-wide active rescue picture.',
    icon: Shield,
    filters: [['all', 'All active'], ['available', 'Available'], ['urgent', 'Priority'], ['rescue', 'In rescue']],
  },
};

const COLORS = {
  info: '#64748b',
  success: '#059669',
  warning: '#f59e0b',
  danger: '#e11d48',
  neutral: '#64748b',
};

function MapViewportController({ center, request }) {
  const map = useMap();

  useEffect(() => {
    if (!center || !request) return;
    map.flyTo(center, Math.max(map.getZoom(), 13), {
      duration: 0.65,
      easeLinearity: 0.25,
    });
  }, [map, center, request]);

  return null;
}

function markerIcon(status, priority) {
  const tone = getStatusConfig(status).tone;
  const color = priority === 'CRITICAL' ? '#e11d48' : priority === 'HIGH' ? '#f97316' : COLORS[tone] || COLORS.neutral;

  return L.divIcon({
    className: 'anirescue-map-marker',
    html: `<div class="anirescue-marker-core" style="--marker-color:${color}"><span></span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

function matches(item, filter) {
  if (filter === 'available') return item.status === 'VALIDATION_PASSED' && !item.assigned_volunteer_id;
  if (filter === 'urgent') return item.priority === 'CRITICAL' || item.priority === 'HIGH';
  if (filter === 'rescue') return item.status === 'IN_PROGRESS' || item.status === 'RESCUE_COMPLETED';
  if (filter === 'active') return item.status !== 'RESCUE_COMPLETED';
  return true;
}

function Stat({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:shadow-black/20">
      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">{icon}<span className="text-[10px] font-black uppercase tracking-wider text-stone-400">{label}</span></div>
      <p className="mt-2 text-xl font-black text-stone-800 dark:text-stone-100">{value}</p>
    </div>
  );
}

export default function MapView() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const role = (user?.role || 'USER').toLowerCase();
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.user;
  const RoleIcon = config.icon;
  const isDark = theme === 'dark';
  const cartoKey = import.meta.env.VITE_CARTO_API_KEY?.trim();

  const tileUrl = cartoKey
    ? isDark
      ? `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
      : `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const tileAttribution = cartoKey
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const [mapCases, setMapCases] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [recenterRequest, setRecenterRequest] = useState(0);
  const { location: currentLocation, getLocation, isLoading: locating } = useLocation();

  const loadMap = async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await API.get('/cases/map');
      const valid = (Array.isArray(data) ? data : []).filter((item) => {
        const lat = Number(item.latitude);
        const lng = Number(item.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
      });
      setMapCases(valid);
    } catch (err) {
      console.error('Failed to load rescue map:', err);
      setError(err.response?.data?.error || 'Unable to load rescue cases right now.');
      setMapCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMap(); }, [role]);

  // The map is location-aware, but it must not assume the user is in India.
  // Ask the browser for the device's current location and recenter when it arrives.
  useEffect(() => {
    getLocation();
  }, []);

  useEffect(() => {
    if (currentLocation) setRecenterRequest((value) => value + 1);
  }, [currentLocation]);

  const visibleCases = useMemo(() => mapCases.filter((item) => matches(item, filter)), [mapCases, filter]);
  const urgent = mapCases.filter((item) => item.priority === 'CRITICAL' || item.priority === 'HIGH').length;
  const available = mapCases.filter((item) => item.status === 'VALIDATION_PASSED' && !item.assigned_volunteer_id).length;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 md:px-8 md:pb-8 md:pt-8">
      <header className="mb-5 flex items-start justify-between gap-4 animate-rescue-fade-up">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800/60">
            <RoleIcon size={23} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">{config.eyebrow}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900 dark:text-stone-50 md:text-3xl">{config.title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-stone-500 dark:text-stone-400">{config.description}</p>
          </div>
        </div>
        <button onClick={loadMap} disabled={loading} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 shadow-sm transition-all dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 hover:-translate-y-0.5 hover:text-emerald-700 active:scale-95" aria-label="Refresh map">
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<MapPin size={16} />} label="Mapped" value={mapCases.length} />
        <Stat icon={<Siren size={16} />} label={role === 'user' ? 'My reports' : 'Available'} value={role === 'user' ? mapCases.length : available} />
        <Stat icon={<AlertTriangle size={16} />} label="Priority" value={urgent} />
        <Stat icon={<Users size={16} />} label="View" value={role === 'admin' ? 'Global' : 'Role'} />
      </section>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 rescue-stagger">
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"><Filter size={14} /> View</div>
        {config.filters.map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 active:scale-95 ${filter === value ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/20' : 'border border-stone-200 bg-white text-stone-600 hover:-translate-y-0.5 hover:border-emerald-200 hover:text-emerald-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-emerald-700 dark:hover:text-emerald-300'}`}>
            {label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white p-2 shadow-[0_14px_40px_rgba(41,37,36,0.08)] dark:border-stone-800 dark:bg-stone-900 dark:shadow-black/30 md:p-3">
        <div className="relative h-[62vh] min-h-[480px] overflow-hidden rounded-[1.15rem] bg-emerald-50 dark:bg-stone-950">
          {loading && (
            <div className="absolute inset-0 z-[1000] grid place-items-center bg-white/90 backdrop-blur-sm dark:bg-stone-950/90">
              <div className="rounded-2xl border border-stone-200 bg-white px-5 py-4 text-center shadow-xl dark:border-stone-800 dark:bg-stone-900 animate-rescue-pop">
                <PawPrint size={28} className="mx-auto mb-2 animate-pulse text-emerald-600" />
                <p className="text-sm font-bold text-stone-700 dark:text-stone-200">Loading rescue activity...</p>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 z-[1000] grid place-items-center bg-white px-6 text-center dark:bg-stone-950">
              <div className="animate-rescue-fade-up">
                <AlertTriangle size={38} className="mx-auto mb-3 text-amber-500" />
                <p className="font-black text-stone-800 dark:text-stone-100">Map unavailable</p>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{error}</p>
                <button onClick={loadMap} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white active:scale-95">Try again</button>
              </div>
            </div>
          )}

          {!loading && !error && (
            <MapContainer center={currentLocation ? [currentLocation.lat, currentLocation.lng] : INITIAL_CENTER} zoom={currentLocation ? 12 : 2} minZoom={2} maxBounds={[[-85, -180], [85, 180]]} maxBoundsViscosity={1} className="h-full w-full">
              <MapViewportController
                center={currentLocation ? [currentLocation.lat, currentLocation.lng] : null}
                request={recenterRequest}
              />
              <TileLayer attribution={tileAttribution} url={tileUrl} />
              {visibleCases.map((item) => (
                <Marker
                  key={item.id}
                  position={[Number(item.latitude), Number(item.longitude)]}
                  icon={markerIcon(item.status, item.priority)}
                  eventHandlers={{ click: () => setSelectedCase(item) }}
                >
                  <Popup>
                    <div className="min-w-[205px] p-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Case #{item.id}</p>
                          <h3 className="mt-0.5 text-sm font-black capitalize text-stone-800">{item.species || 'Animal in need'}</h3>
                        </div>
                        <PawPrint size={18} className="text-emerald-600" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${TONE_CLASSES[getStatusConfig(item.status).tone]}`}>{getStatusConfig(item.status).shortLabel}</span>
                        {item.priority && item.priority !== 'STANDARD' && <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">{item.priority}</span>}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}

          {!loading && !error && (
            <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
              <button type="button" onClick={() => { if (!currentLocation) getLocation(); else setRecenterRequest((value) => value + 1); }} disabled={locating} className="rescue-focus-ring grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white/95 text-stone-600 shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:text-emerald-700 disabled:opacity-60 dark:border-stone-800 dark:bg-stone-900/95 dark:text-stone-300 dark:hover:text-emerald-300" aria-label="Center map on my location" title="My location">
                <Crosshair size={18} className={locating ? "animate-spin" : ""} />
              </button>
            </div>
          )}

          {!loading && !error && selectedCase && (
            <div className="absolute inset-x-3 bottom-3 z-[500] animate-rescue-fade-up md:left-1/2 md:right-auto md:w-[min(92%,430px)] md:-translate-x-1/2">
              <div className="rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-2xl backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900/95">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Case #{selectedCase.id}</p>
                    <h3 className="mt-0.5 truncate text-sm font-black capitalize text-stone-900 dark:text-stone-100">{selectedCase.species || "Animal in need"}</h3>
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{getStatusConfig(selectedCase.status).shortLabel}{selectedCase.priority && selectedCase.priority !== "STANDARD" ? " · " + selectedCase.priority : ""}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedCase(null)} className="rescue-focus-ring rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-100" aria-label="Close selected case">×</button>
                </div>
                <Link to={"/cases/" + selectedCase.id} className="rescue-focus-ring mt-3 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98]">Open case</Link>
              </div>
            </div>
          )}

          {!loading && !error && visibleCases.length === 0 && (
            <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex justify-center">
              <div className="rounded-2xl border border-stone-200 bg-white/95 px-4 py-3 text-center shadow-lg dark:border-stone-800 dark:bg-stone-900/95 backdrop-blur-sm animate-rescue-pop">
                <p className="text-sm font-black text-stone-700 dark:text-stone-100">No cases match this view</p>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Try another filter.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 px-2 pb-1 pt-3">
          <LegendItem color="#e11d48" label="Critical" />
          <LegendItem color="#f97316" label="High" />
          <LegendItem color="#059669" label="Standard" />
          <LegendItem color="#64748b" label="AI review" />
        </div>
      </section>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">
        <Crosshair size={15} className="mt-0.5 shrink-0 text-emerald-700" />
        <p>{config.note}</p>
      </div>

      {!loading && !error && mapCases.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center dark:border-stone-700 dark:bg-stone-900">
          <MapPin size={26} className="mx-auto mb-2 text-stone-400" />
          <p className="text-sm font-bold text-stone-700 dark:text-stone-200">{config.empty}</p>
        </div>
      )}
    </main>
  );
}

function LegendItem({ color, label }) {
  return <div className="flex items-center gap-2 text-xs font-semibold text-stone-600 dark:text-stone-300"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</div>;
}
