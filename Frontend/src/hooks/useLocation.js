import { useEffect, useRef, useState } from 'react';

export default function useLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const watchIdRef = useRef(null);

  const stopLocationDetection = () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsLoading(false);
  };

  const getLocation = () => {
    stopLocationDetection();
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setIsLoading(false);
      return;
    }

    // Use a cancellable watch for the one location fix. As soon as the
    // browser gives us a position, clear the watch so detection cannot
    // continue running in the background.
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }

        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLoading(false);
      },
      (err) => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }

        let message = 'Unable to get your location.';

        if (err.code === 1) {
          message = 'Location permission was denied.';
        } else if (err.code === 2) {
          message = 'Your location could not be determined.';
        } else if (err.code === 3) {
          message = 'Location request timed out. Please try again.';
        }

        setError(message);
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    watchIdRef.current = watchId;
  };

  useEffect(() => () => stopLocationDetection(), []);

  return {
    location,
    error,
    isLoading,
    getLocation,
    stopLocationDetection,
  };
}
