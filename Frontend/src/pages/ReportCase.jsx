import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, HandHeart, Map, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import useLocation from '../hooks/useLocation';
import useOfflineSync from '../hooks/useOfflineSync';
import { useToast } from '../contexts/ToastContext.jsx';
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import API from '../utils/api';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow
});

function MapViewportController({ center }) {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    map.flyTo(center, Math.max(map.getZoom(), 13), {
      duration: 0.65,
      easeLinearity: 0.25,
    });
  }, [map, center]);

  return null;
}

function MapPinDropper({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition({
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    }
  });

  return position === null ? null : (
    <Marker position={[position.lat, position.lng]} />
  );
}

export default function ReportCase() {
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  const [locationMode, setLocationMode] = useState('auto');
  const [manualAddress, setManualAddress] = useState('');
  const [pinnedLocation, setPinnedLocation] = useState(null);

  const { showToast } = useToast();

  const {
    location,
    error: gpsError,
    isLoading,
    getLocation
  } = useLocation();

  const { user } = useAuth();
  // Every role can report, and the backend always allows a reporter to
  // access their own case detail.
  const canOpenOwnCase = Boolean(user?.id);

  const {
    isOffline,
    saveForOfflineSync,
    syncCases
  } = useOfflineSync();

  // Neutral world view center as fallback when user location is unavailable
  const defaultMapCenter = [0, 0];

  useEffect(() => {
    if (gpsError) {
      setLocationMode('custom');
    }
  }, [gpsError]);

  useEffect(() => {
    getLocation();
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image.', 'error');
      return;
    }

    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {
      showToast('Please select an image smaller than 10 MB.', 'warning');
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    if (!location && locationMode === 'auto') {
      getLocation();
    }
  };

  const getFinalLocation = () => {
    if (locationMode === 'auto' && location) {
      return {
        lat: location.lat,
        lng: location.lng,
        address: manualAddress.trim() || null,
        isCustom: false
      };
    }

    if (locationMode === 'custom') {
      return {
        lat: pinnedLocation?.lat ?? location?.lat ?? null,
        lng: pinnedLocation?.lng ?? location?.lng ?? null,
        address: manualAddress.trim() || null,
        isCustom: true
      };
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    const finalLocation = getFinalLocation();

    if (!imageFile) {
      return;
    }

    const hasCoordinates =
      finalLocation?.lat != null &&
      finalLocation?.lng != null;

    const hasAddress =
      Boolean(finalLocation?.address?.trim());

    if (!hasCoordinates && !hasAddress) {
      showToast('Please provide a valid GPS location, map pin, or landmark.', 'warning');
      return;
    }

    /*
     * A complete offline photo report is not supported by the
     * current Cloudinary + localStorage architecture.
     *
     * The image must first be uploaded to Cloudinary to obtain
     * a URL that can safely be stored in the offline retry queue.
     */
    if (isOffline) {
      showToast('You are currently offline. Please reconnect to the internet to submit the rescue report.', 'warning');
      return;
    }

    setIsSubmitting(true);
    setSubmissionResult(null);

    try {
      // ---------------------------------------------------------
      // 1. Get a short-lived signed Cloudinary upload authorization
      // ---------------------------------------------------------
      const signatureResponse = await API.post('/cases/upload-signature');
      const {
        cloudName,
        apiKey,
        timestamp,
        signature,
        resourceType = 'image',
      } = signatureResponse.data || {};

      if (!cloudName || !apiKey || !timestamp || !signature) {
        throw new Error('Image upload authorization could not be created.');
      }

      // ---------------------------------------------------------
      // 2. Upload directly to Cloudinary without exposing the API secret
      // ---------------------------------------------------------
      const cloudinaryData = new FormData();
      cloudinaryData.append('file', imageFile);
      cloudinaryData.append('api_key', apiKey);
      cloudinaryData.append('timestamp', String(timestamp));
      cloudinaryData.append('signature', signature);

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        {
          method: 'POST',
          body: cloudinaryData,
        },
      );

      const cloudData = await cloudRes.json();

      if (!cloudRes.ok) {
        throw new Error(
          cloudData.error?.message ||
          'Cloudinary image upload failed.',
        );
      }

      const imageUrl = cloudData.secure_url;

      if (!imageUrl) {
        throw new Error('Cloudinary did not return an image URL.');
      }

      // ---------------------------------------------------------
      // 3. Send the lightweight report to Express.
      // The client request ID makes retries safe and idempotent.
      // ---------------------------------------------------------
      const clientRequestId = crypto.randomUUID();

      const reportData = {
        clientRequestId,
        location: finalLocation,
        description: description.trim(),
        imageUrl,
      };

      try {
        const response = await API.post(
          '/cases/report',
          reportData
        );

        setSubmissionResult({
          success: true,
          reportId: response.data?.reportId || response.data?.case?.id || null,
          status:
            response.data?.status ||
            response.data?.case?.status ||
            'PENDING_VALIDATION'
        });

        clearForm();
      } catch (apiError) {
        /*
         * Cloudinary upload succeeded, but backend submission failed.
         * The report now contains only lightweight serializable data,
         * so it can safely be placed in the retry queue.
         *
         * Two genuinely different situations land here, and they need
         * different messages:
         *
         * - No response at all (apiError.response is undefined): a
         *   real network failure. The existing "reconnect and it will
         *   sync" framing is accurate.
         *
         * - A response came back (e.g. 503 when the backend's queue
         *   to the AI worker is down): the user IS online, so the
         *   offline-sync hook's "retry on the browser's online event"
         *   will not fire on its own — nothing about connectivity
         *   changed. Say so plainly, and also attempt an immediate
         *   retry rather than silently waiting for a reload.
         */
        saveForOfflineSync(reportData);

        const isNetworkFailure = !apiError.response;

        if (isNetworkFailure) {
          throw new Error(
            'The image was uploaded, but the rescue report could not reach the server. It has been saved and will send automatically once you\'re back online.',
            { cause: apiError }
          );
        }

        setTimeout(() => {
          syncCases();
        }, 4000);

        throw new Error(
          apiError.response?.data?.error ||
          'The image was uploaded, but the server could not queue the report right now. It has been saved and we\'ll retry automatically in a few seconds \u2014 you can also just try submitting again.',
          { cause: apiError }
        );
      }
    } catch (err) {
      console.error('Report submission failed:', err);

      showToast(
        err.message || 'Server error. Case could not be submitted.',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearForm = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImagePreview(null);
    setImageFile(null);
    setDescription('');
    setManualAddress('');
    setPinnedLocation(null);
    setLocationMode('auto');

    getLocation();
  };

  const resetForm = () => {
    setSubmissionResult(null);
    clearForm();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10 transition-colors duration-300">
      <div className="rounded-2xl p-6 md:p-8 relative transition-colors duration-300 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">

        <h2 className="text-2xl font-extrabold mb-6 text-stone-800 dark:text-stone-100 text-center">
          Emergency Report
        </h2>

        {submissionResult ? (
          <div className="text-center space-y-6 animate-rescue-fade-up" role="status" aria-live="polite">

            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 animate-rescue-pop">
                <CheckCircle2 size={44} strokeWidth={2} aria-hidden="true" />
              </div>
            </div>

            <div>
              <h3 className="font-extrabold text-xl text-stone-800 dark:text-stone-100">
                Report received
              </h3>

              {submissionResult.reportId && (
                <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  Case #{submissionResult.reportId}
                </p>
              )}

              <p className="text-sm text-stone-500 dark:text-stone-400 mt-2">
                Thank you for speaking up for this animal. AI validation has started.
              </p>
            </div>

            <ol className="text-left space-y-3 p-4 rounded-xl bg-stone-100/70 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800/60">
              <li className="flex items-start gap-3">
                <Search size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-sm text-stone-600 dark:text-stone-300">
                  <strong className="text-stone-800 dark:text-stone-100">AI check</strong> — we confirm the photo shows an animal that needs help.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <HandHeart size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-sm text-stone-600 dark:text-stone-300">
                  <strong className="text-stone-800 dark:text-stone-100">Rescuer</strong> — once verified, a volunteer or partner organization can take the case.
                </span>
              </li>
            </ol>

            <div className="space-y-3">
              {canOpenOwnCase && submissionResult.reportId && (
                <Link
                  to={`/cases/${submissionResult.reportId}`}
                  className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-xl font-bold text-center transition-colors"
                >
                  View Case
                </Link>
              )}

              <button
                type="button"
                onClick={resetForm}
                className="w-full p-4 rounded-xl font-bold text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              >
                Report Another Case
              </button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]"
            onSubmit={handleSubmit}
          >

            <div className="space-y-6">{/* IMAGE */}
              <div>
                <input
                  type="file"
                  id="cameraInput"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />

                <label
                  htmlFor="cameraInput"
                  className={`block overflow-hidden transition-all duration-300 cursor-pointer rounded-2xl bg-white dark:bg-stone-900 ${imagePreview
                    ? 'border border-stone-200 dark:border-stone-800 shadow-sm border-2 border-emerald-500/50'
                    : 'border border-stone-200 dark:border-stone-800'
                    }`}
                >
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Selected rescue animal"
                      className="w-full h-auto object-contain rounded-xl rescue-image-fade"
                    />
                  ) : (
                    <div className="p-10 flex flex-col items-center justify-center h-56">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
                        <Camera size={28} strokeWidth={2} aria-hidden="true" />
                      </div>

                      <p className="text-sm text-stone-500 font-bold">
                        Tap to take or select a photo
                      </p>
                    </div>
                  )}
                </label>
              </div>

              {/* LOCATION */}
              <div>
                <label className="block text-xs uppercase tracking-wider font-bold text-stone-500 dark:text-stone-400 mb-2 ml-2">
                  Location
                </label>

                <div className="flex gap-1 mb-4 p-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">

                  <button
                    type="button"
                    onClick={() => {
                      setLocationMode('auto');

                      if (!location) {
                        getLocation();
                      }
                    }}
                    className={`flex-1 py-2.5 rounded-lg text-xs uppercase tracking-wide font-bold transition-all duration-300 ${locationMode === 'auto'
                      ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.22)]'
                      : 'text-stone-500 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                  >
                    Auto GPS
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setLocationMode('custom')
                    }
                    className={`flex-1 py-2.5 rounded-lg text-xs uppercase tracking-wide font-bold transition-all duration-300 ${locationMode === 'custom'
                      ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.22)]'
                      : 'text-stone-500 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                  >
                    Pin & Describe
                  </button>
                </div>

                <div className="animate-fade-in">

                  {locationMode === 'auto' ? (
                    <div className="space-y-3">

                      <input
                        type="text"
                        readOnly
                        value={
                          isLoading
                            ? 'Getting your location...'
                            : location
                              ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                              : 'Location unavailable'
                        }
                        className={`w-full p-4 rounded-xl text-sm font-bold outline-none border-none transition-all duration-300 bg-white dark:bg-stone-900 ${location
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-stone-400'
                          } border border-stone-200 dark:border-stone-800`}
                      />

                      <input
                        type="text"
                        value={manualAddress}
                        onChange={(e) =>
                          setManualAddress(e.target.value)
                        }
                        placeholder="Add a Landmark (optional)"
                        className="w-full p-4 rounded-xl text-sm font-medium text-stone-700 dark:text-stone-200 outline-none border-none transition-all duration-300 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800"
                      />

                    </div>
                  ) : (
                    <div className="space-y-4">

                      {!isOffline ? (
                        <div className="rounded-2xl overflow-hidden h-48 border border-stone-200 dark:border-stone-800 border border-stone-300/50 dark:border-white/5 relative z-0">

                          <MapContainer
                            center={
                              location
                                ? [location.lat, location.lng]
                                : defaultMapCenter
                            }
                            zoom={13}
                            scrollWheelZoom={true}
                            className="w-full h-full"
                            maxBounds={[[-85.05112878, -180], [85.05112878, 180]]}
                            maxBoundsViscosity={1}
                            worldCopyJump={false}
                          >
                            <MapViewportController
                              center={location ? [location.lat, location.lng] : null}
                            />
                            <TileLayer
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            <MapPinDropper
                              position={pinnedLocation}
                              setPosition={setPinnedLocation}
                            />
                          </MapContainer>

                          {!pinnedLocation && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full z-[400] backdrop-blur-sm pointer-events-none">
                              Tap map to drop pin
                            </div>
                          )}

                        </div>
                      ) : (
                        <div className="rounded-2xl h-32 flex flex-col items-center justify-center text-center p-4 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">

                          <span className="text-3xl mb-2 grayscale opacity-50">
                            <Map size={28} strokeWidth={2} aria-hidden="true" />
                          </span>

                          <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                            Map offline
                          </p>

                          <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 font-medium">
                            Please provide a descriptive landmark below.
                          </p>

                        </div>
                      )}

                      <input
                        type="text"
                        value={manualAddress}
                        onChange={(e) =>
                          setManualAddress(e.target.value)
                        }
                        placeholder="Add a Landmark (optional)"
                        className="w-full p-4 rounded-xl text-sm font-medium text-stone-700 dark:text-stone-200 outline-none border-none transition-all duration-300 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800"
                      />

                    </div>
                  )}
                </div>
              </div>

              {/* DESCRIPTION */}
              <div className="space-y-2">
                <label className="block text-xs uppercase tracking-wider font-bold text-stone-500 dark:text-stone-400 ml-2">
                  Description (optional)
                </label>

                <textarea
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value)
                  }
                  placeholder="Describe the animal's condition, injury, or situation..."
                  className="w-full p-4 rounded-xl text-sm font-medium text-stone-700 dark:text-stone-200 outline-none border-none transition-all duration-300 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 h-24 resize-none"
                />

                <p className="text-[11px] text-stone-400 dark:text-stone-500 ml-2">
                  Example: "Dog has an injured back leg and is unable to walk."
                </p>
              </div>
            </div>

            {/* SECOND COLUMN - Submit button only */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-950">
                {/* SUBMIT */}
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    isOffline ||
                    !imageFile ||
                    (locationMode === 'auto' && !location) ||
                    (
                      locationMode === 'custom' &&
                      !pinnedLocation &&
                      !manualAddress.trim()
                    )
                  }
                  className="w-full relative group mt-6 disabled:opacity-50"
                >
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3/4 h-5 bg-rose-500 blur-lg rounded-full transition-all duration-300 group-hover:bg-rose-400"></div>

                  <div className="relative z-10 w-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 p-4 rounded-xl font-bold text-lg transition-all border-t border-white/20 shadow-[0_8px_20px_rgba(0,0,0,0.4)] flex justify-center items-center gap-2">
                    {isSubmitting
                      ? 'Processing...'
                      : isOffline
                        ? 'Waiting for Internet'
                        : 'Transmit Rescue Alert'}
                  </div>
                </button>

              </div></div></form>
        )}
      </div>
    </div >
  );
}