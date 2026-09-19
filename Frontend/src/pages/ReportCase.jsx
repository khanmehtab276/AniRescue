import { useState, useEffect } from 'react';
import useLocation from '../hooks/useLocation';
import useOfflineSync from '../hooks/useOfflineSync';
import { useToast } from '../contexts/ToastContext.jsx';
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents
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

  const {
    isOffline,
    saveForOfflineSync
  } = useOfflineSync();

  const defaultMapCenter = [19.0760, 72.8777];

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

    if (!description.trim()) {
      showToast('Please describe the animal\'s condition or situation.', 'warning');
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
      // 1. Upload image directly to Cloudinary
      // ---------------------------------------------------------
      const cloudinaryData = new FormData();

      cloudinaryData.append('file', imageFile);
      cloudinaryData.append(
        'upload_preset',
        'anirescue_uploads'
      );

      const cloudRes = await fetch(
        'https://api.cloudinary.com/v1_1/tsacc3bn/image/upload',
        {
          method: 'POST',
          body: cloudinaryData
        }
      );

      const cloudData = await cloudRes.json();

      if (!cloudRes.ok) {
        throw new Error(
          cloudData.error?.message ||
          'Cloudinary image upload failed.'
        );
      }

      const imageUrl = cloudData.secure_url;

      if (!imageUrl) {
        throw new Error(
          'Cloudinary did not return an image URL.'
        );
      }

      // ---------------------------------------------------------
      // 2. Send lightweight report to Express
      // ---------------------------------------------------------
      const reportData = {
        location: finalLocation,
        description: description.trim(),
        imageUrl
      };

      try {
        const response = await API.post(
          '/cases/report',
          reportData
        );

        setSubmissionResult({
          success: true,
          reportId: response.data?.reportId || null,
          status:
            response.data?.status ||
            'PENDING_VALIDATION'
        });

        resetForm();
      } catch (apiError) {
        /*
         * Cloudinary upload succeeded, but backend submission failed.
         * The report now contains only lightweight serializable data,
         * so it can safely be placed in the retry queue.
         */
        saveForOfflineSync(reportData);

        throw new Error(
          'The image was uploaded, but the rescue report could not reach the server. It has been saved for retry.',
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

  const resetForm = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setSubmissionResult(null);
    setImagePreview(null);
    setImageFile(null);
    setDescription('');
    setManualAddress('');
    setPinnedLocation(null);
    setLocationMode('auto');

    getLocation();
  };

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto mb-20 md:mb-0 transition-colors duration-300">
      <div className="rounded-[2rem] p-6 md:p-8 relative transition-colors duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[10px_10px_20px_#cbd5e1,_-10px_-10px_20px_#f8fafc] dark:shadow-[10px_10px_20px_#070a13,_-10px_-10px_20px_#172441]">

        <h2 className="text-2xl font-extrabold mb-6 text-gray-800 dark:text-gray-100 text-center">
          Emergency Report
        </h2>

        {submissionResult ? (
          <div className="text-center animate-fade-in space-y-6">

            <div className="flex justify-center mb-2">
              <div className="relative group">
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 h-6 bg-emerald-500 blur-xl rounded-full"></div>

                <div className="w-20 h-20 bg-[#1a1f2e] dark:bg-black rounded-full flex items-center justify-center text-4xl relative z-10 shadow-[0_8px_15px_rgba(0,0,0,0.4)]">
                  ✅
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">
                Rescue Report Submitted
              </h3>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Your report has been received and is being processed for AI validation.
              </p>

              {submissionResult.reportId && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                  Report ID: {submissionResult.reportId}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={resetForm}
              className="w-full bg-[#1a1f2e] dark:bg-black text-white p-4 rounded-xl font-bold shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 transition-all text-center"
            >
              Report Another Case
            </button>
          </div>
        ) : (
          <form
            className="space-y-6"
            onSubmit={handleSubmit}
          >

            {/* IMAGE */}
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
                className={`block overflow-hidden transition-all duration-300 cursor-pointer rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] ${
                  imagePreview
                    ? 'shadow-[4px_4px_10px_#cbd5e1,_-4px_-4px_10px_#f8fafc] dark:shadow-[4px_4px_10px_#070a13,_-4px_-4px_10px_#172441] border-2 border-emerald-500/50'
                    : 'shadow-[inset_6px_6px_12px_#cbd5e1,inset_-6px_-6px_12px_#f8fafc] dark:shadow-[inset_6px_6px_12px_#070a13,inset_-6px_-6px_12px_#172441]'
                }`}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Selected rescue animal"
                    className="w-full h-56 object-cover rounded-xl"
                  />
                ) : (
                  <div className="p-10 flex flex-col items-center justify-center h-56">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-4 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[4px_4px_10px_#cbd5e1,_-4px_-4px_10px_#f8fafc] dark:shadow-[4px_4px_10px_#070a13,_-4px_-4px_10px_#172441]">
                      📸
                    </div>

                    <p className="text-sm text-gray-500 font-bold">
                      Tap to take or select a photo
                    </p>
                  </div>
                )}
              </label>
            </div>

            {/* LOCATION */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-2 ml-2">
                Location
              </label>

              <div className="flex gap-1 mb-4 p-1.5 rounded-xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">

                <button
                  type="button"
                  onClick={() => {
                    setLocationMode('auto');

                    if (!location) {
                      getLocation();
                    }
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-xs uppercase tracking-wide font-bold transition-all duration-300 ${
                    locationMode === 'auto'
                      ? 'bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)]'
                      : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  Auto GPS
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setLocationMode('custom')
                  }
                  className={`flex-1 py-2.5 rounded-lg text-xs uppercase tracking-wide font-bold transition-all duration-300 ${
                    locationMode === 'custom'
                      ? 'bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)]'
                      : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/5'
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
                      className={`w-full p-4 rounded-xl text-sm font-bold outline-none border-none transition-all duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] ${
                        location
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-gray-400'
                      } shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]`}
                    />

                    <input
                      type="text"
                      value={manualAddress}
                      onChange={(e) =>
                        setManualAddress(e.target.value)
                      }
                      placeholder="Add a Landmark (optional)"
                      className="w-full p-4 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 outline-none border-none transition-all duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]"
                    />

                  </div>
                ) : (
                  <div className="space-y-4">

                    {!isOffline ? (
                      <div className="rounded-2xl overflow-hidden h-48 shadow-[inset_6px_6px_12px_#cbd5e1,inset_-6px_-6px_12px_#f8fafc] dark:shadow-[inset_6px_6px_12px_#070a13,inset_-6px_-6px_12px_#172441] border border-gray-300/50 dark:border-white/5 relative z-0">

                        <MapContainer
                          center={
                            location
                              ? [location.lat, location.lng]
                              : defaultMapCenter
                          }
                          zoom={13}
                          scrollWheelZoom={true}
                          className="w-full h-full"
                        >
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
                      <div className="rounded-2xl h-32 flex flex-col items-center justify-center text-center p-4 shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441] bg-[#e2e8f0] dark:bg-[#0f172a]">

                        <span className="text-3xl mb-2 grayscale opacity-50">
                          🗺️
                        </span>

                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Map offline
                        </p>

                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-medium">
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
                      className="w-full p-4 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 outline-none border-none transition-all duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]"
                    />

                  </div>
                )}
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 ml-2">
                Description (optional)
              </label>

              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
                placeholder="Describe the animal's condition, injury, or situation..."
                className="w-full p-4 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 outline-none border-none transition-all duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441] h-24 resize-none"
              />

              <p className="text-[11px] text-gray-400 dark:text-gray-500 ml-2">
                Example: "Dog has an injured back leg and is unable to walk."
              </p>
            </div>

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

              <div className="relative z-10 w-full bg-[#1a1f2e] dark:bg-black text-white p-4 rounded-xl font-bold text-lg transition-all border-t border-white/20 shadow-[0_8px_20px_rgba(0,0,0,0.4)] flex justify-center items-center gap-2">
                {isSubmitting
                  ? 'Processing...'
                  : isOffline
                    ? 'Waiting for Internet'
                    : 'Transmit Rescue Alert'}
              </div>
            </button>

          </form>
        )}
      </div>
    </div>
  );
}