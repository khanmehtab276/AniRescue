import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import API from '../utils/api.js';

// Fix Leaflet default marker icons in Vite
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

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
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[4px_4px_8px_#cbd5e1,_-4px_-4px_8px_#f8fafc] dark:shadow-[4px_4px_8px_#070a13,_-4px_-4px_8px_#172441]">
          🗺️
        </div>

        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">
            Live Rescue Map
          </h2>

          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Active rescue cases with available location data.
          </p>
        </div>
      </div>

      {/* Map Container */}
      <div className="rounded-[2rem] p-4 md:p-6 transition-colors duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[10px_10px_20px_#cbd5e1,_-10px_-10px_20px_#f8fafc] dark:shadow-[10px_10px_20px_#070a13,_-10px_-10px_20px_#172441]">

        <div className="rounded-2xl overflow-hidden h-[60vh] md:h-[70vh] relative shadow-[inset_6px_6px_12px_#cbd5e1,inset_-6px_-6px_12px_#f8fafc] dark:shadow-[inset_6px_6px_12px_#070a13,inset_-6px_-6px_12px_#172441] border border-gray-300/50 dark:border-white/5 z-0">

          {/* Loading */}
          {isLoading && (
            <div className="flex h-full items-center justify-center font-bold text-gray-500 dark:text-gray-400">
              Loading rescue cases...
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <div className="text-4xl mb-3">⚠️</div>

                <p className="font-bold text-gray-700 dark:text-gray-200">
                  {error}
                </p>

                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
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
                  >
                    <Popup className="rounded-xl overflow-hidden shadow-lg">
                      <div className="p-1 min-w-[180px]">

                        <h4 className="font-bold text-gray-800 text-sm mb-1">
                          {caseItem.species || 'Unknown Animal'}
                        </h4>

                        <p className="text-xs text-gray-600 mb-3">
                          {caseItem.issue_description || 'No description available.'}
                        </p>

                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-block px-2 py-1 bg-rose-100 text-rose-600 text-[10px] font-bold rounded-full">
                            {caseItem.priority || 'Normal'} Priority
                          </span>

                          <span className="text-[10px] font-semibold text-gray-500">
                            {caseItem.status || 'Active'}
                          </span>
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
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              No active rescue cases with valid locations.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}