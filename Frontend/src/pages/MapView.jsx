import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapPin, AlertTriangle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import API from '../utils/api.js';
import { getStatusConfig, TONE_CLASSES } from '../utils/statusConfig.js';

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {label}
    </div>
  );
}

// Color-coded pins by urgency instead of Leaflet's default blue marker —
// red/unassigned needs a volunteer now, amber/in-progress is being
// handled, emerald/awaiting-verification is nearly resolved.
const MARKER_HEX = {
  info: '#64748b',    // slate — still in AI validation
  success: '#059669', // emerald — verified/nearly resolved
  warning: '#f59e0b', // amber — rescue in progress
  danger: '#e11d48',  // rose — rejected (shouldn't normally appear on map)
  neutral: '#64748b',
};

function buildMarkerIcon(status) {
  const { tone } = getStatusConfig(status);
  const color = MARKER_HEX[tone] || MARKER_HEX.neutral;

  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  });
}

export default function MapView() {
  const [mapCases, setMapCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Default map center
  const defaultCenter = [19.0760, 72.8777];

  useEffect(() => {
    const fetchMapData = async () => {
      try {
        setIsLoading(true);
        setError('');

        const response = await API.get('/cases/map');

        const data = Array.isArray(response.data)
          ? response.data
          : [];

        // Keep only cases with valid geographic coordinates
        const validCases = data.filter((caseItem) => {
          const latitude = Number(caseItem.latitude);
          const longitude = Number(caseItem.longitude);

          return (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180
          );
        });

        setMapCases(validCases);
      } catch (error) {
        console.error('Failed to load map pins:', error);
        setError('Unable to load rescue cases right now.');
        setMapCases([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMapData();
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto mb-20 md:mb-0 transition-colors duration-300">

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm text-emerald-600 dark:text-emerald-400">
          <MapPin size={22} strokeWidth={2.2} />
        </div>

        <div>
          <h2 className="text-2xl font-extrabold text-stone-900 dark:text-stone-100">
            Live Rescue Map
          </h2>

          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
            Active rescue cases with available location data.
          </p>
        </div>
      </div>

      {/* Legend — matches the same status/tone mapping used by badges and markers. */}
      <div className="flex flex-wrap items-center gap-4 mb-4 px-1">
        <LegendItem color={MARKER_HEX.info} label="AI review" />
        <LegendItem color={MARKER_HEX.success} label="Verified — awaiting rescue" />
        <LegendItem color={MARKER_HEX.warning} label="Rescue in progress" />
        <LegendItem color={MARKER_HEX.info} label="Awaiting verification" />
      </div>

      {/* Map Container */}
      <div className="rounded-2xl p-4 md:p-6 transition-colors duration-300 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">

        <div className="rounded-2xl overflow-hidden h-[60vh] md:h-[70vh] relative border border-stone-200 dark:border-stone-800 z-0">

          {/* Loading */}
          {isLoading && (
            <div className="flex h-full items-center justify-center font-bold text-stone-500 dark:text-stone-400">
              Loading rescue cases...
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <AlertTriangle size={36} className="mx-auto mb-3 text-amber-500" strokeWidth={2} />

                <p className="font-bold text-stone-700 dark:text-stone-200">
                  {error}
                </p>

                <p className="text-sm text-stone-500 dark:text-stone-400 mt-2">
                  Please try again later.
                </p>
              </div>
            </div>
          )}

          {/* Map */}
          {!isLoading && !error && (
            <MapContainer
              center={defaultCenter}
              zoom={12}
              minZoom={2}
              maxBounds={[[-85, -180], [85, 180]]}
              maxBoundsViscosity={1.0}
              className="w-full h-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {mapCases.map((caseItem) => {
                const latitude = Number(caseItem.latitude);
                const longitude = Number(caseItem.longitude);

                return (
                  <Marker
                    key={caseItem.id}
                    position={[latitude, longitude]}
                    icon={buildMarkerIcon(caseItem.status)}
                  >
                    <Popup className="rounded-xl overflow-hidden shadow-lg">
                      <div className="p-1 min-w-[180px]">

                        <h4 className="font-bold text-stone-800 text-sm mb-1">
                          {caseItem.species || 'Unknown Animal'}
                        </h4>

                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-block px-2 py-1 text-[10px] font-bold rounded-full ${TONE_CLASSES[getStatusConfig(caseItem.status).tone]}`}
                          >
                            {getStatusConfig(caseItem.status).shortLabel}
                          </span>

                          {caseItem.priority && caseItem.priority !== 'STANDARD' && (
                            <span className="text-[10px] font-semibold text-rose-600">
                              {caseItem.priority}
                            </span>
                          )}
                        </div>

                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}

        </div>

        {/* Empty State */}
        {!isLoading && !error && mapCases.length === 0 && (
          <div className="text-center py-5">
            <p className="text-sm font-semibold text-stone-600 dark:text-stone-300">
              No active rescue cases with valid locations.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}